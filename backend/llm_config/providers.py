"""
CRUD operations for LLM providers.

Manages provider configuration including self-hosted providers (Ollama).
"""

import urllib.error
import urllib.request
from typing import Any

from db import get_connection

# Endpoints de health check pour les providers self-hosted
SELFHOSTED_HEALTH_ENDPOINTS = {
    "ollama": "/api/tags",  # Sera préfixé par base_url
}


def check_local_provider_available(provider_name: str) -> bool:
    """
    Vérifie si un provider self-hosted est accessible.
    Utilise base_url de la DB + endpoint de health check.
    """
    # Récupérer le provider pour avoir son base_url
    provider = get_provider_by_name(provider_name)
    if not provider:
        return False

    base_url = provider.get("base_url")
    if not base_url:
        return False

    # Construire l'URL de health check
    health_endpoint = SELFHOSTED_HEALTH_ENDPOINTS.get(provider_name, "/health")
    url = base_url.rstrip("/") + health_endpoint

    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=2):
            return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def get_providers(enabled_only: bool = True) -> list[dict[str, Any]]:
    """Récupère la liste des providers."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("SELECT * FROM llm_providers WHERE is_enabled = 1 ORDER BY display_name")
    else:
        cursor.execute("SELECT * FROM llm_providers ORDER BY display_name")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_provider(provider_id: int) -> dict[str, Any] | None:
    """Récupère un provider par ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_providers WHERE id = ?", (provider_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_provider_by_name(name: str) -> dict[str, Any] | None:
    """Récupère un provider par nom."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_providers WHERE name = ?", (name,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_provider_base_url(provider_id: int, base_url: str | None) -> bool:
    """Met à jour le base_url d'un provider (pour self-hosted)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE llm_providers SET base_url = ? WHERE id = ?
    """,
        (base_url.rstrip("/") if base_url else None, provider_id),
    )
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0
