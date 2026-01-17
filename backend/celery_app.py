"""
Configuration Celery pour G7 Analytics.

Gère les tasks longues (extraction, enrichissement LLM) de façon asynchrone.
Le worker Celery s'exécute dans un processus séparé de l'API.

Usage:
    # Démarrer le worker (dev)
    celery -A celery_app worker --loglevel=info

    # Démarrer le worker (Docker)
    docker-compose up worker
"""

from celery import Celery

from config import REDIS_URL

celery_app = Celery(
    "g7_analytics",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks.catalog"],
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
)
