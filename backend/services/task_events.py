"""
Service de publication d'événements de tasks via Redis Pub/Sub.

Permet le push temps réel des updates de tasks Celery.
Les tasks publient sur Redis, le SSE s'abonne et forward au client.

Architecture:
    Task Celery → Redis PUBLISH → SSE endpoint → EventSource client
"""

import json
import logging
from functools import lru_cache
from typing import Any

import redis

from config import REDIS_URL

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    """Retourne une connexion Redis (singleton via lru_cache)."""
    return redis.from_url(REDIS_URL)


def get_task_channel(task_id: str) -> str:
    """Retourne le nom du channel Redis pour une task."""
    return f"task:{task_id}:events"


def publish_task_event(
    task_id: str,
    state: str,
    progress: int = 0,
    step: str | None = None,
    message: str | None = None,
    job_id: int | None = None,
    datasource_id: int | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """
    Publie un événement de task sur Redis Pub/Sub.

    Appelé par les tasks Celery à chaque changement d'état.

    Args:
        task_id: ID de la task Celery
        state: État (PENDING, STARTED, PROGRESS, SUCCESS, FAILURE)
        progress: Pourcentage de progression (0-100)
        step: Nom de l'étape courante
        message: Message descriptif
        job_id: ID du job SQLite associé
        datasource_id: ID de la datasource
        result: Résultat final (pour SUCCESS)
        error: Message d'erreur (pour FAILURE)
    """
    try:
        client = get_redis_client()
        channel = get_task_channel(task_id)

        event = {
            "task_id": task_id,
            "state": state,
            "progress": progress,
            "step": step,
            "message": message,
            "job_id": job_id,
            "datasource_id": datasource_id,
            "result": result,
            "error": error,
            "done": state in ("SUCCESS", "FAILURE", "REVOKED"),
        }

        client.publish(channel, json.dumps(event))
        logger.debug("Published task event: %s -> %s", task_id, state)

    except Exception as e:
        # Ne pas faire échouer la task si Redis pub/sub échoue
        logger.warning("Failed to publish task event: %s", e)
