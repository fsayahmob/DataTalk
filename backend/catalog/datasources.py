"""
CRUD operations for datasources.
"""

import json
from typing import Any

from db import get_connection


def add_datasource(
    name: str,
    ds_type: str,
    dataset_id: str | None = None,
    source_type: str | None = None,
    path: str | None = None,
    description: str | None = None,
    sync_config: dict[str, Any] | None = None,
    sync_mode: str = "full_refresh",
    ingestion_catalog: dict[str, Any] | None = None,
) -> int | None:
    """
    Ajoute une source de données.

    Args:
        name: Nom unique de la datasource
        ds_type: Type de stockage (duckdb, postgres, mysql...)
        dataset_id: ID du dataset associé
        source_type: Type de source PyAirbyte (postgres, mysql, csv, gcs, s3...)
        path: Chemin ou connection string
        description: Description
        sync_config: Configuration JSON pour PyAirbyte
        sync_mode: Mode de sync (full_refresh, incremental)
        ingestion_catalog: Catalogue des tables sélectionnées (JSON)
    """
    conn = get_connection()
    cursor = conn.cursor()

    sync_config_json = json.dumps(sync_config) if sync_config else None
    ingestion_catalog_json = json.dumps(ingestion_catalog) if ingestion_catalog else None

    cursor.execute(
        """
        INSERT INTO datasources (
            name, type, dataset_id, source_type, path, description,
            sync_config, sync_status, sync_mode, ingestion_catalog, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
    """,
        (
            name,
            ds_type,
            dataset_id,
            source_type,
            path,
            description,
            sync_config_json,
            sync_mode,
            ingestion_catalog_json,
        ),
    )
    conn.commit()
    datasource_id = cursor.lastrowid
    conn.close()
    return datasource_id


