"""
CRUD operations for LLM prompts.

Manages prompt templates with versioning and activation.
"""

from typing import Any

from db import get_connection


def get_prompts(category: str | None = None, active_only: bool = False) -> list[dict[str, Any]]:
    """Récupère la liste des prompts."""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM llm_prompts WHERE 1=1"
    params: list[str] = []

    if category:
        query += " AND category = %s"
        params.append(category)
    if active_only:
        query += " AND is_active = TRUE"

    query += " ORDER BY category, key, version"

    cursor.execute(query, params)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_prompt(key: str, version: str = "normal") -> dict[str, Any] | None:
    """Récupère un prompt par clé et version."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_prompts WHERE key = %s AND version = %s", (key, version))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_prompt(key: str) -> dict[str, Any] | None:
    """Récupère le prompt actif pour une clé donnée."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_prompts WHERE key = %s AND is_active = TRUE", (key,))
    row = cursor.fetchone()
    conn.close()

    # Fallback: si aucun prompt actif, prendre la version "normal"
    if not row:
        return get_prompt(key, "normal")

    return dict(row) if row else None


def add_prompt(
    key: str,
    name: str,
    category: str,
    content: str,
    version: str = "normal",
    is_active: bool = False,
    tokens_estimate: int | None = None,
    description: str | None = None,
) -> int | None:
    """Ajoute un nouveau prompt."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO llm_prompts
            (key, name, category, content, version, is_active, tokens_estimate, description)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """,
            (key, name, category, content, version, is_active, tokens_estimate, description),
        )
        prompt_id = cursor.fetchone()[0]
        conn.commit()
        conn.close()
        return prompt_id
    except Exception:
        conn.close()
        return None


def update_prompt(
    prompt_id: int,
    content: str | None = None,
    name: str | None = None,
    tokens_estimate: int | None = None,
    description: str | None = None,
) -> bool:
    """Met à jour un prompt existant."""
    conn = get_connection()
    cursor = conn.cursor()

    # Use a fixed query with all columns to avoid dynamic SQL construction
    cursor.execute(
        """
        UPDATE llm_prompts SET
            content = COALESCE(%s, content),
            name = COALESCE(%s, name),
            tokens_estimate = COALESCE(%s, tokens_estimate),
            description = COALESCE(%s, description),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (content, name, tokens_estimate, description, prompt_id),
    )
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def set_active_prompt(key: str, version: str) -> bool:
    """Active une version de prompt (désactive les autres versions de la même clé)."""
    conn = get_connection()
    cursor = conn.cursor()

    # Vérifier que le prompt existe
    cursor.execute("SELECT id FROM llm_prompts WHERE key = %s AND version = %s", (key, version))
    if not cursor.fetchone():
        conn.close()
        return False

    # Désactiver tous les prompts de cette clé
    cursor.execute("UPDATE llm_prompts SET is_active = FALSE WHERE key = %s", (key,))

    # Activer la version demandée
    cursor.execute(
        "UPDATE llm_prompts SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE key = %s AND version = %s",
        (key, version),
    )

    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def delete_prompt(prompt_id: int) -> bool:
    """Supprime un prompt."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM llm_prompts WHERE id = %s", (prompt_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def get_all_prompts() -> list[dict[str, Any]]:
    """Récupère tous les prompts avec leur statut actif."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM llm_prompts
            ORDER BY category, key, version
        """)
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def update_prompt_content(key: str, content: str) -> bool:
    """
    Met à jour le contenu du prompt actif pour une clé donnée.

    Args:
        key: Clé du prompt (ex: "catalog_questions")
        content: Nouveau contenu

    Returns:
        True si mise à jour réussie, False sinon
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Mettre à jour le prompt actif
        cursor.execute(
            """
            UPDATE llm_prompts
            SET content = %s, updated_at = CURRENT_TIMESTAMP
            WHERE key = %s AND is_active = TRUE
        """,
            (content, key),
        )

        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()
