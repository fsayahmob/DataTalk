"""
CRUD operations for widgets and widget cache.
"""

from typing import Any

from db import get_connection


def add_widget(
    widget_id: str,
    title: str,
    sql_query: str,
    chart_type: str,
    description: str | None = None,
    icon: str | None = None,
    chart_config: str | None = None,
    display_order: int = 0,
    priority: str = "normal",
) -> int:
    """Ajoute un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO widgets
        (widget_id, title, description, icon, sql_query, chart_type, chart_config, display_order, priority, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (widget_id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            sql_query = EXCLUDED.sql_query,
            chart_type = EXCLUDED.chart_type,
            chart_config = EXCLUDED.chart_config,
            display_order = EXCLUDED.display_order,
            priority = EXCLUDED.priority,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    """,
        (
            widget_id,
            title,
            description,
            icon,
            sql_query,
            chart_type,
            chart_config,
            display_order,
            priority,
        ),
    )
    row_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return row_id


def get_widgets(enabled_only: bool = True) -> list[dict[str, Any]]:
    """Récupère tous les widgets."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("""
            SELECT * FROM widgets
            WHERE is_enabled = TRUE
            ORDER BY priority DESC, display_order ASC
        """)
    else:
        cursor.execute("SELECT * FROM widgets ORDER BY priority DESC, display_order ASC")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_all_widgets() -> None:
    """Supprime tous les widgets (avant régénération)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM widget_cache")
    cursor.execute("DELETE FROM widgets")
    conn.commit()
    conn.close()


# ========================================
# WIDGET CACHE
# ========================================


def get_widget_cache(widget_id: str) -> dict[str, Any] | None:
    """Récupère le cache d'un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM widget_cache
        WHERE widget_id = %s
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    """,
        (widget_id,),
    )
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None


def set_widget_cache(widget_id: str, data: str, ttl_minutes: int | None = None) -> None:
    """Met en cache le résultat d'un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    if ttl_minutes:
        cursor.execute(
            """
            INSERT INTO widget_cache (widget_id, data, computed_at, expires_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + make_interval(mins => %s))
            ON CONFLICT (widget_id) DO UPDATE SET
                data = EXCLUDED.data,
                computed_at = CURRENT_TIMESTAMP,
                expires_at = CURRENT_TIMESTAMP + make_interval(mins => %s)
        """,
            (widget_id, data, ttl_minutes, ttl_minutes),
        )
    else:
        cursor.execute(
            """
            INSERT INTO widget_cache (widget_id, data, computed_at, expires_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP, NULL)
            ON CONFLICT (widget_id) DO UPDATE SET
                data = EXCLUDED.data,
                computed_at = CURRENT_TIMESTAMP,
                expires_at = NULL
        """,
            (widget_id, data),
        )
    conn.commit()
    conn.close()


def clear_widget_cache() -> None:
    """Vide tout le cache des widgets."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM widget_cache")
    conn.commit()
    conn.close()
