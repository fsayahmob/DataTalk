"""
Catalog operations endpoints (extract, enrich).

Endpoints:
- POST /catalog/extract - Extract schema from DuckDB (no LLM)
- POST /catalog/enrich - Enrich selected tables with LLM

Mode d'exécution:
- Avec Redis/Celery: tasks asynchrones (recommandé en production)
- Sans Redis: fallback sur ThreadPoolExecutor (dev local)
"""

import asyncio
import contextlib
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, HTTPException

import duckdb

from catalog import (
    create_catalog_job,
    get_active_dataset,
    get_schema_for_llm,
    get_setting,
    update_job_result,
    update_job_status,
)
from catalog_engine import (
    enrich_selected_tables,
    extract_only,
)
from core.state import app_state
from db import get_connection
from i18n import t
from llm_service import check_llm_status
from routes.catalog.helpers import get_db_connection
from routes.dependencies import EnrichCatalogRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# =============================================================================
# CELERY SUPPORT (optionnel)
# =============================================================================
# Si Redis est disponible, on utilise Celery pour les tasks longues
# Sinon, fallback sur ThreadPoolExecutor

CELERY_AVAILABLE = False
try:
    from tasks.catalog import enrich_catalog_task, extract_catalog_task

    # Test si Redis est accessible
    from celery_app import celery_app

    celery_app.control.ping(timeout=1)
    CELERY_AVAILABLE = True
    logger.info("Celery/Redis available - using async tasks")
except Exception:
    logger.info("Celery/Redis not available - using ThreadPoolExecutor fallback")


@router.post("/extract")
async def extract_catalog_endpoint() -> dict[str, Any]:
    """
    ÉTAPE 1: Extraction du schéma depuis DuckDB SANS enrichissement LLM.

    Les tables sont créées avec is_enabled=1 par défaut.
    L'utilisateur peut ensuite désactiver les tables non souhaitées
    avant de lancer l'enrichissement.

    Mode:
    - Avec Celery: retourne immédiatement, extraction en background
    - Sans Celery: bloque jusqu'à la fin de l'extraction
    """
    # Récupérer le dataset actif et son chemin DuckDB
    active_dataset = get_active_dataset()
    if not active_dataset:
        raise HTTPException(status_code=400, detail=t("dataset.no_active_dataset"))

    duckdb_path = active_dataset.get("duckdb_path")
    if not duckdb_path:
        raise HTTPException(status_code=500, detail=t("dataset.no_duckdb_path"))

    # 0. Créer un nouveau run_id et un job d'extraction
    run_id = str(uuid.uuid4())
    dataset_id = active_dataset.get("id")
    dataset_name = active_dataset.get("name", "Unknown")

    # Extraction a 2 steps: extract_metadata, save_to_catalog (géré par WorkflowManager)
    job_id = create_catalog_job(
        job_type="extraction",
        run_id=run_id,
        total_steps=2,
        details={
            "mode": "extraction_only",
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
            "duckdb_path": duckdb_path,
        },
    )

    # 1. Vider le catalogue existant
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM synonyms")
        cursor.execute("DELETE FROM columns")
        cursor.execute("DELETE FROM tables")
        cursor.execute("DELETE FROM datasources")
        # Vider aussi KPIs et questions
        with contextlib.suppress(Exception):
            cursor.execute("DELETE FROM kpis")
            cursor.execute("DELETE FROM suggested_questions")
        conn.commit()
    finally:
        conn.close()

    # 2. Lancer l'extraction
    if CELERY_AVAILABLE:
        # Mode async: dispatcher vers Celery avec dataset_id pour isolation
        extract_catalog_task.delay(run_id=run_id, job_id=job_id, dataset_id=dataset_id)
        return {
            "status": "pending",
            "message": "Extraction démarrée en arrière-plan",
            "job_id": job_id,
            "run_id": run_id,
            "async": True,
        }

    # Mode sync: exécuter dans un thread (fallback dev)
    # Créer une connexion directe au DuckDB du dataset actif
    db_conn = duckdb.connect(duckdb_path, read_only=True)

    def run_extraction() -> dict[str, Any]:
        try:
            return extract_only(db_connection=db_conn, job_id=job_id, duckdb_path=duckdb_path)
        finally:
            db_conn.close()

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_extraction)

        # Marquer le job comme complété (géré par WorkflowManager maintenant)
        update_job_status(job_id, status="completed")
        update_job_result(
            job_id,
            {
                "tables": result.get("stats", {}).get("tables", 0),
                "columns": result.get("stats", {}).get("columns", 0),
                "datasource": result.get("datasource", "DuckDB"),
            },
        )
    except Exception as e:
        # Erreur déjà marquée par WorkflowManager, juste propager
        raise HTTPException(
            status_code=500, detail=t("catalog.extraction_error", error=str(e))
        ) from e

    # 3. Rafraîchir le cache du schéma (vide car pas de descriptions)
    app_state.db_schema_cache = None

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Extraction terminée"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "tables": result.get("tables", []),
        "run_id": run_id,
        "async": False,
    }


