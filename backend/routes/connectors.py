"""
Routes pour la gestion des connecteurs (100% dynamique via PyAirbyte).

Endpoints:
- GET /connectors - Liste les connecteurs disponibles (depuis registry PyAirbyte)
- GET /connectors/{id}/spec - Récupère le JSON Schema de configuration
- POST /connectors/test - Teste une connexion
- POST /connectors/discover - Découvre le catalogue d'une source

IMPORTANT: Aucune donnée n'est stockée localement.
Tout est récupéré dynamiquement via PyAirbyte.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from i18n import t
from services.connector_service import (
    discover_catalog,
    get_connector_spec,
    is_airbyte_available,
    list_available_connectors,
    test_connection,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["connectors"])


# =============================================================================
# MODELS
# =============================================================================


class ConnectorResponse(BaseModel):
    """Réponse pour un connecteur."""

    id: str
    name: str
    category: str
    pypi_package: str | None = None
    latest_version: str | None = None
    language: str | None = None


class ConnectorListResponse(BaseModel):
    """Réponse liste de connecteurs."""

    connectors: list[ConnectorResponse]
    count: int
    airbyte_available: bool


class ConnectorSpecResponse(BaseModel):
    """Réponse avec le JSON Schema de configuration."""

    connector_id: str
    config_schema: dict[str, Any]


class TestConnectionRequest(BaseModel):
    """Requête de test de connexion."""

    connector_id: str = Field(..., description="Type de connecteur (postgres, mysql...)")
    config: dict[str, Any] = Field(..., description="Configuration de connexion")


class TestConnectionResponse(BaseModel):
    """Réponse de test de connexion."""

    success: bool
    message: str
    details: dict[str, Any] | None = None


class DiscoverRequest(BaseModel):
    """Requête de découverte de catalogue."""

    connector_id: str = Field(..., description="Type de connecteur")
    config: dict[str, Any] = Field(..., description="Configuration de connexion")


class ColumnSchema(BaseModel):
    """Schéma d'une colonne découverte."""

    name: str
    type: str
    nullable: bool = True
    description: str | None = None


class StreamSchema(BaseModel):
    """Schéma d'une table/stream découvert."""

    name: str
    columns: list[ColumnSchema]
    primary_key: list[str] = []


class DiscoverResponse(BaseModel):
    """Réponse de découverte de catalogue."""

    success: bool
    streams: list[StreamSchema]
    stream_count: int
    error: str | None = None


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get("", response_model=ConnectorListResponse)
async def list_connectors(
    category: str | None = None,
) -> dict[str, Any]:
    """
    Liste les connecteurs disponibles depuis le registry PyAirbyte.

    Args:
        category: Filtrer par catégorie (database, marketing, crm, etc.)

    Note: Cette liste est récupérée dynamiquement depuis PyAirbyte.
    Aucun connecteur n'est stocké localement.
    """
    connectors = list_available_connectors()

    # Filtrer par catégorie si demandé
    if category:
        connectors = [c for c in connectors if c.get("category") == category]

    return {
        "connectors": connectors,
        "count": len(connectors),
        "airbyte_available": is_airbyte_available(),
    }


@router.get("/categories")
async def list_categories() -> dict[str, Any]:
    """
    Liste les catégories de connecteurs disponibles.

    Retourne les catégories avec le nombre de connecteurs dans chacune.
    """
    connectors = list_available_connectors()

    # Compter par catégorie
    categories: dict[str, int] = {}
    for c in connectors:
        cat = c.get("category", "other")
        categories[cat] = categories.get(cat, 0) + 1

    # Trier par nombre de connecteurs
    sorted_categories = sorted(categories.items(), key=lambda x: -x[1])

    return {
        "categories": [
            {"id": cat, "name": _format_category_name(cat), "count": count}
            for cat, count in sorted_categories
        ],
        "total_connectors": len(connectors),
    }


@router.get("/{connector_id}/spec", response_model=ConnectorSpecResponse)
async def get_connector_configuration_spec(connector_id: str) -> dict[str, Any]:
    """
    Récupère le JSON Schema de configuration d'un connecteur.

    Ce schéma peut être utilisé pour générer un formulaire dynamique.

    Note: Cette opération peut prendre du temps car elle peut nécessiter
    l'installation du connecteur si non présent en cache.
    """
    spec = get_connector_spec(connector_id)

    if not spec:
        raise HTTPException(
            status_code=404,
            detail=t("connector.spec_not_found", connector_id=connector_id),
        )

    return {
        "connector_id": connector_id,
        "config_schema": spec,
    }


@router.post("/test", response_model=TestConnectionResponse)
async def test_connector_connection(request: TestConnectionRequest) -> dict[str, Any]:
    """
    Teste une connexion à une source de données.

    Vérifie que les paramètres de connexion sont valides et que la source
    est accessible. Ne modifie aucune donnée.
    """
    result = test_connection(request.connector_id, request.config)

    logger.info(
        "Connection test for %s: %s",
        request.connector_id,
        "success" if result.success else "failed",
    )

    return result.to_dict()


@router.post("/discover", response_model=DiscoverResponse)
async def discover_source_catalog(request: DiscoverRequest) -> dict[str, Any]:
    """
    Découvre le catalogue (tables/colonnes) d'une source de données.

    Retourne la liste des tables disponibles avec leur schéma.
    L'utilisateur peut ensuite sélectionner les tables à synchroniser.
    """
    result = discover_catalog(request.connector_id, request.config)

    logger.info(
        "Catalog discovery for %s: %d streams found",
        request.connector_id,
        len(result.streams),
    )

    return result.to_dict()


@router.get("/status")
async def get_airbyte_status() -> dict[str, Any]:
    """
    Vérifie le statut de PyAirbyte.

    Retourne si PyAirbyte est disponible et fonctionnel.
    """
    available = is_airbyte_available()

    return {
        "airbyte_available": available,
        "message": t("connector.airbyte_available") if available else t("connector.airbyte_unavailable"),
    }


# =============================================================================
# HELPERS
# =============================================================================


def _format_category_name(category: str) -> str:
    """Formate le nom de la catégorie pour l'affichage."""
    category_names = {
        "database": "Bases de données",
        "data_warehouse": "Data Warehouses",
        "storage": "Stockage Cloud",
        "crm": "CRM",
        "marketing": "Marketing & Analytics",
        "ecommerce": "E-commerce & Paiements",
        "productivity": "Productivité & Collaboration",
        "file": "Fichiers",
        "finance": "Finance & Comptabilité",
        "other": "Autres",
    }
    return category_names.get(category, category.replace("_", " ").title())
