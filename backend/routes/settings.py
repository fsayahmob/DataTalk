"""
Routes pour la configuration système et le health check.

Endpoints:
- GET /health - Health check enrichi
- GET /database/status - Statut DuckDB
- POST /refresh-schema - Rafraîchir le cache du schéma
- GET /schema - Schéma actuel pour le LLM
- GET/PUT /settings - Configuration globale
- GET/PUT /settings/{key} - Configuration par clé
"""

import logging
import time
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, HTTPException

from catalog import get_all_settings, get_schema_for_llm, get_setting, set_setting
from core.state import app_state, get_system_instruction
from db import get_connection
from i18n import t
from llm_config import (
    get_api_key_hint,
    get_default_model,
    get_provider_by_name,
    get_providers,
    set_api_key,
    set_default_model,
)
from llm_service import check_llm_status
from routes.dependencies import SettingsUpdateRequest, UpdateSettingRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """
    Health check enrichi pour monitoring et déploiement.
    Retourne l'état de tous les composants critiques.
    """
    start = time.perf_counter()

    # État de la base DuckDB
    db_status = "connected" if app_state.db_connection else "disconnected"
    db_details: dict[str, Any] = {"status": db_status}
    if app_state.db_connection:
        try:
            row_result = app_state.db_connection.execute("SELECT 1").fetchone()
            db_details["responsive"] = row_result is not None
        except Exception:
            db_details["responsive"] = False

    # État du LLM
    llm_status = check_llm_status()

    # État du catalogue SQLite
    catalog_status: dict[str, Any] = {"status": "unknown"}
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tables")
        table_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM columns")
        column_count = cursor.fetchone()[0]
        conn.close()
        catalog_status = {
            "status": "ok",
            "tables": table_count,
            "columns": column_count,
        }
    except Exception as e:
        catalog_status = {"status": "error", "error": str(e)}

    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "version": "1.0.0",
        "components": {
            "database": db_details,
            "llm": llm_status,
            "catalog": catalog_status,
        },
        "response_time_ms": elapsed_ms,
    }


@router.get("/database/status")
async def get_database_status() -> dict[str, Any]:
    """Retourne le statut et la configuration de la base DuckDB."""
    return {
        "status": "connected" if app_state.db_connection else "disconnected",
        "path": app_state.current_db_path,
        "configured_path": get_setting("duckdb_path") or "data/g7_analytics.duckdb",
        "engine": "DuckDB",
    }


@router.post("/refresh-schema")
async def refresh_schema() -> dict[str, Any]:
    """Rafraîchit le cache du schéma depuis le catalogue SQLite."""
    app_state.db_schema_cache = get_schema_for_llm()
    return {
        "status": "ok",
        "message": t("db.schema_refreshed"),
        "schema_preview": app_state.db_schema_cache[:500] + "...",
    }


@router.get("/schema")
async def get_schema() -> dict[str, str]:
    """Retourne le schéma actuel utilisé par le LLM."""
    return {"schema": get_system_instruction()}


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    """Récupère toutes les configurations + statut LLM."""
    settings = get_all_settings()

    # Ajouter les infos LLM
    llm_status = check_llm_status()
    default_model = get_default_model()

    # Liste des providers avec statut des clés
    providers = get_providers()
    providers_status = []
    for p in providers:
        hint = get_api_key_hint(p["id"])
        providers_status.append(
            {
                "name": p["name"],
                "display_name": p["display_name"],
                "type": p["type"],
                "requires_api_key": p["requires_api_key"],
                "api_key_configured": hint is not None,
                "api_key_hint": hint,
            }
        )

    return {
        "settings": settings,
        "llm": {
            "status": llm_status["status"],
            "message": llm_status.get("message"),
            "current_model": default_model,
            "providers": providers_status,
        },
    }


@router.put("/settings")
async def update_settings(request: SettingsUpdateRequest) -> dict[str, str]:
    """Met à jour les configurations LLM."""
    messages = []

    # Mettre à jour une clé API
    if request.api_key is not None and request.provider_name is not None:
        provider = get_provider_by_name(request.provider_name)
        if not provider:
            raise HTTPException(
                status_code=404, detail=t("provider.not_found", name=request.provider_name)
            )
        set_api_key(provider["id"], request.api_key)
        messages.append(t("settings.api_key_saved", provider=request.provider_name))

    # Mettre à jour le modèle par défaut
    if request.default_model_id is not None:
        set_default_model(request.default_model_id)
        messages.append(t("settings.model_set", model=request.default_model_id))

    if not messages:
        return {"message": t("settings.no_change")}

    return {"message": "; ".join(messages)}


@router.get("/settings/{key}")
async def get_single_setting(key: str) -> dict[str, str]:
    """Récupère une configuration spécifique."""
    value = get_setting(key)
    if value is None:
        raise HTTPException(status_code=404, detail=t("settings.not_found", key=key))
    # Masquer les clés API
    if "api_key" in key.lower() and len(value) > 8:
        return {"key": key, "value": value[:4] + "..." + value[-4:]}
    return {"key": key, "value": value}


@router.put("/settings/{key}")
async def update_single_setting(key: str, request: UpdateSettingRequest) -> dict[str, Any]:
    """Met à jour une configuration spécifique."""
    # Liste des clés autorisées
    allowed_keys = ["catalog_context_mode", "duckdb_path", "max_tables_per_batch", "max_chart_rows"]
    if key not in allowed_keys:
        raise HTTPException(status_code=400, detail=t("settings.not_editable", key=key))

    # Validation spécifique par clé
    if key == "catalog_context_mode" and request.value not in ("compact", "full"):
        raise HTTPException(
            status_code=400, detail=t("validation.allowed_values", values="'compact', 'full'")
        )

    if key == "max_tables_per_batch":
        try:
            val = int(request.value)
            if val < 1 or val > 50:
                raise HTTPException(
                    status_code=400, detail=t("validation.range_error", min=1, max=50)
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=t("validation.numeric_required")) from e

    if key == "max_chart_rows":
        try:
            val = int(request.value)
            if val < 100 or val > 100000:
                raise HTTPException(
                    status_code=400, detail=t("validation.range_error", min=100, max=100000)
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=t("validation.numeric_required")) from e

    if key == "duckdb_path":
        # Valider que le fichier existe
        new_path = request.value
        if not Path(new_path).is_absolute():
            new_path = str(Path(__file__).parent.parent / ".." / new_path)
        new_path = str(Path(new_path).resolve())

        if not Path(new_path).exists():
            raise HTTPException(status_code=400, detail=t("db.file_not_found", path=new_path))

        # Sauvegarder le setting
        set_setting(key, request.value)

        # Reconnecter à la nouvelle base
        if app_state.db_connection:
            app_state.db_connection.close()
        app_state.current_db_path = new_path
        app_state.db_connection = duckdb.connect(new_path, read_only=True)

        # Invalider le cache du schéma
        app_state.db_schema_cache = None

        logger.info("DuckDB reconnecté à: %s", new_path)
        return {"status": "ok", "key": key, "value": request.value, "resolved_path": new_path}

    set_setting(key, request.value)
    return {"status": "ok", "key": key, "value": request.value}
