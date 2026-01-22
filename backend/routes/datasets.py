"""
Routes pour la gestion des datasets.

Un dataset = un fichier DuckDB isolé contenant des données analytiques.
Permet le multi-tenant et l'isolation des données par projet/client.

Endpoints:
- POST /datasets - Créer un dataset
- GET /datasets - Lister les datasets
- GET /datasets/{id} - Détails d'un dataset
- PATCH /datasets/{id} - Mettre à jour un dataset
- DELETE /datasets/{id} - Supprimer un dataset
- POST /datasets/{id}/activate - Activer un dataset
- POST /datasets/{id}/refresh-stats - Rafraîchir les stats
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from catalog import (
    create_dataset,
    delete_dataset,
    get_active_dataset,
    get_dataset,
    get_datasets,
    get_schema_for_llm,
    set_active_dataset,
    update_dataset,
    update_dataset_stats,
)
from catalog.datasources import is_sync_running
from core.state import app_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


# =============================================================================
# MODELS
# =============================================================================


class CreateDatasetRequest(BaseModel):
    """Requête de création de dataset."""

    name: str = Field(..., min_length=1, max_length=100, description="Nom unique du dataset")
    description: str | None = Field(None, max_length=500, description="Description optionnelle")


class UpdateDatasetRequest(BaseModel):
    """Requête de mise à jour de dataset."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class DatasetResponse(BaseModel):
    """Réponse dataset."""

    id: str
    name: str
    description: str | None
    duckdb_path: str
    status: str
    is_active: bool
    row_count: int
    table_count: int
    size_bytes: int
    created_at: datetime | None
    updated_at: datetime | None


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post("", response_model=DatasetResponse, status_code=201)
async def create_new_dataset(request: CreateDatasetRequest) -> dict[str, Any]:
    """
    Crée un nouveau dataset avec son fichier DuckDB vide.

    Le dataset est créé avec le status "empty" et peut ensuite
    être alimenté via des datasources ou des uploads CSV.
    """
    try:
        dataset = create_dataset(name=request.name, description=request.description)
        logger.info("Created dataset: %s (%s)", dataset["name"], dataset["id"])
        return dataset
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.get("")
async def list_datasets(include_stats: bool = True) -> dict[str, Any]:
    """
    Liste tous les datasets.

    Args:
        include_stats: Si True, rafraîchit les stats depuis les fichiers DuckDB
    """
    datasets = get_datasets(include_stats=include_stats)
    active = get_active_dataset()
    return {
        "datasets": datasets,
        "count": len(datasets),
        "active_dataset_id": active["id"] if active else None,
    }


@router.get("/active")
async def get_current_active_dataset() -> dict[str, Any]:
    """Récupère le dataset actuellement actif."""
    dataset = get_active_dataset()
    if not dataset:
        return {"dataset": None, "message": "No active dataset"}
    return {"dataset": dataset}


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset_details(dataset_id: str) -> dict[str, Any]:
    """Récupère les détails d'un dataset."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset_info(dataset_id: str, request: UpdateDatasetRequest) -> dict[str, Any]:
    """Met à jour le nom ou la description d'un dataset."""
    dataset = update_dataset(
        dataset_id=dataset_id,
        name=request.name,
        description=request.description,
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}")
async def remove_dataset(dataset_id: str) -> dict[str, str]:
    """
    Supprime un dataset et son fichier DuckDB.

    ATTENTION: Cette action est irréversible.
    """
    deleted = delete_dataset(dataset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dataset not found")
    logger.info("Deleted dataset: %s", dataset_id)
    return {"message": "Dataset deleted", "id": dataset_id}


@router.post("/{dataset_id}/activate")
async def activate_dataset(dataset_id: str) -> dict[str, Any]:
    """
    Active un dataset (un seul peut être actif à la fois).

    Le dataset actif est utilisé par défaut pour les requêtes Text-to-SQL.
    Reconnecte automatiquement l'app_state au DuckDB du nouveau dataset.
    """
    success = set_active_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = get_dataset(dataset_id)
    duckdb_path = dataset.get("duckdb_path") if dataset else None

    # Reconnecter app_state au nouveau DuckDB
    if duckdb_path and Path(duckdb_path).exists():
        try:
            # Fermer l'ancienne connexion (géré par le setter)
            app_state.db_connection = duckdb.connect(duckdb_path, read_only=True)
            app_state.current_db_path = duckdb_path
            # Rafraîchir le cache du schéma pour le LLM
            app_state.db_schema_cache = get_schema_for_llm()
            logger.info("Reconnected to DuckDB: %s", duckdb_path)
        except Exception as e:
            logger.warning("Failed to connect to DuckDB %s: %s", duckdb_path, e)
            app_state.db_connection = None
            app_state.db_schema_cache = None
    else:
        # Dataset sans fichier DuckDB (pas encore synchronisé)
        app_state.db_connection = None
        app_state.current_db_path = duckdb_path
        app_state.db_schema_cache = None
        logger.info("Dataset %s has no DuckDB file yet", dataset_id)

    logger.info("Activated dataset: %s", dataset_id)
    return {"message": "Dataset activated", "dataset": dataset}


@router.post("/{dataset_id}/refresh-stats", response_model=DatasetResponse)
async def refresh_dataset_stats(dataset_id: str) -> dict[str, Any]:
    """
    Rafraîchit les statistiques d'un dataset depuis son fichier DuckDB.

    Utile après un import de données pour mettre à jour row_count, table_count, size_bytes.
    """
    dataset = update_dataset_stats(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}/sync-status")
async def get_dataset_sync_status(dataset_id: str) -> dict[str, Any]:
    """
    Vérifie si une synchronisation est en cours sur le dataset.

    Retourne:
        - is_syncing: True si au moins une datasource est en sync
        - dataset_id: ID du dataset vérifié
    """
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    syncing = is_sync_running(dataset_id)
    return {
        "is_syncing": syncing,
        "dataset_id": dataset_id,
    }
