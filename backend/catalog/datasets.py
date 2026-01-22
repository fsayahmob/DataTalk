"""
CRUD operations for datasets.

Gère les datasets avec leur fichier DuckDB associé.
Un dataset = un fichier DuckDB isolé pour l'isolation des données.
"""

import logging
import os
import uuid
from pathlib import Path
from typing import Any

import duckdb

from config import DUCKDB_DIR
from db import get_connection

logger = logging.getLogger(__name__)


def _generate_duckdb_path(dataset_id: str) -> str:
    """Génère le chemin du fichier DuckDB pour un dataset."""
    return str(DUCKDB_DIR / f"{dataset_id}.duckdb")


def _get_duckdb_stats(duckdb_path: str, max_retries: int = 3) -> dict[str, int]:
    """
    Récupère les stats d'un fichier DuckDB (tables, rows, size).

    Args:
        duckdb_path: Chemin vers le fichier DuckDB
        max_retries: Nombre de tentatives en cas de conflit de connexion

    Returns:
        Dict avec table_count, row_count, size_bytes
    """
    import time

    stats = {"table_count": 0, "row_count": 0, "size_bytes": 0}

    path = Path(duckdb_path)
    if not path.exists():
        return stats

    stats["size_bytes"] = path.stat().st_size

    # Retry avec délai exponentiel en cas de conflit de connexion
    for attempt in range(max_retries):
        try:
            # TOUJOURS read_only - l'API ne doit jamais écrire dans DuckDB
            # Seul le worker Celery/PyAirbyte a le droit d'écrire
            conn = duckdb.connect(duckdb_path, read_only=True)

            # Compter les tables (exclure les tables système)
            tables = conn.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()
            stats["table_count"] = len(tables)

            # Compter les lignes totales
            total_rows = 0
            for (table_name,) in tables:
                try:
                    result = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
                    if result:
                        total_rows += result[0]
                except Exception:
                    pass  # Table inaccessible, on skip
            stats["row_count"] = total_rows
            conn.close()
            return stats

        except Exception as e:
            if attempt < max_retries - 1:
                # Attendre avant de réessayer (0.5s, 1s, 2s)
                wait_time = 0.5 * (2 ** attempt)
                logger.info(
                    "DuckDB connection conflict for %s, retry %d/%d in %.1fs",
                    duckdb_path, attempt + 1, max_retries, wait_time
                )
                time.sleep(wait_time)
            else:
                logger.warning("Cannot read DuckDB stats for %s after %d attempts: %s",
                             duckdb_path, max_retries, e)

    return stats


def create_dataset(name: str, description: str | None = None) -> dict[str, Any]:
    """
    Crée un nouveau dataset avec son fichier DuckDB vide.

    Args:
        name: Nom unique du dataset
        description: Description optionnelle

    Returns:
        Dict avec id, name, description, duckdb_path, status

    Raises:
        ValueError: Si un dataset avec ce nom existe déjà
    """
    dataset_id = str(uuid.uuid4())
    duckdb_path = _generate_duckdb_path(dataset_id)

    # Créer le répertoire si nécessaire
    Path(duckdb_path).parent.mkdir(parents=True, exist_ok=True)

    # Créer le fichier DuckDB vide
    conn = duckdb.connect(duckdb_path)
    conn.close()
    logger.info("Created DuckDB file: %s", duckdb_path)

    # Enregistrer dans PostgreSQL
    db_conn = get_connection()
    cursor = db_conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO datasets (id, name, description, duckdb_path)
            VALUES (%s, %s, %s, %s)
            """,
            (dataset_id, name, description, duckdb_path),
        )
        db_conn.commit()
    except Exception as e:
        # Cleanup: supprimer le fichier DuckDB créé
        Path(duckdb_path).unlink(missing_ok=True)
        db_conn.close()
        if "duplicate key" in str(e).lower() or "unique constraint" in str(e).lower():
            raise ValueError(f"Dataset '{name}' already exists") from e
        raise
    finally:
        db_conn.close()

    # Récupérer le dataset complet avec les timestamps générés par PostgreSQL
    return get_dataset(dataset_id) or {
        "id": dataset_id,
        "name": name,
        "description": description,
        "duckdb_path": duckdb_path,
        "status": "empty",
        "is_active": False,
        "row_count": 0,
        "table_count": 0,
        "size_bytes": 0,
        "created_at": None,
        "updated_at": None,
    }


def get_datasets(include_stats: bool = True) -> list[dict[str, Any]]:
    """
    Liste tous les datasets.

    Args:
        include_stats: Si True, inclut les stats DuckDB (plus lent)

    Returns:
        Liste des datasets avec leurs métadonnées
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, name, description, duckdb_path, status, is_active,
               row_count, table_count, size_bytes, created_at, updated_at
        FROM datasets
        ORDER BY created_at DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()

    datasets = []
    for row in rows:
        dataset = dict(row)
        dataset["is_active"] = bool(dataset["is_active"])

        # Optionnellement rafraîchir les stats depuis le fichier DuckDB
        if include_stats and Path(dataset["duckdb_path"]).exists():
            stats = _get_duckdb_stats(dataset["duckdb_path"])
            dataset.update(stats)

        datasets.append(dataset)

    return datasets


