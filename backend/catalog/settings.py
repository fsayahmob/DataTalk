"""
CRUD operations for settings.
"""

from typing import Any

from db import get_connection


def get_setting(key: str, default: str | None = None) -> str | None:
    """Récupère une valeur de configuration."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
        result = cursor.fetchone()
        return result["value"] if result else default
    finally:
        conn.close()


def set_setting(key: str, value: str) -> None:
    """Définit une valeur de configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO settings (key, value, updated_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    """,
        (key, value),
    )
    conn.commit()
    conn.close()


def get_all_settings() -> dict[str, Any]:
    """Récupère toutes les configurations."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    results = {row["key"]: row["value"] for row in cursor.fetchall()}
    conn.close()
    return results
