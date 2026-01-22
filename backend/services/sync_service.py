"""
Service de synchronisation via PyAirbyte.

Utilise PyAirbyte avec DuckDBCache pour la synchronisation des données.
PyAirbyte gère nativement:
- La connexion aux sources (300+ connecteurs)
- L'extraction par batch
- L'écriture dans DuckDB (cache natif Python, pas de Docker)
- La gestion d'état pour l'incremental sync

NOTE: Pour Docker-in-Docker sur Mac, configurer AIRBYTE_LOCAL_ROOT
vers un chemin partagé entre l'hôte et le conteneur (ex: /tmp/airbyte_local).
Docker Desktop doit avoir accès à /tmp et /private.
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Protocol

from catalog.datasets import get_dataset, update_dataset_stats_from_sync
from catalog.datasources import get_datasource, update_sync_status
from catalog.jobs import create_catalog_job, update_job_result, update_job_status

if TYPE_CHECKING:
    from typing import Any

logger = logging.getLogger(__name__)


# =============================================================================
# TYPES
# =============================================================================


class SyncError(Exception):
    """Erreur de synchronisation."""


class ProgressCallback(Protocol):
    """Protocol pour le callback de progression (Celery update_state)."""

    def __call__(
        self, state: str = "PROGRESS", meta: dict[str, Any] | None = None
    ) -> None: ...


@dataclass
class SyncContext:
    """Contexte validé pour la synchronisation."""

    datasource_id: int
    datasource_name: str
    dataset_id: str
    duckdb_path: str
    source_type: str
    sync_config: dict[str, Any]
    selected_streams: list[str]
    sync_mode: str  # "full_refresh" ou "incremental"


@dataclass
class SyncResult:
    """Résultat de la synchronisation."""

    records_synced: int
    streams: list[str]
    errors: list[str]
    job_id: int
    datasource_id: int
    status: str

    def to_dict(self) -> dict[str, Any]:
        """Convertit en dictionnaire."""
        return {
            "records_synced": self.records_synced,
            "rows_synced": self.records_synced,  # Alias pour le frontend (attend rows_synced)
            "streams": self.streams,
            "streams_count": len(self.streams),
            "tables_synced": len(self.streams),  # Alias pour le frontend (attend tables_synced)
            "errors": self.errors,
            "job_id": self.job_id,
            "datasource_id": self.datasource_id,
            "status": self.status,
        }


# =============================================================================
# MAPPING CONNECTEURS
# =============================================================================

AIRBYTE_SOURCE_MAPPING = {
    "postgres": "source-postgres",
    "mysql": "source-mysql",
    "mongodb": "source-mongodb-v2",
    "bigquery": "source-bigquery",
    "snowflake": "source-snowflake",
    "salesforce": "source-salesforce",
    "hubspot": "source-hubspot",
    "google-sheets": "source-google-sheets",
    "csv": "source-file",
    "s3": "source-s3",
    "gcs": "source-gcs",
}


def get_airbyte_source_name(source_type: str) -> str:
    """Convertit le type de source en nom de connecteur Airbyte."""
    return AIRBYTE_SOURCE_MAPPING.get(source_type, f"source-{source_type}")


def _transform_postgres_config(config: dict[str, Any]) -> dict[str, Any]:
    """
    Transforme la config PostgreSQL pour PyAirbyte.

    Note: Cette fonction est pure - elle ne mute pas l'input.
    """
    # ssl_mode: string -> {"mode": string}
    ssl_mode = config.get("ssl_mode")
    if ssl_mode and isinstance(ssl_mode, str):
        return {**config, "ssl_mode": {"mode": ssl_mode}}
    return config


# Registry des transformations par type de source
# Ajouter ici les transformations pour d'autres connecteurs si nécessaire
_CONFIG_TRANSFORMERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "postgres": _transform_postgres_config,
}


def _transform_config_for_airbyte(source_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Transforme la config native vers le format attendu par PyAirbyte.

    Notre spec natif utilise des formats simples (ex: ssl_mode comme string),
    mais certains connecteurs PyAirbyte attendent des formats différents
    (ex: source-postgres attend ssl_mode comme objet {"mode": "disable"}).

    Les transformations sont définies dans _CONFIG_TRANSFORMERS.
    """
    transformed = config.copy()

    transformer = _CONFIG_TRANSFORMERS.get(source_type)
    if transformer:
        transformed = transformer(transformed)

    return transformed


# =============================================================================
# VALIDATION
# =============================================================================


