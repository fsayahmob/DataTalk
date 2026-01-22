"""
Job management endpoints for catalog operations.

Endpoints:
- GET /catalog/jobs - List all jobs
- GET /catalog/jobs/{id} - Get job by ID
- GET /catalog/run/{run_id} - Get jobs for a run
- GET /catalog/latest-run - Get latest run
- GET /catalog/runs - List all runs
- POST /catalog/jobs/{id}/retry - Retry a failed job
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import (
    get_catalog_job,
    get_catalog_jobs,
    get_latest_run_id,
    get_run_jobs,
    reset_job_for_retry,
)
from db import get_connection
from i18n import t
from tasks.catalog import enrich_catalog_task, extract_catalog_task
from tasks.datasources import sync_datasource_task

logger = logging.getLogger(__name__)

router = APIRouter()


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


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: int) -> dict[str, Any]:
    """
    Retry un job failed en le réinitialisant ET en relançant la task Celery.

    Le job doit être en status 'failed' pour pouvoir être retried.
    Selon le job_type, relance la task appropriée:
    - extraction: extract_catalog_task
    - enrichment: enrich_catalog_task
    - sync: sync_datasource_task

    Returns:
        job: Le job réinitialisé
        task_id: L'ID de la nouvelle task Celery
    """
    try:
        job = reset_job_for_retry(job_id)
        if not job:
            raise HTTPException(
                status_code=400,
                detail=t("job.not_retriable"),
            )

        # Relancer la task Celery selon le type de job
        job_type = job.get("job_type")
        run_id = job.get("run_id")
        details = job.get("details") or {}
        task_id: str | None = None

        if job_type == "extraction":
            dataset_id = details.get("dataset_id")
            if not dataset_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot retry extraction: no dataset_id in job details",
                )
            task = extract_catalog_task.delay(run_id, job_id, dataset_id)
            task_id = task.id
            logger.info("Retry extraction job %s -> task %s", job_id, task_id)

        elif job_type == "enrichment":
            dataset_id = details.get("dataset_id")
            if not dataset_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot retry enrichment: no dataset_id in job details",
                )
            table_ids = details.get("table_ids", [])
            if not table_ids:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot retry enrichment: no table_ids in job details",
                )
            task = enrich_catalog_task.delay(run_id, job_id, table_ids, dataset_id)
            task_id = task.id
            logger.info("Retry enrichment job %s -> task %s", job_id, task_id)

        elif job_type == "sync":
            datasource_id = details.get("datasource_id")
            if not datasource_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot retry sync: no datasource_id in job details",
                )
            task = sync_datasource_task.delay(datasource_id, job_id)
            task_id = task.id
            logger.info("Retry sync job %s -> task %s", job_id, task_id)

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown job type: {job_type}",
            )

        return {
            "job": job,
            "task_id": task_id,
            "message": t("job.retry_ready"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur retry job %s: %s", job_id, e)
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
                    result,
                    details
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

                # Parser les details JSON si présent
                details = row["details"]
                if details and isinstance(details, str):
                    try:
                        details = json.loads(details)
                    except (json.JSONDecodeError, TypeError):
                        details = None

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
                        "details": details,
                    }
                )

            return {"runs": runs}

        finally:
            conn.close()

    except Exception as e:
        logger.error("Erreur list runs: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
