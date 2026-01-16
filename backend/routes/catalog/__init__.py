"""
Routes Catalog - Gestion du catalogue sémantique.

Regroupe tous les endpoints sous /catalog.
L'import `from routes.catalog import router` reste identique.
"""

from fastapi import APIRouter

# Import des handlers depuis les sous-modules
from .crud import (
    delete_catalog,
    get_catalog,
    toggle_table_enabled_endpoint,
    update_column_description,
)
from .jobs import (
    get_catalog_job_by_id,
    get_latest_run,
    get_run,
    list_all_runs,
    list_catalog_jobs,
)
from .operations import (
    enrich_catalog_endpoint,
    extract_catalog_endpoint,
)
from .streams import stream_catalog_status, stream_run_jobs

# Router principal avec toutes les routes
router = APIRouter(prefix="/catalog", tags=["catalog"])

# CRUD routes
router.add_api_route("", get_catalog, methods=["GET"])
router.add_api_route("", delete_catalog, methods=["DELETE"])
router.add_api_route("/tables/{table_id}/toggle", toggle_table_enabled_endpoint, methods=["PATCH"])
router.add_api_route(
    "/columns/{column_id}/description", update_column_description, methods=["PATCH"]
)

# Operations routes
router.add_api_route("/extract", extract_catalog_endpoint, methods=["POST"])
router.add_api_route("/enrich", enrich_catalog_endpoint, methods=["POST"])

# Jobs routes
router.add_api_route("/jobs", list_catalog_jobs, methods=["GET"])
router.add_api_route("/jobs/{job_id}", get_catalog_job_by_id, methods=["GET"])
router.add_api_route("/run/{run_id}", get_run, methods=["GET"])
router.add_api_route("/latest-run", get_latest_run, methods=["GET"])
router.add_api_route("/runs", list_all_runs, methods=["GET"])

# SSE streams routes
router.add_api_route("/job-stream/{run_id}", stream_run_jobs, methods=["GET"])
router.add_api_route("/status-stream", stream_catalog_status, methods=["GET"])

# Réexporter le router pour backward compatibility
__all__ = ["router"]