def _validate_sync_context(datasource_id: int) -> SyncContext:
    """
    Valide et charge le contexte nécessaire pour la synchronisation.

    Raises:
        SyncError: Si validation échoue
    """
    datasource = get_datasource(datasource_id)
    if not datasource:
        raise SyncError(f"Datasource {datasource_id} not found")

    dataset_id = datasource.get("dataset_id")
    if not dataset_id:
        raise SyncError(f"Datasource {datasource_id} has no dataset_id")

    dataset = get_dataset(dataset_id)
    if not dataset:
        raise SyncError(f"Dataset {dataset_id} not found")

    duckdb_path = dataset.get("duckdb_path")
    if not duckdb_path or not Path(duckdb_path).parent.exists():
        raise SyncError(f"Invalid DuckDB path for dataset {dataset_id}")

    sync_config = datasource.get("sync_config")
    if not sync_config:
        raise SyncError(f"Datasource {datasource_id} has no sync_config")

    # Extraire les streams sélectionnés
    ingestion_catalog = datasource.get("ingestion_catalog")
    selected_streams: list[str] = []
    if ingestion_catalog and ingestion_catalog.get("tables"):
        selected_streams = [
            t["name"] for t in ingestion_catalog["tables"] if t.get("enabled", True)
        ]

    return SyncContext(
        datasource_id=datasource_id,
        datasource_name=datasource.get("name", ""),
        dataset_id=dataset_id,
        duckdb_path=duckdb_path,
        source_type=datasource.get("source_type", ""),
        sync_config=sync_config,
        selected_streams=selected_streams,
        sync_mode=datasource.get("sync_mode", "full_refresh"),
    )


def _get_selected_streams(datasource_id: int) -> list[str]:
    """Extrait les streams sélectionnés d'une datasource."""
    datasource = get_datasource(datasource_id)
    if not datasource:
        return []

    ingestion_catalog = datasource.get("ingestion_catalog")
    if not ingestion_catalog or not ingestion_catalog.get("tables"):
        return []

    return [
        t["name"] for t in ingestion_catalog["tables"] if t.get("enabled", True)
    ]


# =============================================================================
# SYNCHRONISATION PYAIRBYTE
# =============================================================================


def _execute_airbyte_sync(
    ctx: SyncContext,
    job_id: int,
    progress_callback: ProgressCallback | None,
) -> tuple[int, list[str]]:
    """
    Exécute la synchronisation PyAirbyte.

    Returns:
        Tuple (records_synced, synced_streams)
    """
    # Configurer le chemin local pour Docker-in-Docker (Mac compatibility)
    # Ce chemin doit être partagé entre l'hôte et le conteneur Docker
    # IMPORTANT: Configurer AVANT l'import de airbyte
    airbyte_local_root = os.environ.get("AIRBYTE_LOCAL_ROOT", "/tmp/airbyte_local")
    Path(airbyte_local_root).mkdir(parents=True, exist_ok=True)
    os.environ["AIRBYTE_LOCAL_ROOT"] = airbyte_local_root

    # Changer le répertoire de travail vers le chemin partagé
    # PyAirbyte utilise le cwd pour les bind mounts Docker-in-Docker
    original_cwd = os.getcwd()
    os.chdir(airbyte_local_root)

    try:
        return _run_airbyte_sync(ctx, job_id, progress_callback)
    finally:
        # Restaurer le répertoire de travail original
        os.chdir(original_cwd)


