"""
CRUD operations for conversations.
"""

from typing import Any

from db import get_connection


def create_conversation(title: str | None = None) -> int:
    """Crée une nouvelle conversation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO conversations (title) VALUES (?)", (title,))
    conn.commit()
    conversation_id = cursor.lastrowid
    assert conversation_id is not None, "INSERT should always return a lastrowid"
    conn.close()
    return conversation_id


def get_conversations(limit: int = 20) -> list[dict[str, Any]]:
    """Récupère les conversations récentes."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.*,
               (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
        FROM conversations c
        ORDER BY c.updated_at DESC
        LIMIT ?
    """,
        (limit,),
    )
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_conversation(conversation_id: int) -> bool:
    """Supprime une conversation et ses messages."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_all_conversations() -> int:
    """Supprime toutes les conversations et leurs messages.

    Returns:
        Nombre de conversations supprimées.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations")
    conn.commit()
    deleted_count = cursor.rowcount
    conn.close()
    return deleted_count
