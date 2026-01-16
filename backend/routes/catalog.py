"""
Routes pour la gestion du catalogue sémantique.

Endpoints:
- GET /catalog - Récupérer le catalogue
- DELETE /catalog - Supprimer le catalogue
- PATCH /catalog/tables/{id}/toggle - Toggle activation table
- POST /catalog/extract - Extraction sans LLM
- POST /catalog/enrich - Enrichissement LLM
- POST /catalog/generate - Génération complète (legacy)
- GET /catalog/jobs - Historique des jobs
- GET /catalog/jobs/{id} - Détail d'un job
- GET /catalog/run/{run_id} - Jobs d'une run
- GET /catalog/latest-run - Dernière run
- GET /catalog/runs - Liste des runs
- GET /catalog/job-stream/{run_id} - SSE pour un run
- GET /catalog/status-stream - SSE pour le statut global
- PATCH /catalog/columns/{id}/description - Modifier description colonne
"""

import asyncio
import contextlib
import json
import logging
import uuid
from collections.abc import AsyncGenerator
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from catalog import (
    create_catalog_job,
    get_catalog_job,
    get_catalog_jobs,
    get_latest_run_id,
    get_run_jobs,
    get_schema_for_llm,
    get_setting,
    get_table_by_id,
    toggle_table_enabled,
    update_job_result,
    update_job_status,
)
import duckdb
from catalog_engine import (
    enrich_selected_tables,
    extract_only,
    generate_catalog_from_connection,
)
from core.state import app_state


def get_db_connection() -> duckdb.DuckDBPyConnection:
    """Get the active DB connection or raise 503 if not connected."""
    if app_state.db_connection is None:
        raise HTTPException(status_code=503, detail=t("db.not_connected"))
    return app_state.db_connection
from db import get_connection
from i18n import t
from llm_service import check_llm_status
from routes.dependencies import EnrichCatalogRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("")
async def get_catalog() -> dict[str, list[dict[str, Any]]]:
    """
    Retourne le catalogue actuel depuis SQLite.
    Structure: datasources → tables → columns
    Optimisé: 4 requêtes au lieu de O(N*M*K) requêtes.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Récupérer toutes les datasources
    cursor.execute("SELECT * FROM datasources")
    datasources = {row["id"]: dict(row) for row in cursor.fetchall()}
    for ds in datasources.values():
        ds["tables"] = []

    # 2. Récupérer toutes les tables en une requête
    cursor.execute("SELECT * FROM tables ORDER BY name")
    tables = {row["id"]: dict(row) for row in cursor.fetchall()}
    for table in tables.values():
        table["columns"] = []
        ds_id = table["datasource_id"]
        if ds_id in datasources:
            datasources[ds_id]["tables"].append(table)

    # 3. Récupérer toutes les colonnes en une requête
    cursor.execute("SELECT * FROM columns ORDER BY name")
    columns = {row["id"]: dict(row) for row in cursor.fetchall()}
    for col in columns.values():
        col["synonyms"] = []
        table_id = col["table_id"]
        if table_id in tables:
            tables[table_id]["columns"].append(col)

    # 4. Récupérer tous les synonymes en une requête
    cursor.execute("SELECT column_id, term FROM synonyms")
    for row in cursor.fetchall():
        col_id = row["column_id"]
        if col_id in columns:
            columns[col_id]["synonyms"].append(row["term"])

    conn.close()
    return {"catalog": list(datasources.values())}


@router.delete("")
async def delete_catalog() -> dict[str, str]:
    """
    Supprime tout le catalogue (pour permettre de retester la génération).
    Supprime aussi les widgets et questions suggérées associées.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Supprimer le catalogue sémantique
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")

    # Supprimer les widgets, questions et KPIs générés
    with contextlib.suppress(Exception):
        cursor.execute("DELETE FROM widget_cache")
        cursor.execute("DELETE FROM widgets")
        cursor.execute("DELETE FROM suggested_questions")
        cursor.execute("DELETE FROM kpis")

    conn.commit()
    conn.close()

    # Rafraîchir le cache du schéma
    app_state.db_schema_cache = None

    return {"status": "ok", "message": t("catalog.deleted")}


@router.patch("/tables/{table_id}/toggle")
async def toggle_table_enabled_endpoint(table_id: int) -> dict[str, Any]:
    """
    Toggle l'état is_enabled d'une table.
    Une table désactivée n'apparaîtra plus dans le prompt LLM.
    """
    # Vérifier que la table existe
    table = get_table_by_id(table_id)
    if not table:
        raise HTTPException(status_code=404, detail=t("catalog.table_not_found"))

    # Toggle l'état
    updated = toggle_table_enabled(table_id)
    if not updated:
        raise HTTPException(status_code=500, detail=t("catalog.update_error"))

    # Rafraîchir le cache du schéma
    app_state.db_schema_cache = get_schema_for_llm()

    # Récupérer le nouvel état
    table = get_table_by_id(table_id)
    return {
        "status": "ok",
        "table_id": table_id,
        "is_enabled": bool(table["is_enabled"]) if table else False,
        "message": f"Table {'activée' if table and table['is_enabled'] else 'désactivée'}",
    }


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