def get_datasource(datasource_id: int) -> dict[str, Any] | None:
    """Récupère une datasource par son ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM datasources WHERE id = ?", (datasource_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    result = dict(row)
    # Parse JSON fields
    if result.get("sync_config"):
        result["sync_config"] = json.loads(result["sync_config"])
    if result.get("ingestion_catalog"):
        result["ingestion_catalog"] = json.loads(result["ingestion_catalog"])
    return result


def get_datasource_by_name(name: str) -> dict[str, Any] | None:
    """Récupère une datasource par son nom."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM datasources WHERE name = ?", (name,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    result = dict(row)
    if result.get("sync_config"):
        result["sync_config"] = json.loads(result["sync_config"])
    return result


def list_datasources(dataset_id: str | None = None) -> list[dict[str, Any]]:
    """
    Liste les datasources.

    Args:
        dataset_id: Filtrer par dataset (optionnel)
    """
    conn = get_connection()
    cursor = conn.cursor()

    if dataset_id:
        cursor.execute(
            "SELECT * FROM datasources WHERE dataset_id = ? ORDER BY name",
            (dataset_id,),
        )
    else:
        cursor.execute("SELECT * FROM datasources ORDER BY name")

    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        ds = dict(row)
        if ds.get("sync_config"):
            ds["sync_config"] = json.loads(ds["sync_config"])
        if ds.get("ingestion_catalog"):
            ds["ingestion_catalog"] = json.loads(ds["ingestion_catalog"])
        result.append(ds)
    return result


def update_datasource(
    datasource_id: int,
    name: str | None = None,
    description: str | None = None,
    source_type: str | None = None,
    sync_config: dict[str, Any] | None = None,
    is_active: bool | None = None,
    sync_mode: str | None = None,
    ingestion_catalog: dict[str, Any] | None = None,
) -> bool:
    """
    Met à jour une datasource.

    Args:
        datasource_id: ID de la datasource
        name: Nouveau nom (optionnel)
        description: Nouvelle description (optionnel)
        source_type: Nouveau type de source (optionnel)
        sync_config: Nouvelle config sync (optionnel)
        is_active: Activer/désactiver (optionnel)
        sync_mode: Mode de synchronisation (optionnel)
        ingestion_catalog: Catalogue des tables sélectionnées (optionnel)
    """
    updates = []
    params = []

    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if description is not None:
        updates.append("description = ?")
        params.append(description)
    if source_type is not None:
        updates.append("source_type = ?")
        params.append(source_type)
    if sync_config is not None:
        updates.append("sync_config = ?")
        params.append(json.dumps(sync_config))
    if is_active is not None:
        updates.append("is_active = ?")
        params.append(1 if is_active else 0)
    if sync_mode is not None:
        updates.append("sync_mode = ?")
        params.append(sync_mode)
    if ingestion_catalog is not None:
        updates.append("ingestion_catalog = ?")
        params.append(json.dumps(ingestion_catalog))

    if not updates:
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(datasource_id)

    conn = get_connection()
    cursor = conn.cursor()
    # Les noms de colonnes sont hardcodés, pas d'injection possible
    query = f"UPDATE datasources SET {', '.join(updates)} WHERE id = ?"  # noqa: S608
    cursor.execute(query, params)
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def update_sync_status(
    datasource_id: int,
    status: str,
    error: str | None = None,
) -> bool:
    """
    Met à jour le statut de sync d'une datasource.

    Args:
        datasource_id: ID de la datasource
        status: pending, running, success, error
        error: Message d'erreur (si status=error)
    """
    conn = get_connection()
    cursor = conn.cursor()

    if status == "success":
        cursor.execute(
            """UPDATE datasources
               SET sync_status = ?, last_sync_at = CURRENT_TIMESTAMP,
                   last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (status, datasource_id),
        )
    elif status == "error":
        cursor.execute(
            """UPDATE datasources
               SET sync_status = ?, last_sync_error = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (status, error, datasource_id),
        )
    else:
        cursor.execute(
            """UPDATE datasources
               SET sync_status = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (status, datasource_id),
        )

    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def is_sync_running(dataset_id: str) -> bool:
    """
    Vérifie si une synchronisation est en cours sur le dataset.

    Args:
        dataset_id: ID du dataset

    Returns:
        True si au moins une datasource est en sync (status=running)
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT COUNT(*) FROM datasources
           WHERE dataset_id = ? AND sync_status = 'running'""",
        (dataset_id,),
    )
    count = cursor.fetchone()[0]
    conn.close()
    return count > 0


def delete_datasource(datasource_id: int) -> bool:
    """
    Supprime une datasource et planifie la suppression async des tables DuckDB.

    1. Récupère les tables depuis ingestion_catalog
    2. Supprime l'entrée dans SQLite (immédiat)
    3. Lance une tâche Celery pour supprimer les tables DuckDB (async)
    4. Met à jour les stats du dataset

    La suppression DuckDB est asynchrone pour:
    - Ne pas bloquer l'API
    - Éviter les conflits avec un sync en cours
    - Le worker réessaie si le fichier est verrouillé
    """
    import logging

    from catalog.datasets import get_dataset, update_dataset_stats

    logger = logging.getLogger(__name__)

    # 1. Récupérer la datasource pour avoir les tables et le dataset_id
    datasource = get_datasource(datasource_id)
    if not datasource:
        return False

    dataset_id = datasource.get("dataset_id")
    ingestion_catalog = datasource.get("ingestion_catalog")

    # Préparer les infos pour la tâche de cleanup
    duckdb_path = None
    tables_to_drop: list[str] = []

    if dataset_id and ingestion_catalog:
        dataset = get_dataset(dataset_id)
        if dataset and dataset.get("duckdb_path"):
            duckdb_path = dataset["duckdb_path"]
            if ingestion_catalog.get("tables"):
                tables_to_drop = [t["name"] for t in ingestion_catalog["tables"]]

    # 2. Supprimer l'entrée dans SQLite (immédiat, pas de blocage)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM datasources WHERE id = ?", (datasource_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()

    # 3. Lancer la tâche Celery pour supprimer les tables DuckDB (async)
    if affected > 0 and duckdb_path and tables_to_drop:
        try:
            from tasks.datasources import cleanup_datasource_tables_task

            cleanup_datasource_tables_task.delay(
                duckdb_path=duckdb_path,
                table_names=tables_to_drop,
                datasource_id=datasource_id,
            )
            logger.info(
                "Scheduled async cleanup of %d tables for datasource %d",
                len(tables_to_drop),
                datasource_id,
            )
        except Exception as e:
            # Si Celery n'est pas disponible, log et continue
            # Les tables orphelines seront écrasées au prochain sync
            logger.warning("Cannot schedule cleanup task: %s", e)

    # 4. Mettre à jour les stats du dataset
    if affected > 0 and dataset_id:
        try:
            update_dataset_stats(dataset_id)
        except Exception as e:
            logger.warning("Failed to update dataset stats: %s", e)

    return affected > 0