def get_dataset(dataset_id: str) -> dict[str, Any] | None:
    """
    Récupère un dataset par son ID.

    Args:
        dataset_id: UUID du dataset

    Returns:
        Dict du dataset ou None si non trouvé
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, name, description, duckdb_path, status, is_active,
               row_count, table_count, size_bytes, created_at, updated_at
        FROM datasets WHERE id = %s
        """,
        (dataset_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    dataset = dict(row)
    dataset["is_active"] = bool(dataset["is_active"])

    # Rafraîchir les stats
    if Path(dataset["duckdb_path"]).exists():
        stats = _get_duckdb_stats(dataset["duckdb_path"])
        dataset.update(stats)

    return dataset


def update_dataset(
    dataset_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
) -> dict[str, Any] | None:
    """
    Met à jour un dataset.

    Args:
        dataset_id: UUID du dataset
        name: Nouveau nom (optionnel)
        description: Nouvelle description (optionnel)
        status: Nouveau status (optionnel)

    Returns:
        Dataset mis à jour ou None si non trouvé
    """
    updates = []
    params = []

    if name is not None:
        updates.append("name = %s")
        params.append(name)
    if description is not None:
        updates.append("description = %s")
        params.append(description)
    if status is not None:
        updates.append("status = %s")
        params.append(status)

    if not updates:
        return get_dataset(dataset_id)

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(dataset_id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE datasets SET {', '.join(updates)} WHERE id = %s",  # noqa: S608
        params,
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()

    if not updated:
        return None

    return get_dataset(dataset_id)


def delete_dataset(dataset_id: str) -> bool:
    """
    Supprime un dataset et son fichier DuckDB.

    Args:
        dataset_id: UUID du dataset

    Returns:
        True si supprimé, False si non trouvé
    """
    # Récupérer le chemin DuckDB avant suppression
    dataset = get_dataset(dataset_id)
    if not dataset:
        return False

    duckdb_path = dataset["duckdb_path"]

    # Supprimer de PostgreSQL
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM datasets WHERE id = %s", (dataset_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()

    # Supprimer le fichier DuckDB
    if deleted and duckdb_path:
        try:
            Path(duckdb_path).unlink(missing_ok=True)
            logger.info("Deleted DuckDB file: %s", duckdb_path)
        except Exception as e:
            logger.warning("Failed to delete DuckDB file %s: %s", duckdb_path, e)

    return deleted


def set_active_dataset(dataset_id: str) -> bool:
    """
    Définit un dataset comme actif (un seul à la fois).

    Args:
        dataset_id: UUID du dataset à activer

    Returns:
        True si activé, False si dataset non trouvé
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Vérifier que le dataset existe
    cursor.execute("SELECT id FROM datasets WHERE id = %s", (dataset_id,))
    if not cursor.fetchone():
        conn.close()
        return False

    # Désactiver tous les datasets
    cursor.execute("UPDATE datasets SET is_active = FALSE")

    # Activer le dataset sélectionné
    cursor.execute(
        "UPDATE datasets SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
        (dataset_id,),
    )
    conn.commit()
    conn.close()

    return True


def get_active_dataset() -> dict[str, Any] | None:
    """
    Récupère le dataset actuellement actif.

    Returns:
        Dataset actif ou None si aucun
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, name, description, duckdb_path, status, is_active,
               row_count, table_count, size_bytes, created_at, updated_at
        FROM datasets WHERE is_active = TRUE
        """
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    dataset = dict(row)
    dataset["is_active"] = True
    return dataset


def update_dataset_stats(dataset_id: str) -> dict[str, Any] | None:
    """
    Met à jour les stats d'un dataset depuis son fichier DuckDB.

    Args:
        dataset_id: UUID du dataset

    Returns:
        Dataset avec stats mises à jour ou None si non trouvé
    """
    dataset = get_dataset(dataset_id)
    if not dataset:
        return None

    stats = _get_duckdb_stats(dataset["duckdb_path"])

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE datasets
        SET row_count = %s, table_count = %s, size_bytes = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (stats["row_count"], stats["table_count"], stats["size_bytes"], dataset_id),
    )
    conn.commit()
    conn.close()

    return get_dataset(dataset_id)


def update_dataset_stats_from_sync(
    dataset_id: str,
    tables_synced: int,
    rows_synced: int,
) -> dict[str, Any] | None:
    """
    Met à jour les stats d'un dataset depuis les résultats de synchronisation.

    Utilisée après une sync PyAirbyte pour éviter de lire DuckDB
    (qui pourrait être encore verrouillé).

    Args:
        dataset_id: UUID du dataset
        tables_synced: Nombre de tables synchronisées
        rows_synced: Nombre de lignes synchronisées

    Returns:
        Dataset avec stats mises à jour ou None si non trouvé
    """
    dataset = get_dataset(dataset_id)
    if not dataset:
        return None

    # Calculer la taille du fichier DuckDB (lecture seule du filesystem)
    duckdb_path = Path(dataset["duckdb_path"])
    size_bytes = duckdb_path.stat().st_size if duckdb_path.exists() else 0

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE datasets
        SET row_count = %s, table_count = %s, size_bytes = %s, status = 'ready',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (rows_synced, tables_synced, size_bytes, dataset_id),
    )
    conn.commit()
    conn.close()

    logger.info(
        "Updated dataset %s stats from sync: %d tables, %d rows, %d bytes",
        dataset_id, tables_synced, rows_synced, size_bytes,
    )

    return get_dataset(dataset_id)
