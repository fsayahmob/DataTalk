"""
LLM cost tracking.

Manages logging and retrieval of LLM usage costs.
"""

from typing import Any

from db import get_connection

from .models import get_model


def log_cost(
    model_id: int,
    source: str,
    tokens_input: int,
    tokens_output: int,
    response_time_ms: int | None = None,
    conversation_id: int | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> int:
    """Enregistre un appel LLM avec son coût."""
    # Récupérer les coûts du modèle
    model = get_model(model_id)
    cost_input = 0.0
    cost_output = 0.0

    if model:
        if model.get("cost_per_1m_input"):
            cost_input = tokens_input * model["cost_per_1m_input"] / 1_000_000
        if model.get("cost_per_1m_output"):
            cost_output = tokens_output * model["cost_per_1m_output"] / 1_000_000

    cost_total = cost_input + cost_output

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO llm_costs
        (model_id, source, conversation_id, tokens_input, tokens_output,
         cost_input, cost_output, cost_total, response_time_ms, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            model_id,
            source,
            conversation_id,
            tokens_input,
            tokens_output,
            cost_input,
            cost_output,
            cost_total,
            response_time_ms,
            success,
            error_message,
        ),
    )

    conn.commit()
    cost_id = cursor.lastrowid
    assert cost_id is not None
    conn.close()
    return cost_id


def get_total_costs(
    days: int = 30, model_id: int | None = None, source: str | None = None
) -> dict[str, Any]:
    """Récupère les coûts totaux pour les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT
            COUNT(*) as total_calls,
            SUM(tokens_input) as total_tokens_input,
            SUM(tokens_output) as total_tokens_output,
            SUM(cost_total) as total_cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= datetime('now', ?)
    """
    params: list[int | str] = [f"-{days} days"]

    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    if source:
        query += " AND source = ?"
        params.append(source)

    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()

    return {
        "total_calls": row["total_calls"] or 0,
        "total_tokens_input": row["total_tokens_input"] or 0,
        "total_tokens_output": row["total_tokens_output"] or 0,
        "total_cost": row["total_cost"] or 0.0,
    }


def get_costs_by_period(days: int = 30) -> list[dict[str, Any]]:
    """Récupère les coûts par jour sur les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            DATE(created_at) as date,
            COUNT(*) as calls,
            SUM(tokens_input) as tokens_input,
            SUM(tokens_output) as tokens_output,
            SUM(cost_total) as cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= DATE('now', ?)
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    """,
        (f"-{days} days",),
    )

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_costs_by_hour(days: int = 7) -> list[dict[str, Any]]:
    """Récupère les coûts par heure sur les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            strftime('%Y-%m-%d %H:00', created_at) as hour,
            COUNT(*) as calls,
            SUM(tokens_input) as tokens_input,
            SUM(tokens_output) as tokens_output,
            SUM(cost_total) as cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= datetime('now', ?)
        GROUP BY strftime('%Y-%m-%d %H:00', created_at)
        ORDER BY hour DESC
    """,
        (f"-{days} days",),
    )

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_costs_by_model(days: int = 30) -> list[dict[str, Any]]:
    """Récupère les coûts groupés par modèle pour les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            m.display_name as model_name,
            p.display_name as provider_name,
            COUNT(*) as calls,
            SUM(c.tokens_input) as tokens_input,
            SUM(c.tokens_output) as tokens_output,
            SUM(c.cost_total) as cost
        FROM llm_costs c
        JOIN llm_models m ON c.model_id = m.id
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE c.success = 1
          AND c.created_at >= datetime('now', ?)
        GROUP BY c.model_id
        ORDER BY cost DESC
    """,
        (f"-{days} days",),
    )

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_costs_by_source(days: int = 30) -> list[dict[str, Any]]:
    """Récupère les coûts groupés par source pour les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            source,
            COUNT(*) as calls,
            SUM(tokens_input) as tokens_input,
            SUM(tokens_output) as tokens_output,
            SUM(cost_total) as cost
        FROM llm_costs
        WHERE success = 1
          AND created_at >= datetime('now', ?)
        GROUP BY source
        ORDER BY cost DESC
    """,
        (f"-{days} days",),
    )

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results
