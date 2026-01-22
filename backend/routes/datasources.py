"""
Routes pour la gestion des datasources.

Une datasource = une connexion à une source de données externe (Postgres, MySQL, CSV...)
qui alimente un dataset DuckDB via PyAirbyte.

Endpoints:
- POST /datasources - Créer une datasource
- GET /datasources - Lister les datasources
- GET /datasources/{id} - Détails d'une datasource
- PATCH /datasources/{id} - Mettre à jour une datasource
- DELETE /datasources/{id} - Supprimer une datasource
- POST /datasources/{id}/sync - Lancer une synchronisation
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from catalog.datasources import (
    add_datasource,
    delete_datasource,
    get_datasource,
    list_datasources,
    update_datasource,
)
from i18n import t

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasources", tags=["datasources"])


# =============================================================================
# MODELS
# =============================================================================


class CreateDatasourceRequest(BaseModel):
    """Requête de création de datasource."""

    name: str = Field(..., min_length=1, max_length=100, description="Nom unique")
    dataset_id: str = Field(..., description="ID du dataset cible")
    source_type: str = Field(..., description="Type de source (postgres, mysql, csv...)")
    description: str | None = Field(None, max_length=500)
    sync_config: dict[str, Any] | None = Field(
        None, description="Configuration de connexion PyAirbyte"
    )
    sync_mode: str = Field(
        default="full_refresh",
        description="Mode de sync (full_refresh, incremental)",
    )
    ingestion_catalog: dict[str, Any] | None = Field(
        None, description="Catalogue des tables sélectionnées"
    )


class UpdateDatasourceRequest(BaseModel):
    """Requête de mise à jour de datasource."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    source_type: str | None = None
    sync_config: dict[str, Any] | None = None
    is_active: bool | None = None
    sync_mode: str | None = None
    ingestion_catalog: dict[str, Any] | None = None


class DatasourceResponse(BaseModel):
    """Réponse datasource."""

    id: int
    name: str
    type: str
    dataset_id: str | None
    source_type: str | None
    path: str | None
    description: str | None
    sync_config: dict[str, Any] | None
    sync_status: str | None
    last_sync_at: datetime | None
    last_sync_error: str | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None
    sync_mode: str | None
    ingestion_catalog: dict[str, Any] | None


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post("", response_model=DatasourceResponse, status_code=201)
async def create_new_datasource(request: CreateDatasourceRequest) -> dict[str, Any]:
    """
    Crée une nouvelle datasource liée à un dataset.

    La datasource définit comment se connecter à la source externe.
    La synchronisation est lancée séparément via POST /{id}/sync.
    """
    datasource_id = add_datasource(
        name=request.name,
        ds_type=request.source_type,
        dataset_id=request.dataset_id,
        source_type=request.source_type,
        description=request.description,
        sync_config=request.sync_config,
        sync_mode=request.sync_mode,
        ingestion_catalog=request.ingestion_catalog,
    )

    if not datasource_id:
        raise HTTPException(status_code=500, detail=t("datasource.create_failed"))

    datasource = get_datasource(datasource_id)
    if not datasource:
        raise HTTPException(status_code=500, detail=t("datasource.created_not_found"))

    logger.info("Created datasource: %s (id=%d)", request.name, datasource_id)
    return _format_response(datasource)


@router.get("")
async def list_all_datasources(dataset_id: str | None = None) -> dict[str, Any]:
    """
    Liste les datasources.

    Args:
        dataset_id: Filtrer par dataset (optionnel)
    """
    datasources = list_datasources(dataset_id=dataset_id)
    return {
        "datasources": [_format_response(ds) for ds in datasources],
        "count": len(datasources),
    }


@router.get("/{datasource_id}", response_model=DatasourceResponse)
async def get_datasource_details(datasource_id: int) -> dict[str, Any]:
    """Récupère les détails d'une datasource."""
    datasource = get_datasource(datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail=t("datasource.not_found"))
    return _format_response(datasource)


