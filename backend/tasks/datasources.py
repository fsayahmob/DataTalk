"""
Tasks Celery pour la synchronisation des datasources via PyAirbyte.

⚠️ IMPORTANT - ISOLATION DES PROCESSUS:
Le worker Celery est un processus SÉPARÉ de l'API FastAPI.
Chaque task est autonome et gère ses propres connexions.
NE JAMAIS utiliser app_state ou des singletons partagés.

Ce module utilise:
- PyAirbyte pour la synchronisation (pas de code maison)
- Redis Pub/Sub pour le push temps réel des events
- Celery update_state() pour le stockage du state dans Redis

NOTE: Pour éviter les erreurs "Exception information must include the exception type"
avec Celery/Redis, on ne propage JAMAIS les exceptions PyAirbyte directement.
On les capture, extrait le message, et retourne un dict avec le status "error".
"""

import logging
from typing import Any

from celery_app import celery_app
from services.sync_service import SyncError, sync_datasource_with_airbyte
from services.task_events import publish_task_event

logger = logging.getLogger(__name__)


class RetryableError(Exception):
    """
    Exception simple et sérialisable pour les retries Celery.

    Celery a des problèmes avec les exceptions complexes (PyAirbyte, etc.)
    qui ont des attributs non-sérialisables JSON.
    Cette classe garantit la sérialisation.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)

    def __reduce__(self) -> tuple[type, tuple[str]]:
        """Garantit la sérialisation pickle correcte."""
        return (self.__class__, (self.message,))


def _create_progress_callback(
    task: Any,
    task_id: str,
    datasource_id: int,
    job_id: int | None,
) -> Any:
    """
    Crée un callback qui:
    1. Met à jour le state Celery (stockage Redis)
    2. Publie sur Redis Pub/Sub (push temps réel)
    """

    def callback(state: str = "PROGRESS", meta: dict[str, Any] | None = None) -> None:
        meta = meta or {}

        # 1. Update Celery state (stocké dans Redis)
        task.update_state(state=state, meta=meta)

        # 2. Publish sur Redis Pub/Sub (push temps réel)
        publish_task_event(
            task_id=task_id,
            state=state,
            progress=meta.get("progress", 0),
            step=meta.get("step"),
            message=meta.get("message"),
            job_id=meta.get("job_id") or job_id,
            datasource_id=datasource_id,
        )

    return callback


def _safe_error_message(exc: BaseException) -> str:
    """
    Extrait un message d'erreur sérialisable depuis une exception.

    PyAirbyte et d'autres libs peuvent lever des exceptions avec des attributs
    non-sérialisables qui cassent Celery/Redis. Cette fonction garantit
    un string simple.
    """
    try:
        msg = str(exc)
        # Tronquer si trop long (évite de surcharger Redis)
        if len(msg) > 2000:
            msg = msg[:2000] + "..."
        return msg
    except Exception:
        return f"{type(exc).__name__}: (unable to serialize error message)"


def _handle_task_failure(
    task: Any,
    task_id: str,
    datasource_id: int,
    job_id: int | None,
    error_msg: str,
) -> dict[str, Any]:
    """
    Gère un échec de task: publie l'event, update le state, retourne le résultat.

    Factorise le pattern répété dans les blocs except.
    """
    # S'assurer que le message est sérialisable et pas trop long
    safe_msg = error_msg[:2000] if len(error_msg) > 2000 else error_msg

    # Publish sur Redis Pub/Sub
    publish_task_event(
        task_id=task_id,
        state="FAILURE",
        progress=0,
        step="error",
        message=safe_msg,
        job_id=job_id,
        datasource_id=datasource_id,
        error=safe_msg,
    )

    # Update Celery state
    task.update_state(
        state="FAILURE",
        meta={
            "step": "error",
            "progress": 0,
            "message": safe_msg,
            "job_id": job_id,
            "datasource_id": datasource_id,
        },
    )

    return {
        "status": "error",
        "error_message": safe_msg,
        "records_synced": 0,
        "streams": [],
        "errors": [safe_msg],
        "job_id": job_id,
    }


@celery_app.task(bind=True, max_retries=2, soft_time_limit=1800)  # type: ignore[misc]
def sync_datasource_task(
    self: Any,
    datasource_id: int,
    job_id: int | None = None,
) -> dict[str, Any]:
    """
    Task Celery: Synchronise une datasource vers son dataset DuckDB via PyAirbyte.

    Updates publiées sur Redis Pub/Sub pour le push temps réel.
    Le frontend utilise EventSource sur GET /tasks/{task_id}/stream.

    Args:
        datasource_id: ID de la datasource à synchroniser
        job_id: ID du job pré-créé (optionnel)

    Returns:
        Dict avec status et résultat
    """
    task_id = self.request.id

    # Callback qui publie sur Redis Pub/Sub
    progress_callback = _create_progress_callback(
        task=self,
        task_id=task_id,
        datasource_id=datasource_id,
        job_id=job_id,
    )

    try:
        logger.info(
            "[Celery] Starting PyAirbyte sync for datasource %d (job_id=%s, task_id=%s)",
            datasource_id,
            job_id,
            task_id,
        )

        # Event: starting
        progress_callback(
            state="PROGRESS",
            meta={
                "step": "starting",
                "progress": 0,
                "message": "Initializing sync",
                "job_id": job_id,
                "datasource_id": datasource_id,
            },
        )

        # Exécuter la synchronisation PyAirbyte
        result = sync_datasource_with_airbyte(
            datasource_id=datasource_id,
            job_id=job_id,
            progress_callback=progress_callback,
        )

        logger.info(
            "[Celery] PyAirbyte sync completed for datasource %d: %d records, %d streams",
            datasource_id,
            result.get("records_synced", 0),
            result.get("streams_count", 0),
        )

        # Event: success
        final_result = {
            "status": "success",
            "records_synced": result.get("records_synced", 0),
            "streams": result.get("streams", []),
            "streams_count": result.get("streams_count", 0),
            "errors": result.get("errors", []),
            "job_id": result.get("job_id"),
            "datasource_id": datasource_id,
        }

        publish_task_event(
            task_id=task_id,
            state="SUCCESS",
            progress=100,
            step="completed",
            message="Sync completed",
            job_id=result.get("job_id"),
            datasource_id=datasource_id,
            result=final_result,
        )

        return final_result

    except SyncError as e:
        # Erreur métier - pas de retry
        error_msg = _safe_error_message(e)
        logger.error(
            "[Celery] Sync failed for datasource %d: %s",
            datasource_id,
            error_msg,
        )
        return _handle_task_failure(self, task_id, datasource_id, job_id, error_msg)

    except Exception as e:
        # Erreur technique - retry possible
        error_msg = _safe_error_message(e)
        logger.exception("[Celery] Sync error for datasource %d", datasource_id)

        # Retry pour erreurs de connexion temporaires
        error_lower = error_msg.lower()
        should_retry = self.request.retries < self.max_retries and any(
            keyword in error_lower
            for keyword in ["timeout", "connection", "refused", "reset", "temporarily"]
        )

        if should_retry:
            logger.info(
                "[Celery] Retrying sync for datasource %d in 30s (attempt %d/%d)",
                datasource_id,
                self.request.retries + 1,
                self.max_retries,
            )
            # Utiliser une exception simple et sérialisable pour le retry
            # L'exception originale de PyAirbyte peut avoir des attributs non-JSON
            raise self.retry(countdown=30, exc=RetryableError(error_msg))

        return _handle_task_failure(self, task_id, datasource_id, job_id, error_msg)


@celery_app.task(bind=True, max_retries=3)  # type: ignore[misc]
def cleanup_datasource_tables_task(
    self: Any,
    duckdb_path: str,
    table_names: list[str],
    datasource_id: int,
) -> dict[str, Any]:
    """
    Task Celery: Supprime les tables d'une datasource dans DuckDB.

    Cette tâche est appelée après la suppression d'une datasource dans PostgreSQL.
    Elle s'exécute de manière asynchrone pour ne pas bloquer l'API.

    Args:
        duckdb_path: Chemin vers le fichier DuckDB du dataset
        table_names: Liste des noms de tables à supprimer
        datasource_id: ID de la datasource (pour logging)

    Returns:
        Dict avec status et tables supprimées
    """
    import duckdb

    task_id = self.request.id
    dropped_tables: list[str] = []
    failed_tables: list[str] = []

    logger.info(
        "[Celery] Starting table cleanup for datasource %d (task_id=%s, tables=%s)",
        datasource_id,
        task_id,
        table_names,
    )

    try:
        # Ouvrir DuckDB en écriture
        duck_conn = duckdb.connect(duckdb_path)

        for table_name in table_names:
            try:
                duck_conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                dropped_tables.append(table_name)
                logger.info(
                    "[Celery] Dropped table %s from %s",
                    table_name,
                    duckdb_path,
                )
            except Exception as e:
                failed_tables.append(table_name)
                logger.warning(
                    "[Celery] Failed to drop table %s: %s",
                    table_name,
                    e,
                )

        duck_conn.close()

        result = {
            "status": "success" if not failed_tables else "partial",
            "dropped_tables": dropped_tables,
            "failed_tables": failed_tables,
            "datasource_id": datasource_id,
        }

        logger.info(
            "[Celery] Table cleanup completed for datasource %d: %d dropped, %d failed",
            datasource_id,
            len(dropped_tables),
            len(failed_tables),
        )

        return result

    except Exception as e:
        error_msg = _safe_error_message(e)
        logger.error(
            "[Celery] Table cleanup failed for datasource %d: %s",
            datasource_id,
            error_msg,
        )

        # Retry si erreur de connexion (fichier verrouillé par un sync en cours)
        error_lower = error_msg.lower()
        should_retry = self.request.retries < self.max_retries and any(
            keyword in error_lower
            for keyword in ["locked", "busy", "timeout", "connection"]
        )

        if should_retry:
            logger.info(
                "[Celery] Retrying cleanup for datasource %d in 10s (attempt %d/%d)",
                datasource_id,
                self.request.retries + 1,
                self.max_retries,
            )
            # Utiliser une exception simple et sérialisable pour le retry
            raise self.retry(countdown=10, exc=RetryableError(error_msg))

        return {
            "status": "error",
            "error_message": error_msg,
            "dropped_tables": dropped_tables,
            "failed_tables": table_names,
            "datasource_id": datasource_id,
        }
