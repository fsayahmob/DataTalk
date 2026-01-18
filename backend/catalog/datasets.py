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


def _get_duckdb_stats(duckdb_path: str) -> dict[str, int]:
    """Récupère les stats d'un fichier DuckDB (tables, rows, size)."""
    stats = {"table_count": 0, "row_count": 0, "size_bytes": 0}

    path = Path(duckdb_path)
    if not path.exists():
        return stats

    stats["size_bytes"] = path.stat().st_size

    try:
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
    except Exception as e:
        logger.warning("Cannot read DuckDB stats for %s: %s", duckdb_path, e)

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

    # Enregistrer dans SQLite
    db_conn = get_connection()
    cursor = db_conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO datasets (id, name, description, duckdb_path)
            VALUES (?, ?, ?, ?)
            """,
            (dataset_id, name, description, duckdb_path),
        )
        db_conn.commit()
    except Exception as e:
        # Cleanup: supprimer le fichier DuckDB créé
        Path(duckdb_path).unlink(missing_ok=True)
        db_conn.close()
        if "UNIQUE constraint failed" in str(e):
            raise ValueError(f"Dataset '{name}' already exists") from e
        raise
    finally:
        db_conn.close()

    # Récupérer le dataset complet avec les timestamps générés par SQLite
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
        FROM datasets WHERE id = ?
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
        updates.append("name = ?")
        params.append(name)
    if description is not None:
        updates.append("description = ?")
        params.append(description)
    if status is not None:
        updates.append("status = ?")
        params.append(status)

    if not updates:
        return get_dataset(dataset_id)

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(dataset_id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE datasets SET {', '.join(updates)} WHERE id = ?",
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

    # Supprimer de SQLite
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
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
    cursor.execute("SELECT id FROM datasets WHERE id = ?", (dataset_id,))
    if not cursor.fetchone():
        conn.close()
        return False

    # Désactiver tous les datasets
    cursor.execute("UPDATE datasets SET is_active = 0")

    # Activer le dataset sélectionné
    cursor.execute(
        "UPDATE datasets SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
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
        FROM datasets WHERE is_active = 1
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
        SET row_count = ?, table_count = ?, size_bytes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (stats["row_count"], stats["table_count"], stats["size_bytes"], dataset_id),
    )
    conn.commit()
    conn.close()

    return get_dataset(dataset_id)
