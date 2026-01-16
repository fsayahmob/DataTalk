"""
CRUD operations for datasources.
"""

from db import get_connection


def add_datasource(
    name: str,
    ds_type: str,
    path: str | None = None,
    description: str | None = None,
) -> int | None:
    """Ajoute une source de données."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR REPLACE INTO datasources (name, type, path, description, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    """,
        (name, ds_type, path, description),
    )
    conn.commit()
    datasource_id = cursor.lastrowid
    conn.close()
    return datasource_id
