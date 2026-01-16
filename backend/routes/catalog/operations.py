"""
Catalog operations endpoints (extract, enrich).

Endpoints:
- POST /catalog/extract - Extract schema from DuckDB (no LLM)
- POST /catalog/enrich - Enrich selected tables with LLM
"""

import asyncio
import contextlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import (
    create_catalog_job,
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

router = APIRouter()


@router.post("/extract")
async def extract_catalog_endpoint() -> dict[str, Any]:
    """
    ÉTAPE 1: Extraction du schéma depuis DuckDB SANS enrichissement LLM.

    Les tables sont créées avec is_enabled=1 par défaut.
    L'utilisateur peut ensuite désactiver les tables non souhaitées
    avant de lancer l'enrichissement.
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    # 0. Créer un nouveau run_id et un job d'extraction
    run_id = str(uuid.uuid4())
    # Extraction a 2 steps: extract_metadata, save_to_catalog (géré par WorkflowManager)
    job_id = create_catalog_job(
        job_type="extraction", run_id=run_id, total_steps=2, details={"mode": "extraction_only"}
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

    # 2. Extraction dans un thread séparé
    db_conn = get_db_connection()

    def run_extraction() -> dict[str, Any]:
        return extract_only(db_connection=db_conn, job_id=job_id)

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
    }


@router.post("/enrich")
async def enrich_catalog_endpoint(request: EnrichCatalogRequest) -> dict[str, Any]:
    """
    ÉTAPE 2: Enrichissement LLM des tables sélectionnées.

    Reçoit les IDs des tables sélectionnées par l'utilisateur,
    met à jour leur état is_enabled, puis enrichit.

    Le full_context est lu depuis SQLite (calculé à l'extraction).
    L'enrichissement utilise toujours le mode "full".

    Génère:
    - Descriptions de tables et colonnes
    - Synonymes pour la recherche NLP
    - KPIs (basés sur les tables sélectionnées)

    Prérequis: avoir fait /catalog/extract d'abord.
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
            "batch_size": max_tables_per_batch,
            "num_batches": num_batches,
        },
    )

    # Enrichissement dans un thread séparé (full_context lu depuis SQLite)
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
    }
