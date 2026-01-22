"""
SSE streaming endpoints for real-time catalog status.

Endpoints:
- GET /catalog/job-stream/{run_id} - Stream job updates for a run (via Redis Pub/Sub)
- GET /catalog/status-stream - Stream global catalog status
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from catalog import get_catalog_jobs, get_latest_run_id, get_run_jobs
from config import REDIS_URL
from services.task_events import get_job_channel

logger = logging.getLogger(__name__)


def _json_serializer(obj: Any) -> str:
    """JSON serializer for datetime objects from PostgreSQL."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

router = APIRouter()


@router.get("/job-stream/{run_id}")
async def stream_run_jobs(run_id: str) -> StreamingResponse:
    """
    Stream SSE des jobs d'un run via Redis Pub/Sub.

    Architecture push temps réel:
        Worker → update_job_status() → Redis PUBLISH → SSE → Frontend

    Se ferme automatiquement quand tous les jobs sont terminés.
    """
    channel = get_job_channel(run_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        redis_client = aioredis.from_url(REDIS_URL)
        pubsub = redis_client.pubsub()

        try:
            # 1. Envoyer l'état initial depuis PostgreSQL
            jobs = get_run_jobs(run_id)
            jobs_data = [dict(job) for job in jobs]
            yield f"data: {json.dumps(jobs_data, default=_json_serializer)}\n\n"

            # Si tous les jobs sont déjà terminés, on arrête
            if jobs_data and all(j["status"] in ["completed", "failed"] for j in jobs_data):
                yield f"data: {json.dumps({'done': True})}\n\n"
                return

            # 2. S'abonner au channel Redis Pub/Sub
            await pubsub.subscribe(channel)
            logger.debug("Subscribed to Redis job channel: %s", channel)

            # 3. Écouter les événements publiés par update_job_status()
            while True:
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=30.0,
                    )

                    if message is not None and message["type"] == "message":
                        data = message["data"]
                        if isinstance(data, bytes):
                            data = data.decode("utf-8")

                        # Envoyer l'événement au frontend (format: single job update)
                        event = json.loads(data)
                        # Wraper dans une liste pour compatibilité frontend
                        yield f"data: {json.dumps([event], default=_json_serializer)}\n\n"

                        # Vérifier si terminé
                        if event.get("done"):
                            yield f"data: {json.dumps({'done': True})}\n\n"
                            break

                except TimeoutError:
                    # Heartbeat pour garder la connexion ouverte
                    yield ": heartbeat\n\n"

                    # Fallback: vérifier PostgreSQL si event manqué
                    jobs = get_run_jobs(run_id)
                    if jobs and all(j["status"] in ["completed", "failed"] for j in jobs):
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break

        except asyncio.CancelledError:
            logger.debug("SSE client disconnected for run %s", run_id)
        except Exception as e:
            logger.error("SSE job-stream error: %s", e)
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


@router.get("/status-stream")
async def stream_catalog_status() -> StreamingResponse:
    """
    Stream SSE de l'état global du catalogue (running ou pas).
    Permet de bloquer les boutons Extract/Enrich pendant un run.
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        previous_status: dict[str, Any] | None = None
        first_message = True

        try:
            while True:
                # Vérifier si un job tourne (pending = créé mais pas encore pris par Celery)
                recent_jobs = get_catalog_jobs(limit=5)
                is_running = any(j["status"] in ("pending", "running") for j in recent_jobs)
                current_run_id = get_latest_run_id() if is_running else None

                status: dict[str, Any] = {
                    "is_running": is_running,
                    "current_run_id": current_run_id,
                }

                # Toujours envoyer le premier message + envoyer si changement
                if first_message or status != previous_status:
                    yield f"data: {json.dumps(status, default=_json_serializer)}\n\n"
                    previous_status = status
                    first_message = False

                await asyncio.sleep(1)

        except Exception as e:
            logger.error("Erreur SSE status-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)}, default=_json_serializer)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
