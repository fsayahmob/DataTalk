"""
Tasks Celery pour le catalogue sémantique.

⚠️ IMPORTANT - ISOLATION DES CONNEXIONS:
Le worker Celery est un processus SÉPARÉ de l'API FastAPI.
Chaque task doit créer sa PROPRE connexion DuckDB.
NE JAMAIS utiliser app_state ou APP_STATE depuis ce module.

⚠️ ISOLATION PAR DATASET:
Chaque task reçoit un dataset_id explicite pour garantir l'isolation.
On ne se fie jamais au "dataset actif" qui peut changer pendant l'exécution.
"""

import logging
from typing import Any

import duckdb

from catalog.datasets import get_dataset
from catalog.jobs import update_job_status
from catalog_engine.orchestration import enrich_selected_tables, extract_only
from celery_app import celery_app

logger = logging.getLogger(__name__)


def get_duckdb_connection_for_dataset(dataset_id: str) -> tuple[duckdb.DuckDBPyConnection, str]:
    """
    Crée une connexion DuckDB dédiée au worker pour un dataset spécifique.

    ⚠️ IMPORTANT:
    - Le worker Celery est un processus SÉPARÉ de l'API
    - Il DOIT créer sa PROPRE connexion, pas réutiliser APP_STATE
    - read_only=True car le worker ne modifie pas les données DuckDB
    - On utilise dataset_id explicite, pas le "dataset actif" global

    Args:
        dataset_id: UUID du dataset cible

    Returns:
        Tuple (connexion DuckDB, chemin du fichier)

    Raises:
        RuntimeError: Si dataset non trouvé ou chemin DuckDB invalide
    """
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise RuntimeError(f"Dataset {dataset_id} not found")

    duckdb_path = dataset.get("duckdb_path")
    if not duckdb_path:
        raise RuntimeError(f"Dataset {dataset_id} has no duckdb_path")

    logger.info("Connecting to dataset %s DuckDB: %s", dataset_id, duckdb_path)
    return duckdb.connect(str(duckdb_path), read_only=True), duckdb_path


@celery_app.task(bind=True, max_retries=1, soft_time_limit=300)  # type: ignore[misc]
def extract_catalog_task(
    self: Any, run_id: str, job_id: int, dataset_id: str
) -> dict[str, str | dict[str, int]]:
    """
    Task Celery: Extraction du catalogue depuis DuckDB.

    Args:
        run_id: Identifiant unique du run (UUID)
        job_id: ID du job dans la table catalog_jobs
        dataset_id: UUID du dataset à extraire (pour isolation)

    ⚠️ IMPORTANT:
    - Le job_id existe DÉJÀ dans PostgreSQL (créé par l'API avant d'envoyer la task)
    - Cette task met à jour le status au fur et à mesure
    - Connexion DuckDB DÉDIÉE au worker (pas APP_STATE)
    - dataset_id garantit l'isolation même si le dataset actif change
    """
    db_conn = None
    try:
        logger.info("[Celery] Starting extract job %s for dataset %s", job_id, dataset_id)

        # Connexion DuckDB dédiée au worker pour ce dataset spécifique
        db_conn, duckdb_path = get_duckdb_connection_for_dataset(dataset_id)

        # Exécuter l'extraction (fonction existante)
        # IMPORTANT: Passer dataset_id pour associer la datasource au bon dataset
        result = extract_only(
            db_connection=db_conn,
            job_id=job_id,
            duckdb_path=duckdb_path,
            dataset_id=dataset_id,
        )

        # Marquer le job comme terminé
        update_job_status(job_id, status="completed")

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
    self: Any, run_id: str, job_id: int, table_ids: list[int], dataset_id: str
) -> dict[str, str | dict[str, int]]:
    """
    Task Celery: Enrichissement LLM du catalogue.

    Args:
        run_id: Identifiant unique du run (UUID)
        job_id: ID du job dans la table catalog_jobs
        table_ids: Liste des IDs de tables à enrichir
        dataset_id: UUID du dataset à enrichir (pour isolation)

    ⚠️ IMPORTANT:
    - Timeout 30 min (opérations LLM longues)
    - Retry 1x pour erreurs LLM temporaires (rate_limit, timeout)
    - Connexion DuckDB DÉDIÉE au worker (pas APP_STATE)
    - dataset_id garantit l'isolation même si le dataset actif change
    """
    db_conn = None
    try:
        logger.info(
            "[Celery] Starting enrich job %s for %d tables (dataset %s)",
            job_id,
            len(table_ids),
            dataset_id,
        )

        # Connexion DuckDB dédiée au worker pour ce dataset spécifique
        db_conn, _ = get_duckdb_connection_for_dataset(dataset_id)

        result = enrich_selected_tables(db_connection=db_conn, job_id=job_id, table_ids=table_ids)

        # Vérifier si l'enrichissement a retourné une erreur (sans exception)
        if isinstance(result, dict) and result.get("status") == "error":
            error_msg = result.get("message", "Enrichissement échoué")
            logger.error("[Celery] Enrich job %s failed (no exception): %s", job_id, error_msg)
            update_job_status(job_id, status="failed", error_message=error_msg)
            return {"status": "error", "result": result}

        # Marquer le job comme terminé seulement si succès
        update_job_status(job_id, status="completed")

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
