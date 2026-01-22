"""
Routes pour les widgets, KPIs et questions suggérées.

Endpoints:
- GET /widgets - Récupérer les widgets avec données
- POST /widgets/refresh - Rafraîchir tous les widgets
- POST /widgets/{id}/refresh - Rafraîchir un widget
- GET /kpis - Récupérer les KPIs avec données
- GET /suggested-questions - Questions suggérées
- GET /prompts - Lister les prompts (legacy)
- GET /prompts/{key} - Récupérer un prompt (legacy)
- PUT /prompts/{key} - Mettre à jour un prompt (legacy)
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import get_suggested_questions
from core.state import app_state
from db import get_connection
from i18n import t
from kpi_service import get_all_kpis_with_data
from llm_config import get_active_prompt, get_all_prompts, update_prompt_content
from routes.dependencies import PromptUpdateRequest
from widget_service import (
    get_all_widgets_with_data,
    refresh_all_widgets_cache,
    refresh_single_widget_cache,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["widgets"])


@router.get("/widgets")
async def list_widgets(use_cache: bool = True) -> dict[str, list[dict[str, Any]]]:
    """
    Récupère tous les widgets actifs avec leurs données.
    Les données sont cachées pour éviter 100 clients = 100 requêtes identiques.

    Query params:
        use_cache: Si False, force le recalcul (défaut: True)
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    try:
        widgets = get_all_widgets_with_data(app_state.db_connection, use_cache=use_cache)
        return {"widgets": widgets}
    except Exception as e:
        # Table n'existe pas encore ou autre erreur -> retourner liste vide
        logger.warning("Erreur chargement widgets: %s", e)
        return {"widgets": []}


@router.post("/widgets/refresh")
async def refresh_widgets() -> dict[str, Any]:
    """
    Force le recalcul du cache de tous les widgets.
    Utile après une mise à jour des données ou du catalogue.
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    return refresh_all_widgets_cache(app_state.db_connection)


@router.post("/widgets/{widget_id}/refresh")
async def refresh_widget(widget_id: str) -> dict[str, Any]:
    """
    Force le recalcul du cache d'un widget spécifique.
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    result = refresh_single_widget_cache(widget_id, app_state.db_connection)
    if "error" in result and not result.get("success", True):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/kpis")
async def list_kpis() -> dict[str, list[dict[str, Any]]]:
    """
    Récupère les 4 KPIs avec leurs données calculées.
    Exécute les 3 requêtes SQL par KPI (value, trend, sparkline).
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    try:
        kpis = get_all_kpis_with_data(app_state.db_connection)
        return {"kpis": kpis}
    except Exception as e:
        logger.warning("Erreur chargement KPIs: %s", e)
        return {"kpis": []}


@router.get("/suggested-questions")
async def list_suggested_questions() -> dict[str, list[dict[str, Any]]]:
    """
    Récupère les questions suggérées (générées par LLM lors de l'enrichissement).
    Retourne une liste vide si le catalogue est vide ou si aucune question n'a été générée.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Vérifier si le catalogue existe (au moins une table)
        cursor.execute("SELECT COUNT(*) as count FROM tables")
        table_count = cursor.fetchone()["count"]
        conn.close()

        if table_count == 0:
            return {"questions": []}

        # Questions générées par LLM (table suggested_questions)
        questions = get_suggested_questions(enabled_only=True)
        return {"questions": questions}
    except Exception as e:
        logger.warning("Erreur chargement questions suggérées: %s", e)
        return {"questions": []}


# ========================================
# ENDPOINTS PROMPTS (legacy, conservés pour compatibilité)
# ========================================


@router.get("/prompts")
async def list_prompts() -> dict[str, list[dict[str, Any]]]:
    """Liste tous les prompts avec leur version active."""
    try:
        prompts = get_all_prompts()
        return {"prompts": prompts}
    except Exception as e:
        logger.error("Erreur récupération prompts: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/prompts/{key}")
async def get_prompt(key: str) -> dict[str, Any]:
    """Récupère un prompt spécifique par sa clé."""
    try:
        prompt = get_active_prompt(key)
        if not prompt:
            raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
        return prompt
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération prompt %s: %s", key, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/prompts/{key}")
async def update_prompt_endpoint(key: str, request: PromptUpdateRequest) -> dict[str, str]:
    """Met à jour le contenu d'un prompt actif."""
    try:
        success = update_prompt_content(key, request.content)
        if not success:
            raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
        return {"status": "ok", "message": t("prompt.updated")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur mise à jour prompt %s: %s", key, e)
        raise HTTPException(status_code=500, detail=str(e)) from e
