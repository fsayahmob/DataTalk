"""
Tasks Celery pour le catalogue sémantique.

⚠️ IMPORTANT - ISOLATION DES CONNEXIONS:
Le worker Celery est un processus SÉPARÉ de l'API FastAPI.
Chaque task doit créer sa PROPRE connexion DuckDB.
NE JAMAIS utiliser app_state ou APP_STATE depuis ce module.
"""

import logging
from typing import Any

import duckdb

from catalog.datasets import get_active_dataset
from catalog.jobs import update_job_status
from catalog_engine.orchestration import enrich_selected_tables, extract_only
from celery_app import celery_app

logger = logging.getLogger(__name__)


def get_duckdb_connection() -> tuple[duckdb.DuckDBPyConnection, str]:
    """
    Crée une connexion DuckDB dédiée au worker pour le dataset actif.

    ⚠️ IMPORTANT:
    - Le worker Celery est un processus SÉPARÉ de l'API
    - Il DOIT créer sa PROPRE connexion, pas réutiliser APP_STATE
    - read_only=True car le worker ne modifie pas les données DuckDB

    Returns:
        Tuple (connexion DuckDB, chemin du fichier)

    Raises:
        RuntimeError: Si aucun dataset actif ou chemin DuckDB invalide
    """
    active_dataset = get_active_dataset()
    if not active_dataset:
        raise RuntimeError("No active dataset configured")

    duckdb_path = active_dataset.get("duckdb_path")
    if not duckdb_path:
        raise RuntimeError(f"Dataset {active_dataset['id']} has no duckdb_path")

    logger.info("Connecting to active dataset DuckDB: %s", duckdb_path)
    return duckdb.connect(str(duckdb_path), read_only=True), duckdb_path


@celery_app.task(bind=True, max_retries=1, soft_time_limit=300)  # type: ignore[misc]
def extract_catalog_task(self: Any, run_id: str, job_id: int) -> dict[str, str | dict[str, int]]:
    """
    Task Celery: Extraction du catalogue depuis DuckDB.

    Args:
        run_id: Identifiant unique du run (UUID)
        job_id: ID du job dans la table catalog_jobs

    ⚠️ IMPORTANT:
    - Le job_id existe DÉJÀ dans SQLite (créé par l'API avant d'envoyer la task)
    - Cette task met à jour le status au fur et à mesure
    - Connexion DuckDB DÉDIÉE au worker (pas APP_STATE)
    """
    db_conn = None
    try:
        logger.info("[Celery] Starting extract job %s", job_id)

        # Connexion DuckDB dédiée au worker
        db_conn, duckdb_path = get_duckdb_connection()

        # Exécuter l'extraction (fonction existante)
        result = extract_only(db_connection=db_conn, job_id=job_id, duckdb_path=duckdb_path)

        logger.info("[Celery] Extract job %s completed", job_id)
        return {"status": "success", "result": result}

    except Exception as e:
        logger.error("[Celery] Extract job %s failed: %s", job_id, e)
        update_job_status(job_id, status="failed", error_message=str(e))
        raise
    finally:
        if db_conn:
            db_conn.close()


@celery_app.task(bind=True, max_retries=1, soft_time_limit=1800)  # type: ignore[misc]
def enrich_catalog_task(
    self: Any, run_id: str, job_id: int, table_ids: list[int]
) -> dict[str, str | dict[str, int]]:
    """
    Task Celery: Enrichissement LLM du catalogue.

    Args:
        run_id: Identifiant unique du run (UUID)
        job_id: ID du job dans la table catalog_jobs
        table_ids: Liste des IDs de tables à enrichir

    ⚠️ IMPORTANT:
    - Timeout 30 min (opérations LLM longues)
    - Retry 1x pour erreurs LLM temporaires (rate_limit, timeout)
    - Connexion DuckDB DÉDIÉE au worker (pas APP_STATE)
    """
    db_conn = None
    try:
        logger.info("[Celery] Starting enrich job %s for %d tables", job_id, len(table_ids))

        # Connexion DuckDB dédiée au worker (on ignore le path pour l'enrichissement)
        db_conn, _ = get_duckdb_connection()

        result = enrich_selected_tables(db_connection=db_conn, job_id=job_id, table_ids=table_ids)

        logger.info("[Celery] Enrich job %s completed", job_id)
        return {"status": "success", "result": result}

    except Exception as e:
        logger.error("[Celery] Enrich job %s failed: %s", job_id, e)
        update_job_status(job_id, status="failed", error_message=str(e))

        # Retry pour erreurs LLM temporaires
        error_msg = str(e).lower()
        if "rate_limit" in error_msg or "timeout" in error_msg:
            raise self.retry(exc=e, countdown=60) from e  # Retry après 1 min
        raise
    finally:
        if db_conn:
            db_conn.close()