@router.post("/generate")
async def generate_catalog_endpoint() -> dict[str, Any]:
    """
    [LEGACY] Génère le catalogue complet en une seule étape.

    Pour le nouveau workflow en 2 étapes, utilisez:
    1. POST /catalog/extract - Extraction sans LLM
    2. (Sélection des tables via UI)
    3. POST /catalog/enrich - Enrichissement LLM
    """
    # Vérifier que le LLM est configuré
    llm_status = check_llm_status()
    if llm_status["status"] != "ok":
        raise HTTPException(
            status_code=500, detail=llm_status.get("message", t("llm.not_configured"))
        )

    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    # 1. Vider le catalogue existant
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")
    conn.commit()
    conn.close()

    # 2. Générer le catalogue dans un thread séparé pour ne pas bloquer les autres requêtes
    db_conn = get_db_connection()

    def run_generation() -> dict[str, Any]:
        return generate_catalog_from_connection(db_connection=db_conn)

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_generation)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=t("catalog.generation_error", error=str(e))
        ) from e

    # 3. Rafraîchir le cache du schéma
    app_state.db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Catalogue généré"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0),
    }


# ========================================
# ENDPOINTS CATALOG JOBS
# ========================================


@router.get("/jobs")
async def list_catalog_jobs(limit: int = 50) -> dict[str, list[dict[str, Any]]]:
    """Récupère l'historique des jobs (extraction + enrichment)."""
    try:
        jobs = get_catalog_jobs(limit=limit)
        return {"jobs": jobs}
    except Exception as e:
        logger.error("Erreur récupération jobs: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/jobs/{job_id}")
async def get_catalog_job_by_id(job_id: int) -> dict[str, Any]:
    """Récupère un job spécifique par son ID."""
    try:
        job = get_catalog_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=t("job.not_found"))
        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/run/{run_id}")
async def get_run(run_id: str) -> dict[str, list[dict[str, Any]]]:
    """Récupère tous les jobs d'une run (extraction + enrichments)."""
    try:
        jobs = get_run_jobs(run_id)
        if not jobs:
            raise HTTPException(status_code=404, detail=t("run.not_found"))
        return {"run": jobs}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération run %s: %s", run_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/latest-run")
async def get_latest_run() -> dict[str, list[dict[str, Any]]]:
    """Récupère la dernière run complète (extraction + enrichments)."""
    try:
        run_id = get_latest_run_id()

        if not run_id:
            return {"run": []}

        jobs = get_run_jobs(run_id)
        return {"run": jobs}
    except Exception as e:
        logger.error("Erreur récupération dernière run: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/runs")
async def list_all_runs() -> dict[str, list[dict[str, Any]]]:
    """
    Liste tous les jobs individuellement (extraction ET enrichissement séparés).
    Chaque job = 1 run dans l'historique.
    """
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()

            # Récupérer chaque job individuellement
            cursor.execute("""
                SELECT
                    id,
                    run_id,
                    job_type,
                    status,
                    started_at,
                    completed_at,
                    current_step,
                    progress,
                    result
                FROM catalog_jobs
                ORDER BY started_at DESC
                LIMIT 100
            """)

            runs = []
            for row in cursor.fetchall():
                # Parser le result JSON si présent
                result = row["result"]
                if result and isinstance(result, str):
                    try:
                        result = json.loads(result)
                    except (json.JSONDecodeError, TypeError):
                        result = None

                runs.append(
                    {
                        "id": row["id"],
                        "run_id": row["run_id"],
                        "job_type": row["job_type"],
                        "status": row["status"],
                        "started_at": row["started_at"],
                        "completed_at": row["completed_at"],
                        "current_step": row["current_step"],
                        "progress": row["progress"],
                        "result": result,
                    }
                )

            return {"runs": runs}

        finally:
            conn.close()

    except Exception as e:
        logger.error("Erreur list runs: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# SSE ENDPOINTS - TEMPS RÉEL
# ========================================


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
                yield f"data: {json.dumps(jobs_data)}\n\n"

                # Arrêter si tous jobs sont terminés
                if jobs_data and all(j["status"] in ["completed", "failed"] for j in jobs_data):
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break

                # Update toutes les 500ms
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error("Erreur SSE job-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

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

        try:
            while True:
                # Vérifier si un job tourne
                recent_jobs = get_catalog_jobs(limit=5)
                is_running = any(j["status"] == "running" for j in recent_jobs)
                current_run_id = get_latest_run_id() if is_running else None

                status: dict[str, Any] = {
                    "is_running": is_running,
                    "current_run_id": current_run_id,
                }

                # Envoyer seulement si changement (éviter spam)
                if status != previous_status:
                    yield f"data: {json.dumps(status)}\n\n"
                    previous_status = status

                await asyncio.sleep(1)

        except Exception as e:
            logger.error("Erreur SSE status-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch("/columns/{column_id}/description")
async def update_column_description(column_id: int, request: dict[str, Any]) -> dict[str, Any]:
    """
    Met à jour la description d'une colonne du catalogue.

    Body:
        {"description": "Nouvelle description"}
    """
    description = request.get("description", "").strip()

    if not description:
        raise HTTPException(status_code=400, detail=t("validation.empty_description"))

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Vérifier que la colonne existe
        cursor.execute("SELECT id, name FROM columns WHERE id = ?", (column_id,))
        column = cursor.fetchone()

        if not column:
            raise HTTPException(status_code=404, detail=t("catalog.column_not_found", id=column_id))

        # Mettre à jour la description
        cursor.execute("UPDATE columns SET description = ? WHERE id = ?", (description, column_id))
        conn.commit()
        conn.close()

        return {
            "status": "ok",
            "column_id": column_id,
            "column_name": column["name"],
            "description": description,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur update description colonne %s: %s", column_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e
