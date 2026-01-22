"""
Configuration Celery pour DataTalk.

Gère les tasks longues (extraction, enrichissement LLM) de façon asynchrone.
Le worker Celery s'exécute dans un processus séparé de l'API.

Usage:
    # Démarrer le worker (dev)
    celery -A celery_app worker --loglevel=info

    # Démarrer le worker (Docker)
    docker-compose up worker
"""

import logging

from celery import Celery
from celery.signals import worker_ready

from config import REDIS_URL

logger = logging.getLogger(__name__)

celery_app = Celery(
    "datatalk",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks.catalog", "tasks.datasources", "tasks.maintenance"],
)

celery_app.conf.update(
    # Sérialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Tracking
    task_track_started=True,
    # Timeouts
    task_soft_time_limit=1800,  # 30 min soft limit
    task_time_limit=2000,  # 33 min hard limit (doit être > soft)
    # Retry policy
    task_acks_late=True,  # Ack après exécution (pas avant)
    task_reject_on_worker_lost=True,  # Requeue si worker crash
    # Result backend - éviter la corruption et les fuites mémoire
    result_expires=3600,  # Résultats expirent après 1h (TTL Redis)
    result_extended=True,  # Inclure traceback complet
    task_ignore_result=False,  # On a besoin des résultats pour le SSE
    # Celery Beat - tâches périodiques de maintenance
    beat_schedule={
        "cleanup-old-jobs": {
            "task": "tasks.maintenance.cleanup_old_jobs_task",
            "schedule": 86400,  # Toutes les 24h
            "options": {"expires": 3600},
        },
    },
)


@worker_ready.connect
def cleanup_orphan_jobs_on_startup(sender, **kwargs):
    """
    Nettoie les jobs orphelins au démarrage du worker.

    Si un job est en status 'running' ou 'pending' mais que le worker démarre,
    c'est qu'il a été interrompu (crash, restart, etc.). On le marque comme 'failed'.
    Met aussi à jour le sync_status des datasources associées.
    """
    from db import get_connection

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # 1. Récupérer les datasource_id des jobs sync orphelins
        cursor.execute("""
            SELECT DISTINCT (details::json->>'datasource_id')::int AS datasource_id
            FROM catalog_jobs
            WHERE status IN ('running', 'pending')
              AND job_type = 'sync'
              AND details IS NOT NULL
              AND details::json->>'datasource_id' IS NOT NULL
        """)
        orphan_datasource_ids = [row["datasource_id"] for row in cursor.fetchall()]

        # 2. Marquer les jobs comme failed
        cursor.execute("""
            UPDATE catalog_jobs
            SET status = 'failed',
                error_message = 'Worker restarted - job was interrupted',
                completed_at = CURRENT_TIMESTAMP
            WHERE status IN ('running', 'pending')
        """)
        orphan_count = cursor.rowcount

        # 3. Mettre à jour le sync_status des datasources concernées
        if orphan_datasource_ids:
            cursor.execute("""
                UPDATE datasources
                SET sync_status = 'error',
                    last_sync_error = 'Worker restarted - sync was interrupted',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY(%s) AND sync_status = 'running'
            """, (orphan_datasource_ids,))
            datasource_count = cursor.rowcount
        else:
            datasource_count = 0

        conn.commit()
        conn.close()

        if orphan_count > 0:
            logger.warning(
                "Cleaned up %d orphan job(s) and %d datasource(s) on worker startup",
                orphan_count, datasource_count
            )
        else:
            logger.info("No orphan jobs found on worker startup")
    except Exception as e:
        logger.error("Failed to cleanup orphan jobs: %s", e)
