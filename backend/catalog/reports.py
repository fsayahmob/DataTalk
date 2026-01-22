"""
CRUD operations for saved reports.
"""

import uuid
from typing import Any

from db import get_connection


def save_report(
    title: str,
    question: str,
    sql_query: str,
    chart_config: str | None = None,
    message_id: int | None = None,
    is_pinned: bool = False,
) -> dict[str, Any]:
    """Sauvegarde un rapport avec génération automatique du token de partage."""
    share_token = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO saved_reports
        (title, question, sql_query, chart_config, message_id, is_pinned, share_token)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,
        (title, question, sql_query, chart_config, message_id, is_pinned, share_token),
    )
    report_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": report_id, "share_token": share_token}


def get_saved_reports() -> list[dict[str, Any]]:
    """Récupère tous les rapports sauvegardés."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM saved_reports
        ORDER BY is_pinned DESC, created_at DESC
    """)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_report(report_id: int) -> bool:
    """Supprime un rapport sauvegardé."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM saved_reports WHERE id = %s", (report_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def toggle_pin_report(report_id: int) -> bool:
    """Inverse l'état épinglé d'un rapport."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE saved_reports
        SET is_pinned = NOT is_pinned
        WHERE id = %s
    """,
        (report_id,),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def get_report_by_token(share_token: str) -> dict[str, Any] | None:
    """Récupère un rapport par son token de partage (accès public)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM saved_reports WHERE share_token = %s",
        (share_token,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
