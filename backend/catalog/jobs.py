"""
CRUD operations for catalog jobs.
"""

import contextlib
import json
from typing import Any

from db import get_connection


def create_catalog_job(
    job_type: str, run_id: str, total_steps: int, details: dict[str, Any] | None = None
) -> int:
    """
    Crée un nouveau job de catalogue (extraction ou enrichment).

    Args:
        job_type: 'extraction' ou 'enrichment'
        run_id: UUID de la run (commun pour extraction + enrichment)
        total_steps: Nombre total de steps calculé dynamiquement
        details: Contexte JSON (batch size, mode, etc.)

    Returns:
        ID du job créé
    """

    conn = get_connection()
    try:
        cursor = conn.cursor()

        details_json = json.dumps(details) if details else None

        cursor.execute(
            """
            INSERT INTO catalog_jobs (job_type, run_id, status, total_steps, details)
            VALUES (%s, %s, 'pending', %s, %s)
            RETURNING id
        """,
            (job_type, run_id, total_steps, details_json),
        )
        job_id = cursor.fetchone()["id"]
        conn.commit()
        return job_id
    finally:
        conn.close()


def update_job_status(
    job_id: int,
    status: str,
    current_step: str | None = None,
    step_index: int | None = None,
    error_message: str | None = None,
) -> None:
    """
    Met à jour le statut d'un job.

    Args:
        job_id: ID du job
        status: 'pending', 'running', 'completed', 'failed'
        current_step: Nom du step actuel (ex: "llm_batch_2")
        step_index: Index du step (0-based)
        error_message: Message d'erreur si status='failed'
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Calculer le progress si step_index fourni
        if step_index is not None:
            cursor.execute("SELECT total_steps FROM catalog_jobs WHERE id = %s", (job_id,))
            row = cursor.fetchone()
            if row and row["total_steps"]:
                progress = int((step_index + 1) / row["total_steps"] * 100)
            else:
                progress = 0

            cursor.execute(
                """
                UPDATE catalog_jobs
                SET status = %s, current_step = %s, step_index = %s, progress = %s,
                    error_message = %s, completed_at = CASE WHEN %s IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = %s
            """,
                (status, current_step, step_index, progress, error_message, status, job_id),
            )
        else:
            cursor.execute(
                """
                UPDATE catalog_jobs
                SET status = %s, current_step = %s, error_message = %s,
                    completed_at = CASE WHEN %s IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = %s
            """,
                (status, current_step, error_message, status, job_id),
            )

        conn.commit()
    finally:
        conn.close()


def update_job_result(job_id: int, result: dict[str, Any]) -> None:
    """
    Met à jour le résultat JSON d'un job complété.

    Args:
        job_id: ID du job
        result: Dictionnaire avec les métriques (tables, columns, synonyms, kpis, questions)
    """

    conn = get_connection()
    try:
        cursor = conn.cursor()

        result_json = json.dumps(result)
        cursor.execute("UPDATE catalog_jobs SET result = %s WHERE id = %s", (result_json, job_id))

        conn.commit()
    finally:
        conn.close()


def get_catalog_job(job_id: int) -> dict[str, Any] | None:
    """Récupère un job par son ID."""

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM catalog_jobs WHERE id = %s", (job_id,))
        result = cursor.fetchone()

        if not result:
            return None

        job = dict(result)

        # Parser les champs JSON
        if job.get("details"):
            with contextlib.suppress(Exception):
                job["details"] = json.loads(job["details"])

        if job.get("result"):
            with contextlib.suppress(Exception):
                job["result"] = json.loads(job["result"])

        return job
    finally:
        conn.close()


def get_catalog_jobs(limit: int = 50) -> list[dict[str, Any]]:
    """
    Récupère l'historique des jobs (plus récents en premier).

    Args:
        limit: Nombre max de jobs à retourner

    Returns:
        Liste des jobs avec leurs détails
    """

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM catalog_jobs
            ORDER BY started_at DESC
            LIMIT %s
        """,
            (limit,),
        )

        results = [dict(row) for row in cursor.fetchall()]

        # Parser les champs JSON
        for job in results:
            if job.get("details"):
                with contextlib.suppress(Exception):
                    job["details"] = json.loads(job["details"])

            if job.get("result"):
                with contextlib.suppress(Exception):
                    job["result"] = json.loads(job["result"])

        return results
    finally:
        conn.close()


def get_run_jobs(run_id: str) -> list[dict[str, Any]]:
    """
    Récupère tous les jobs d'une run (extraction + enrichments).

    Args:
        run_id: UUID de la run

    Returns:
        Liste ordonnée: [extraction_job, enrichment_job, ...]
    """

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Récupérer tous les jobs de cette run
        cursor.execute(
            """
            SELECT * FROM catalog_jobs
            WHERE run_id = %s
            ORDER BY started_at ASC
        """,
            (run_id,),
        )

        jobs = [dict(row) for row in cursor.fetchall()]

        # Parser JSON pour tous les jobs
        for job in jobs:
            if job.get("details"):
                with contextlib.suppress(Exception):
                    job["details"] = json.loads(job["details"])

            if job.get("result"):
                with contextlib.suppress(Exception):
                    job["result"] = json.loads(job["result"])

        return jobs
    finally:
        conn.close()


def get_latest_run_id() -> str | None:
    """
    Récupère le run_id de la dernière extraction.

    Returns:
        run_id ou None si aucune run
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT run_id FROM catalog_jobs
            WHERE job_type = 'extraction'
            ORDER BY id DESC
            LIMIT 1
        """)

        row = cursor.fetchone()
        return row["run_id"] if row else None
    finally:
        conn.close()


def reset_job_for_retry(job_id: int) -> dict[str, Any] | None:
    """
    Réinitialise un job pour permettre un retry.

    Accepte tous les statuts sauf 'running' (pour éviter les conflits).

    Args:
        job_id: ID du job à retry

    Returns:
        Le job réinitialisé ou None si non trouvé ou en cours d'exécution
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Vérifier que le job existe et n'est pas en cours
        cursor.execute(
            "SELECT * FROM catalog_jobs WHERE id = %s AND status != 'running'",
            (job_id,),
        )
        row = cursor.fetchone()

        if not row:
            return None

        # Reset le job pour retry
        cursor.execute(
            """
            UPDATE catalog_jobs
            SET status = 'pending',
                progress = 0,
                current_step = NULL,
                step_index = NULL,
                error_message = NULL,
                result = NULL,
                started_at = CURRENT_TIMESTAMP,
                completed_at = NULL
            WHERE id = %s
        """,
            (job_id,),
        )

        conn.commit()

        # Retourner le job mis à jour
        return get_catalog_job(job_id)
    finally:
        conn.close()