def _run_airbyte_sync(
    ctx: SyncContext,
    job_id: int,
    progress_callback: ProgressCallback | None,
) -> tuple[int, list[str]]:
    """Exécute la sync PyAirbyte (appelé depuis _execute_airbyte_sync)."""
    import sys  # noqa: PLC0415

    def update_progress(step: str, progress: int, message: str = "") -> None:
        """Met à jour le progress via PostgreSQL + Redis Pub/Sub."""
        # update_job_status écrit dans PostgreSQL ET publie sur Redis channel job:{run_id}
        # pour le SSE /job-stream/{run_id} (page Runs)
        update_job_status(job_id, status="running", current_step=step, progress=progress)

        # progress_callback publie sur Redis channel task:{task_id}
        # pour le SSE /tasks/{task_id}/stream (page Datasources avec toast)
        if progress_callback:
            progress_callback(
                state="PROGRESS",
                meta={
                    "step": step,
                    "progress": progress,
                    "message": message,
                    "job_id": job_id,
                    "datasource_id": ctx.datasource_id,
                },
            )

    # 1. Créer la source (step: init - matches frontend)
    update_progress("init", 10, f"Connecting to {ctx.source_type}")

    # Import PyAirbyte avec logging immédiat des erreurs
    # PyAirbyte peut crasher le subprocess, on log AVANT que ça arrive
    logger.info("[PyAirbyte] Importing airbyte module...")
    try:
        import airbyte as ab  # noqa: PLC0415
    except Exception as e:
        logger.error("[PyAirbyte] FATAL: Failed to import airbyte: %s", e)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(f"Failed to import airbyte: {e}") from None

    # Transformer la config pour le format PyAirbyte
    airbyte_config = _transform_config_for_airbyte(ctx.source_type, ctx.sync_config)
    logger.info("[PyAirbyte] Config transformed for %s", ctx.source_type)

    # Créer la source avec error handling explicite
    logger.info("[PyAirbyte] Creating source %s...", get_airbyte_source_name(ctx.source_type))
    try:
        source = ab.get_source(
            get_airbyte_source_name(ctx.source_type),
            config=airbyte_config,
            install_if_missing=True,
        )
    except Exception as e:
        error_msg = f"Failed to create source: {type(e).__name__}: {e}"
        logger.error("[PyAirbyte] FATAL: %s", error_msg)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(error_msg) from None

    # 2. Vérifier la connexion avec logging explicite
    logger.info("[PyAirbyte] Running connection check...")
    try:
        source.check()
    except Exception as e:
        error_msg = f"Connection check failed: {type(e).__name__}: {e}"
        logger.error("[PyAirbyte] FATAL: %s", error_msg)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(error_msg) from None

    logger.info("Connection check passed for datasource %d", ctx.datasource_id)

    # 3. Sélectionner les streams (step: save_catalog - matches frontend)
    update_progress("save_catalog", 20, f"Selecting {len(ctx.selected_streams)} streams")
    logger.info("[PyAirbyte] Selecting streams: %s", ctx.selected_streams)
    try:
        source.select_streams(ctx.selected_streams)
    except Exception as e:
        error_msg = f"Failed to select streams: {type(e).__name__}: {e}"
        logger.error("[PyAirbyte] FATAL: %s", error_msg)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(error_msg) from None

    # 4. Configurer le cache DuckDB et lancer la sync
    logger.info("[PyAirbyte] Creating DuckDB cache at %s", ctx.duckdb_path)
    try:
        cache = ab.DuckDBCache(db_path=ctx.duckdb_path)
    except Exception as e:
        error_msg = f"Failed to create DuckDB cache: {type(e).__name__}: {e}"
        logger.error("[PyAirbyte] FATAL: %s", error_msg)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(error_msg) from None

    # Déterminer si on force full_refresh
    # full_refresh = True désactive le mode incrémental qui nécessite des curseurs
    force_full_refresh = ctx.sync_mode == "full_refresh"

    logger.info(
        "[PyAirbyte] Starting read for datasource %d to %s (mode=%s, force_full_refresh=%s)",
        ctx.datasource_id,
        ctx.duckdb_path,
        ctx.sync_mode,
        force_full_refresh,
    )

    # Note: PyAirbyte ne permet pas de tracker par table individuellement
    # On envoie un step générique "syncing" pendant la sync
    update_progress("syncing", 40, "Syncing tables to DuckDB")
    try:
        result = source.read(cache=cache, force_full_refresh=force_full_refresh)
    except Exception as e:
        error_msg = f"Sync read failed: {type(e).__name__}: {e}"
        logger.error("[PyAirbyte] FATAL: %s", error_msg)
        sys.stdout.flush()
        sys.stderr.flush()
        raise SyncError(error_msg) from None

    # 5. Récupérer les résultats (step: update_stats - matches frontend)
    update_progress("update_stats", 90, "Updating dataset stats")
    records_synced = result.processed_records
    synced_streams = list(result.streams.keys()) if result.streams else []

    logger.info(
        "PyAirbyte sync completed: %d records, streams: %s",
        records_synced,
        synced_streams,
    )

    # 6. Fermer explicitement les connexions DuckDB du cache pour éviter les conflits
    # lors de la lecture des stats
    try:
        # PyAirbyte cache a une connexion interne qu'il faut libérer
        if hasattr(cache, "_duckdb_connection") and cache._duckdb_connection:
            cache._duckdb_connection.close()
        # Force garbage collection pour libérer toutes les ressources
        del cache
        del result
        import gc
        gc.collect()
    except Exception as e:
        logger.warning("Error closing cache connection: %s", e)

    return records_synced, synced_streams


