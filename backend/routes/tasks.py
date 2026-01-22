"""
Routes pour le suivi des tasks Celery via Redis Pub/Sub.

Architecture push temps réel:
    Task Celery → Redis PUBLISH → SSE endpoint → EventSource client

Endpoints:
- GET /tasks/{task_id}/status - Statut ponctuel (fallback)
- GET /tasks/{task_id}/stream - SSE temps réel via Redis Pub/Sub
- POST /tasks/{task_id}/revoke - Annuler une task
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from celery_app import celery_app
from config import REDIS_URL
from i18n import t
from services.task_events import get_task_channel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks", tags=["tasks"])


# =============================================================================
# MODELS
# =============================================================================


class TaskStatusResponse(BaseModel):
    """Réponse statut d'une task Celery."""

    task_id: str
    state: str
    progress: int | None = None
    step: str | None = None
    message: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    job_id: int | None = None
    datasource_id: int | None = None


# =============================================================================
# HELPERS
# =============================================================================


def _get_task_status(task_id: str) -> dict[str, Any]:
    """Récupère le statut d'une task depuis Celery/Redis."""
    result = AsyncResult(task_id, app=celery_app)
    state = result.state
    info = result.info or {}

    response: dict[str, Any] = {
        "task_id": task_id,
        "state": state,
        "progress": 0,
        "step": None,
        "message": None,
        "result": None,
        "error": None,
        "job_id": None,
        "datasource_id": None,
        "done": False,
    }

    if state == "PENDING":
        response["message"] = t("task.pending")
    elif state == "STARTED":
        response["step"] = "starting"
        response["message"] = t("task.started")
    elif state == "PROGRESS":
        response["progress"] = info.get("progress", 0)
        response["step"] = info.get("step")
        response["message"] = info.get("message")
        response["job_id"] = info.get("job_id")
        response["datasource_id"] = info.get("datasource_id")
    elif state == "SUCCESS":
        response["progress"] = 100
        response["step"] = "completed"
        response["message"] = t("task.completed")
        response["result"] = info if isinstance(info, dict) else {"value": info}
        response["done"] = True
        if isinstance(info, dict):
            response["job_id"] = info.get("job_id")
            response["datasource_id"] = info.get("datasource_id")
    elif state == "FAILURE":
        response["step"] = "error"
        response["done"] = True
        if isinstance(info, dict):
            response["message"] = info.get("message") or str(info)
            response["error"] = info.get("message")
            response["job_id"] = info.get("job_id")
            response["datasource_id"] = info.get("datasource_id")
        else:
            response["message"] = str(info)
            response["error"] = str(info)
    elif state == "REVOKED":
        response["step"] = "cancelled"
        response["message"] = t("task.cancelled")
        response["done"] = True

    return response


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get("/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status_endpoint(task_id: str) -> dict[str, Any]:
    """
    Récupère le statut ponctuel d'une task Celery.

    Pour le temps réel, préférez GET /{task_id}/stream (SSE).
    """
    return _get_task_status(task_id)


@router.get("/{task_id}/stream")
async def stream_task_status(task_id: str) -> StreamingResponse:
    """
    Stream SSE du statut d'une task via Redis Pub/Sub.

    La task Celery publie les updates sur le channel Redis.
    Ce endpoint s'abonne et forward les events au client.

    Usage frontend:
    ```javascript
    const es = new EventSource('/api/v1/tasks/{task_id}/stream');
    es.onmessage = (e) => {
      const status = JSON.parse(e.data);
      updateUI(status);
      if (status.done) es.close();
    };
    ```
    """
    channel = get_task_channel(task_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        redis_client = aioredis.from_url(REDIS_URL)
        pubsub = redis_client.pubsub()

        try:
            # Envoyer l'état initial (depuis Celery result backend)
            status = _get_task_status(task_id)
            yield f"data: {json.dumps(status)}\n\n"

            # Si déjà terminé, on arrête
            if status.get("done"):
                return

            # S'abonner au channel Redis Pub/Sub
            await pubsub.subscribe(channel)
            logger.debug("Subscribed to Redis channel: %s", channel)

            # Écouter les messages publiés par la task Celery
            while True:
                try:
                    # Attendre un message avec timeout (pour détecter les déconnexions)
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=30.0,  # Heartbeat timeout
                    )

                    if message is not None and message["type"] == "message":
                        data = message["data"]
                        if isinstance(data, bytes):
                            data = data.decode("utf-8")

                        yield f"data: {data}\n\n"

                        # Vérifier si terminé
                        event = json.loads(data)
                        if event.get("done"):
                            break

                except TimeoutError:
                    # Envoyer un heartbeat pour garder la connexion ouverte
                    yield ": heartbeat\n\n"

                    # Vérifier si la task est terminée (fallback si event manqué)
                    status = _get_task_status(task_id)
                    if status.get("done"):
                        yield f"data: {json.dumps(status)}\n\n"
                        break

        except asyncio.CancelledError:
            logger.debug("SSE client disconnected for task %s", task_id)
        except Exception as e:
            logger.error("SSE task stream error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await redis_client.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{task_id}/revoke")
async def revoke_task(task_id: str, terminate: bool = False) -> dict[str, str]:
    """
    Annule une task Celery.

    Args:
        task_id: ID de la task à annuler
        terminate: Si True, envoie SIGTERM au worker
    """
    result = AsyncResult(task_id, app=celery_app)

    if result.state in ("SUCCESS", "FAILURE"):
        raise HTTPException(
            status_code=400,
            detail=t("task.already_finished"),
        )

    result.revoke(terminate=terminate)

    logger.info("Task %s revoked (terminate=%s)", task_id, terminate)
    return {
        "message": t("task.revoked"),
        "task_id": task_id,
    }
