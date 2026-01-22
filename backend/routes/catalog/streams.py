"""
SSE streaming endpoints for real-time catalog status.

Endpoints:
- GET /catalog/job-stream/{run_id} - Stream job updates for a run
- GET /catalog/status-stream - Stream global catalog status
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from catalog import get_catalog_jobs, get_latest_run_id, get_run_jobs

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
    Stream SSE des jobs d'un run spécifique (extraction + enrichissement).
    Se ferme automatiquement quand tous les jobs sont terminés.
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                # Récupérer les jobs du run
                jobs = get_run_jobs(run_id)
                jobs_data = [dict(job) for job in jobs]

                # Envoyer les données
                yield f"data: {json.dumps(jobs_data, default=_json_serializer)}\n\n"

                # Arrêter si tous jobs sont terminés
                if jobs_data and all(j["status"] in ["completed", "failed"] for j in jobs_data):
                    yield f"data: {json.dumps({'done': True}, default=_json_serializer)}\n\n"
                    break

                # Update toutes les 500ms
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error("Erreur SSE job-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)}, default=_json_serializer)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
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