@router.post("/enrich")
async def enrich_catalog_endpoint(request: EnrichCatalogRequest) -> dict[str, Any]:
    """
    ÉTAPE 2: Enrichissement LLM des tables sélectionnées.

    Reçoit les IDs des tables sélectionnées par l'utilisateur,
    met à jour leur état is_enabled, puis enrichit.

    Le full_context est lu depuis PostgreSQL (calculé à l'extraction).
    L'enrichissement utilise toujours le mode "full".

    Génère:
    - Descriptions de tables et colonnes
    - Synonymes pour la recherche NLP
    - KPIs (basés sur les tables sélectionnées)

    Prérequis: avoir fait /catalog/extract d'abord.

    Mode:
    - Avec Celery: retourne immédiatement, enrichissement en background
    - Sans Celery: bloque jusqu'à la fin (peut prendre plusieurs minutes)
    """
    # Vérifier que le LLM est configuré
    llm_status = check_llm_status()
    if llm_status["status"] != "ok":
        raise HTTPException(
            status_code=500, detail=llm_status.get("message", t("llm.not_configured"))
        )

    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    if not request.table_ids:
        raise HTTPException(status_code=400, detail=t("catalog.no_tables_selected"))

    # Récupérer le dataset actif pour isolation
    active_dataset = get_active_dataset()
    if not active_dataset:
        raise HTTPException(status_code=400, detail=t("dataset.no_active_dataset"))

    dataset_id = active_dataset.get("id")
    dataset_name = active_dataset.get("name", "Unknown")

    # Créer un nouveau run_id pour l'enrichissement (séparé de l'extraction)
    run_id = str(uuid.uuid4())

    # Calculer le nombre total de steps (dynamique selon batch size)
    max_tables_per_batch = int(get_setting("max_tables_per_batch") or "15")
    num_batches = (len(request.table_ids) + max_tables_per_batch - 1) // max_tables_per_batch
    # total_steps = update_enabled + fetch_tables + N*llm_batch + save_descriptions + generate_kpis + generate_questions
    total_steps = 2 + num_batches + 3

    # Créer le job d'enrichissement
    job_id = create_catalog_job(
        job_type="enrichment",
        run_id=run_id,
        total_steps=total_steps,
        details={
            "table_ids": request.table_ids,
            "table_count": len(request.table_ids),
            "batch_size": max_tables_per_batch,
            "num_batches": num_batches,
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
        },
    )

    # Lancer l'enrichissement
    if CELERY_AVAILABLE:
        # Mode async: dispatcher vers Celery avec dataset_id pour isolation
        enrich_catalog_task.delay(run_id=run_id, job_id=job_id, table_ids=request.table_ids, dataset_id=dataset_id)
        return {
            "status": "pending",
            "message": "Enrichissement démarré en arrière-plan",
            "job_id": job_id,
            "run_id": run_id,
            "async": True,
        }

    # Mode sync: exécuter dans un thread (fallback dev)
    db_conn = get_db_connection()

    def run_enrichment() -> dict[str, Any]:
        return enrich_selected_tables(
            table_ids=request.table_ids, db_connection=db_conn, job_id=job_id
        )

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_enrichment)

        # Retourner l'erreur structurée au lieu de lever une exception
        if result.get("status") == "error":
            update_job_status(job_id, status="failed", error_message=result.get("message"))
            return {
                "status": "error",
                "message": result.get("message", "Erreur inconnue"),
                "error_type": result.get("error_type"),
                "suggestion": result.get("suggestion"),
                "tables_count": 0,
                "columns_count": 0,
                "synonyms_count": 0,
                "kpis_count": 0,
                "run_id": run_id,
                "async": False,
            }

        # Marquer le job comme complété (géré par WorkflowManager maintenant)
        update_job_status(job_id, status="completed")
        update_job_result(
            job_id,
            {
                "tables": result.get("stats", {}).get("tables", 0),
                "columns": result.get("stats", {}).get("columns", 0),
                "synonyms": result.get("stats", {}).get("synonyms", 0),
                "kpis": result.get("stats", {}).get("kpis", 0),
                "questions": result.get("stats", {}).get("questions", 0),
                "datasource": result.get("datasource", "DuckDB"),
            },
        )
    except Exception as e:
        # Erreur déjà marquée par WorkflowManager, juste propager
        raise HTTPException(
            status_code=500, detail=t("catalog.enrichment_error", error=str(e))
        ) from e

    # Rafraîchir le cache du schéma
    app_state.db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Enrichissement terminé"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0),
        "kpis_count": result.get("stats", {}).get("kpis", 0),
        "run_id": run_id,
        "async": False,
    }