# =============================================================================
# API PUBLIQUE
# =============================================================================


def sync_datasource_with_airbyte(
    datasource_id: int,
    job_id: int | None = None,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """
    Synchronise une datasource vers son dataset DuckDB via PyAirbyte.

    Args:
        datasource_id: ID de la datasource à synchroniser
        job_id: ID du job si déjà créé (optionnel)
        progress_callback: Callback Celery update_state (optionnel)

    Returns:
        Dict avec le résultat: records_synced, streams, errors, job_id

    Raises:
        SyncError: Si la synchronisation échoue
    """
    # 1. Valider le contexte
    ctx = _validate_sync_context(datasource_id)

    # 2. Gérer le cas "no streams"
    if not ctx.selected_streams:
        logger.warning("No streams selected for datasource %d", datasource_id)
        if job_id:
            update_job_status(job_id, status="completed")
            update_job_result(job_id, {"records_synced": 0, "streams": [], "errors": ["No streams selected"]})
        return SyncResult(
            records_synced=0,
            streams=[],
            errors=["No streams selected"],
            job_id=job_id or 0,
            datasource_id=datasource_id,
            status="success",
        ).to_dict()

    # 3. Créer le job si non fourni
    if job_id is None:
        job_id, _ = create_sync_job(datasource_id)

    # 4. Marquer comme running
    update_sync_status(datasource_id, "running")
    update_job_status(job_id, status="running", current_step="init")

    try:
        # 5. Exécuter la sync PyAirbyte
        records_synced, synced_streams = _execute_airbyte_sync(
            ctx, job_id, progress_callback
        )

        # 6. Mettre à jour les stats du dataset depuis les résultats de sync
        # Utilise les infos d'Airbyte au lieu de lire DuckDB (qui peut être verrouillé)
        try:
            update_dataset_stats_from_sync(
                ctx.dataset_id,
                tables_synced=len(synced_streams),
                rows_synced=records_synced,
            )
        except Exception as stats_err:
            # Ne pas faire échouer la sync si les stats ne peuvent pas être mises à jour
            # Le sync PyAirbyte a réussi, les données sont dans DuckDB
            logger.warning("Failed to update dataset stats: %s", stats_err)

        # 7. Finaliser
        update_sync_status(datasource_id, "success")
        update_job_status(job_id, status="completed", current_step="complete")

        result = SyncResult(
            records_synced=records_synced,
            streams=synced_streams,
            errors=[],
            job_id=job_id,
            datasource_id=datasource_id,
            status="success",
        )
        update_job_result(job_id, result.to_dict())

        return result.to_dict()

    except Exception as e:
        error_msg = str(e)
        logger.exception("Sync failed for datasource %d", datasource_id)

        # Chaque update est indépendant - on continue même si l'un échoue
        # Évite le "database is locked" en cascade
        try:
            update_sync_status(datasource_id, "error", error_msg)
        except Exception as status_err:
            logger.warning("Failed to update sync status: %s", status_err)

        try:
            update_job_status(job_id, status="failed", current_step="error")
        except Exception as job_err:
            logger.warning("Failed to update job status: %s", job_err)

        try:
            update_job_result(job_id, {"records_synced": 0, "streams": [], "errors": [error_msg], "status": "error"})
        except Exception as result_err:
            logger.warning("Failed to update job result: %s", result_err)

        raise SyncError(error_msg) from e


def create_sync_job(datasource_id: int) -> tuple[int, str]:
    """
    Crée un job de synchronisation.

    Appelée par l'API avant de lancer la task Celery.

    Args:
        datasource_id: ID de la datasource

    Returns:
        Tuple (job_id, run_id)

    Raises:
        SyncError: Si datasource non trouvée
    """
    datasource = get_datasource(datasource_id)
    if not datasource:
        raise SyncError(f"Datasource {datasource_id} not found")

    streams = _get_selected_streams(datasource_id)

    run_id = str(uuid.uuid4())
    job_id = create_catalog_job(
        job_type="sync",
        run_id=run_id,
        total_steps=4 + len(streams),  # init + save_catalog + N tables + update_stats + complete
        details={
            "datasource_id": datasource_id,
            "datasource_name": datasource.get("name"),
            "dataset_id": datasource.get("dataset_id"),
            "source_type": datasource.get("source_type"),
            "streams_count": len(streams),
            "stream_names": streams,
            "table_names": streams,  # Alias pour le frontend (attend table_names)
        },
    )

    return job_id, run_id
