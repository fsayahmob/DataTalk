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
from constants import CatalogConfig, QueryConfig
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

    # Fallback vers la valeur par défaut si non trouvée en base
    if value is None and key in EDITABLE_SETTINGS:
        value = EDITABLE_SETTINGS[key].get("default")

    if value is None:
        raise HTTPException(status_code=404, detail=t("settings.not_found", key=key))
    # Masquer les clés API
    if "api_key" in key.lower() and len(value) > 8:
        return {"key": key, "value": value[:4] + "..." + value[-4:]}
    return {"key": key, "value": value}


# Configuration déclarative des settings éditables
# Chaque setting définit: validation, invalidation du cache, actions spéciales
EDITABLE_SETTINGS: dict[str, dict[str, Any]] = {
    "catalog_context_mode": {
        "allowed_values": ("compact", "full"),
        "default": "compact",
        "invalidates_schema_cache": True,
    },
    "duckdb_path": {
        "type": "path",
        "invalidates_schema_cache": True,
        "reconnect_db": True,
    },
    "max_tables_per_batch": {
        "type": "int",
        "min": 1,
        "max": 50,
        "default": str(CatalogConfig.DEFAULT_MAX_TABLES_PER_BATCH),
    },
    "max_chart_rows": {
        "type": "int",
        "min": 100,
        "max": 100000,
        "default": str(QueryConfig.MAX_CHART_ROWS),
    },
    "query_timeout_ms": {
        "type": "int",
        "min": 1000,
        "max": 300000,  # 5 minutes max
        "default": str(QueryConfig.DEFAULT_TIMEOUT_MS),
    },
}


def _validate_setting(key: str, value: str, config: dict[str, Any]) -> str | None:
    """Valide une valeur de setting selon sa config. Retourne le message d'erreur ou None."""
    # Validation par valeurs autorisées
    if "allowed_values" in config and value not in config["allowed_values"]:
        return t("validation.allowed_values", values=str(config["allowed_values"]))

    # Validation numérique
    if config.get("type") == "int":
        try:
            val = int(value)
            if ("min" in config and val < config["min"]) or ("max" in config and val > config["max"]):
                return t("validation.range_error", min=config.get("min", 0), max=config.get("max", "∞"))
        except ValueError:
            return t("validation.numeric_required")

    # Validation de chemin
    if config.get("type") == "path":
        path = value
        if not Path(path).is_absolute():
            path = str(Path(__file__).parent.parent / ".." / path)
        path = str(Path(path).resolve())
        if not Path(path).exists():
            return t("db.file_not_found", path=path)

    return None


def _apply_side_effects(key: str, value: str, config: dict[str, Any]) -> dict[str, Any]:
    """Applique les effets de bord après la mise à jour d'un setting."""
    extra_response: dict[str, Any] = {}

    # Invalider le cache schéma si nécessaire
    if config.get("invalidates_schema_cache"):
        app_state.db_schema_cache = None
        logger.info("Setting '%s' changé, cache schéma invalidé", key)

    # Reconnexion DuckDB si nécessaire
    if config.get("reconnect_db"):
        new_path = value
        if not Path(new_path).is_absolute():
            new_path = str(Path(__file__).parent.parent / ".." / new_path)
        new_path = str(Path(new_path).resolve())

        if app_state.db_connection:
            app_state.db_connection.close()
        app_state.current_db_path = new_path
        app_state.db_connection = duckdb.connect(new_path, read_only=True)
        extra_response["resolved_path"] = new_path
        logger.info("DuckDB reconnecté à: %s", new_path)

    return extra_response


@router.put("/settings/{key}")
async def update_single_setting(key: str, request: UpdateSettingRequest) -> dict[str, Any]:
    """Met à jour une configuration spécifique."""
    # Vérifier si la clé est éditable
    if key not in EDITABLE_SETTINGS:
        raise HTTPException(status_code=400, detail=t("settings.not_editable", key=key))

    config = EDITABLE_SETTINGS[key]

    # Valider la valeur
    error = _validate_setting(key, request.value, config)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Sauvegarder le setting
    set_setting(key, request.value)

    # Appliquer les effets de bord (invalidation cache, reconnexion DB, etc.)
    extra = _apply_side_effects(key, request.value, config)

    return {"status": "ok", "key": key, "value": request.value, **extra}
