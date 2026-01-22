"""
CRUD operations for LLM models.

Manages model configuration, selection and default model settings.
"""

from typing import Any

from db import get_connection


def get_models(provider_id: int | None = None, enabled_only: bool = True) -> list[dict[str, Any]]:
    """Récupère la liste des modèles."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE 1=1
    """
    params = []

    if enabled_only:
        query += " AND m.is_enabled = TRUE AND p.is_enabled = TRUE"
    if provider_id:
        query += " AND m.provider_id = %s"
        params.append(provider_id)

    query += " ORDER BY p.display_name, m.display_name"

    cursor.execute(query, params)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_model(model_id: int) -> dict[str, Any] | None:
    """Récupère un modèle par ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.id = %s
    """,
        (model_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_default_model() -> dict[str, Any] | None:
    """Récupère le modèle par défaut."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.is_default = TRUE AND m.is_enabled = TRUE AND p.is_enabled = TRUE
    """)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_model_by_model_id(model_id: str) -> dict[str, Any] | None:
    """Récupère un modèle par son model_id (ex: 'gemini-2.0-flash')."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.model_id = %s
    """,
        (model_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def set_default_model(model_id: str) -> bool:
    """Définit un modèle comme défaut par son model_id (ex: 'gemini-2.0-flash')."""
    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer l'id interne du modèle
    cursor.execute("SELECT id FROM llm_models WHERE model_id = %s", (model_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    internal_id = row["id"]

    # Enlever le défaut actuel
    cursor.execute("UPDATE llm_models SET is_default = FALSE")
    # Mettre le nouveau défaut
    cursor.execute("UPDATE llm_models SET is_default = TRUE WHERE id = %s", (internal_id,))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated
