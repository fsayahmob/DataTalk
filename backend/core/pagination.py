"""
Pagination standardisée pour les endpoints.

Fournit une validation et des helpers pour les réponses paginées.
"""

from typing import Any

# Limites de pagination
MAX_LIMIT = 100
DEFAULT_LIMIT = 20


def validate_pagination(limit: int | None, offset: int | None) -> tuple[int, int]:
    """
    Valide et normalise les paramètres de pagination.

    Args:
        limit: Nombre d'éléments demandés (sera cappé à MAX_LIMIT)
        offset: Décalage (sera minimum 0)

    Returns:
        (limit, offset) normalisés
    """
    validated_limit = min(max(1, limit or DEFAULT_LIMIT), MAX_LIMIT)
    validated_offset = max(0, offset or 0)
    return validated_limit, validated_offset


def paginate_response(items: list[Any], total: int, limit: int, offset: int) -> dict[str, Any]:
    """
    Construit une réponse paginée standardisée.

    Args:
        items: Liste des éléments à retourner
        total: Nombre total d'éléments (avant pagination)
        limit: Limite appliquée
        offset: Décalage appliqué

    Returns:
        Dictionnaire avec items et métadonnées de pagination
    """
    return {
        "items": items,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": offset + len(items) < total,
        },
    }
