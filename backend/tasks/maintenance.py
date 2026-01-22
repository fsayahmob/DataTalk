"""
Tâches de maintenance Celery.

Nettoyage périodique des données obsolètes:
- Jobs anciens dans PostgreSQL (catalog_jobs)
- Conversations orphelines
- Fichiers temporaires
"""

import logging
from typing import Any

from celery_app import celery_app
from db import get_connection

logger = logging.getLogger(__name__)

# Rétention par défaut: 7 jours pour les jobs terminés
DEFAULT_JOB_RETENTION_DAYS = 7


@celery_app.task(bind=True)  # type: ignore[misc]
def cleanup_old_jobs_task(
    self: Any,
    retention_days: int = DEFAULT_JOB_RETENTION_DAYS,
) -> dict[str, Any]:
    """
    Supprime les jobs anciens de la table catalog_jobs.

    Garde les jobs:
    - En cours (status = 'running' ou 'pending')
    - Récents (< retention_days)

    Supprime:
    - Jobs terminés (completed/failed) plus vieux que retention_days

    Args:
        retention_days: Nombre de jours de rétention (défaut: 7)

    Returns:
        Dict avec le nombre de jobs supprimés
    """
    task_id = self.request.id
    logger.info(
        "[Maintenance] Starting cleanup_old_jobs (task_id=%s, retention=%d days)",
        task_id,
        retention_days,
    )

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Supprimer les jobs terminés plus vieux que retention_days
        cursor.execute(
            """
            DELETE FROM catalog_jobs
            WHERE status IN ('completed', 'failed')
            AND started_at < CURRENT_TIMESTAMP - INTERVAL '%s days'
            """,
            (retention_days,),
        )

        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()

        logger.info(
            "[Maintenance] Cleaned up %d old jobs (retention: %d days)",
            deleted_count,
            retention_days,
        )

        return {
            "status": "success",
            "deleted_jobs": deleted_count,
            "retention_days": retention_days,
        }

    except Exception as e:
        logger.exception("[Maintenance] cleanup_old_jobs failed: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "deleted_jobs": 0,
        }


@celery_app.task(bind=True)  # type: ignore[misc]
def cleanup_orphan_conversations_task(
    self: Any,
    days_without_messages: int = 30,
) -> dict[str, Any]:
    """
    Supprime les conversations vides ou sans messages récents.

    Args:
        days_without_messages: Supprimer si pas de message depuis N jours

    Returns:
        Dict avec le nombre de conversations supprimées
    """
    task_id = self.request.id
    logger.info(
        "[Maintenance] Starting cleanup_orphan_conversations (task_id=%s)",
        task_id,
    )

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Supprimer les conversations sans messages
        cursor.execute(
            """
            DELETE FROM conversations
            WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages)
            """
        )
        deleted_empty = cursor.rowcount

        # Supprimer les conversations sans activité récente
        cursor.execute(
            """
            DELETE FROM conversations
            WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '%s days'
            AND id NOT IN (
                SELECT conversation_id FROM saved_reports WHERE conversation_id IS NOT NULL
            )
            """,
            (days_without_messages,),
        )
        deleted_old = cursor.rowcount

        conn.commit()
        conn.close()

        total_deleted = deleted_empty + deleted_old
        logger.info(
            "[Maintenance] Cleaned up %d conversations (%d empty, %d old)",
            total_deleted,
            deleted_empty,
            deleted_old,
        )

        return {
            "status": "success",
            "deleted_empty": deleted_empty,
            "deleted_old": deleted_old,
            "total_deleted": total_deleted,
        }

    except Exception as e:
        logger.exception("[Maintenance] cleanup_orphan_conversations failed: %s", e)
        return {
            "status": "error",
            "error": str(e),
        }