@router.patch("/{datasource_id}", response_model=DatasourceResponse)
async def update_datasource_info(
    datasource_id: int, request: UpdateDatasourceRequest
) -> dict[str, Any]:
    """Met à jour une datasource."""
    success = update_datasource(
        datasource_id=datasource_id,
        name=request.name,
        description=request.description,
        source_type=request.source_type,
        sync_config=request.sync_config,
        is_active=request.is_active,
        sync_mode=request.sync_mode,
        ingestion_catalog=request.ingestion_catalog,
    )
    if not success:
        raise HTTPException(status_code=404, detail=t("datasource.not_found"))

    datasource = get_datasource(datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail=t("datasource.not_found"))
    return _format_response(datasource)


@router.delete("/{datasource_id}")
async def remove_datasource(datasource_id: int) -> dict[str, str]:
    """
    Supprime une datasource.

    Note: Les données déjà synchronisées dans le dataset restent intactes.
    """
    deleted = delete_datasource(datasource_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=t("datasource.not_found"))
    logger.info("Deleted datasource: %d", datasource_id)
    return {"message": t("datasource.deleted"), "id": str(datasource_id)}


@router.post("/{datasource_id}/sync")
async def trigger_sync(datasource_id: int) -> dict[str, Any]:
    """
    Lance une synchronisation de la datasource vers son dataset DuckDB.

    Cette route déclenche une tâche Celery asynchrone.
    Le statut peut être suivi via:
    - GET /{id} pour le statut de la datasource
    - GET /catalog/jobs/{job_id} pour le suivi détaillé du job
    - GET /catalog/job-stream/{run_id} pour le streaming SSE

    Returns:
        - message: Confirmation
        - datasource_id: ID de la datasource
        - task_id: ID de la task Celery
        - job_id: ID du job dans catalog_jobs
        - run_id: UUID du run (pour SSE streaming)
        - status: "pending"
    """
    datasource = get_datasource(datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail=t("datasource.not_found"))

    if not datasource.get("sync_config"):
        raise HTTPException(status_code=400, detail=t("datasource.no_sync_config"))

    # Vérifier qu'une sync n'est pas déjà en cours
    current_status = datasource.get("sync_status")
    if current_status == "running":
        raise HTTPException(
            status_code=409,
            detail=t("datasource.sync_already_running"),
        )

    # Créer le job de sync AVANT de lancer la task Celery
    # Cela permet de retourner job_id et run_id immédiatement
    from services.sync_service import create_sync_job  # noqa: PLC0415

    job_id, run_id = create_sync_job(datasource_id)

    # Import lazy pour éviter de charger Celery au démarrage de FastAPI
    from tasks.datasources import sync_datasource_task  # noqa: PLC0415

    # Lancer la task Celery avec le job_id pré-créé
    task = sync_datasource_task.delay(datasource_id, job_id)

    logger.info(
        "Sync triggered for datasource %d, task_id=%s, job_id=%d, run_id=%s",
        datasource_id,
        task.id,
        job_id,
        run_id,
    )

    return {
        "message": t("datasource.sync_triggered"),
        "datasource_id": datasource_id,
        "task_id": task.id,
        "job_id": job_id,
        "run_id": run_id,
        "status": "pending",
    }


# =============================================================================
# HELPERS
# =============================================================================


def _format_response(datasource: dict[str, Any]) -> dict[str, Any]:
    """Formate une datasource pour la réponse API."""
    return {
        "id": datasource.get("id"),
        "name": datasource.get("name"),
        "type": datasource.get("type"),
        "dataset_id": datasource.get("dataset_id"),
        "source_type": datasource.get("source_type"),
        "path": datasource.get("path"),
        "description": datasource.get("description"),
        "sync_config": datasource.get("sync_config"),
        "sync_status": datasource.get("sync_status"),
        "last_sync_at": datasource.get("last_sync_at"),
        "last_sync_error": datasource.get("last_sync_error"),
        "is_active": bool(datasource.get("is_active", 1)),
        "created_at": datasource.get("created_at"),
        "updated_at": datasource.get("updated_at"),
        "sync_mode": datasource.get("sync_mode", "full_refresh"),
        "ingestion_catalog": datasource.get("ingestion_catalog"),
    }
