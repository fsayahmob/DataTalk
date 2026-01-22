"""
CRUD operations for messages.
"""

import json
from typing import Any

from db import get_connection


def add_message(
    conversation_id: int,
    role: str,
    content: str,
    sql_query: str | None = None,
    chart_config: str | None = None,
    data_json: str | None = None,
    model_name: str | None = None,
    tokens_input: int | None = None,
    tokens_output: int | None = None,
    response_time_ms: int | None = None,
) -> int:
    """Ajoute un message à une conversation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO messages
        (conversation_id, role, content, sql_query, chart_config, data_json,
         model_name, tokens_input, tokens_output, response_time_ms)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,
        (
            conversation_id,
            role,
            content,
            sql_query,
            chart_config,
            data_json,
            model_name,
            tokens_input,
            tokens_output,
            response_time_ms,
        ),
    )

    message_id = cursor.fetchone()["id"]

    # Mettre à jour le timestamp de la conversation
    cursor.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = %s", (conversation_id,)
    )

    # Mettre à jour le titre si c'est le premier message user
    if role == "user":
        cursor.execute(
            "UPDATE conversations SET title = %s WHERE id = %s AND title IS NULL",
            (content[:50] + "..." if len(content) > 50 else content, conversation_id),
        )

    conn.commit()
    conn.close()
    return message_id


def get_messages(conversation_id: int) -> list[dict[str, Any]]:
    """Récupère tous les messages d'une conversation.

    Renomme les champs pour correspondre au format attendu par le frontend:
    - sql_query -> sql
    - chart_config -> chart (JSON parsé)
    - data_json -> data (JSON parsé)
    """

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM messages
        WHERE conversation_id = %s
        ORDER BY created_at ASC
    """,
        (conversation_id,),
    )
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        msg = dict(row)
        # Renommer et parser les champs pour le frontend
        msg["sql"] = msg.pop("sql_query", None)

        # Parser chart_config JSON
        chart_config = msg.pop("chart_config", None)
        if chart_config:
            try:
                msg["chart"] = json.loads(chart_config)
            except (json.JSONDecodeError, TypeError):
                msg["chart"] = None
        else:
            msg["chart"] = None

        # Parser data_json
        data_json = msg.pop("data_json", None)
        if data_json:
            try:
                msg["data"] = json.loads(data_json)
            except (json.JSONDecodeError, TypeError):
                msg["data"] = None
        else:
            msg["data"] = None

        results.append(msg)

    return results
