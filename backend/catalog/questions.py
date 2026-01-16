"""
CRUD operations for suggested questions.
"""

from typing import Any

from db import get_connection


def add_suggested_question(
    question: str,
    category: str | None = None,
    icon: str | None = None,
    business_value: str | None = None,
    display_order: int = 0,
) -> int:
    """Ajoute une question suggérée."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO suggested_questions (question, category, icon, business_value, display_order)
        VALUES (?, ?, ?, ?, ?)
    """,
        (question, category, icon, business_value, display_order),
    )
    conn.commit()
    question_id = cursor.lastrowid
    assert question_id is not None
    conn.close()
    return question_id


def get_suggested_questions(enabled_only: bool = True) -> list[dict[str, Any]]:
    """Récupère les questions suggérées."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("""
            SELECT * FROM suggested_questions
            WHERE is_enabled = TRUE
            ORDER BY category, display_order
        """)
    else:
        cursor.execute("SELECT * FROM suggested_questions ORDER BY category, display_order")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_all_suggested_questions() -> None:
    """Supprime toutes les questions suggérées (avant régénération)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM suggested_questions")
    conn.commit()
    conn.close()
