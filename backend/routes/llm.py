"""
Routes pour la gestion des LLM providers et modèles.

Endpoints:
- GET /llm/providers - Lister les providers
- GET /llm/models - Lister les modèles
- GET /llm/models/default - Modèle par défaut
- PUT /llm/models/default/{model_id} - Définir le modèle par défaut
- PUT /llm/providers/{name}/config - Configurer un provider
- GET /llm/costs - Statistiques de coûts
- GET /llm/status - Statut du LLM
- GET /llm/prompts - Lister les prompts
- GET /llm/prompts/{key} - Récupérer un prompt
- PUT /llm/prompts/{key}/active - Activer une version de prompt
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from i18n import t
from llm_config import (
    check_local_provider_available,
    get_active_prompt,
    get_all_prompts,
    get_api_key_hint,
    get_costs_by_hour,
    get_costs_by_model,
    get_costs_by_source,
    get_models,
    get_prompts,
    get_provider_by_name,
    get_providers,
    get_total_costs,
    set_active_prompt,
    set_default_model,
    update_prompt_content,
    update_provider_base_url,
)
from llm_config import get_default_model
from llm_service import check_llm_status
from routes.dependencies import PromptUpdateRequest, ProviderConfigRequest, SetActivePromptRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/providers")
async def list_llm_providers() -> dict[str, list[dict[str, Any]]]:
    """Liste tous les providers LLM disponibles."""
    providers = get_providers()
    result = []
    for p in providers:
        hint = get_api_key_hint(p["id"])

        # Déterminer si le provider est prêt à être utilisé
        if p.get("requires_api_key"):
            is_available = hint is not None
        else:
            # Provider local - vérifier s'il est accessible
            is_available = check_local_provider_available(p["name"])

        # Convertir les booléens PostgreSQL (0/1) en vrais booléens
        provider_data = {
            "id": p["id"],
            "name": p["name"],
            "display_name": p["display_name"],
            "type": p["type"],
            "base_url": p.get("base_url"),
            "requires_api_key": bool(p.get("requires_api_key")),
            "is_enabled": bool(p.get("is_enabled")),
            "api_key_configured": hint is not None,
            "api_key_hint": hint,
            "is_available": is_available,
        }
        result.append(provider_data)
    return {"providers": result}


@router.get("/models")
async def list_llm_models(provider_name: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Liste les modèles LLM disponibles (optionnellement filtrés par provider)."""
    if provider_name:
        provider = get_provider_by_name(provider_name)
        if not provider:
            raise HTTPException(status_code=404, detail=t("provider.not_found", name=provider_name))
        models = get_models(provider["id"])
    else:
        models = get_models()
    return {"models": models}


@router.get("/models/default")
async def get_llm_default_model() -> dict[str, Any]:
    """Récupère le modèle LLM par défaut."""
    model = get_default_model()
    if not model:
        raise HTTPException(status_code=404, detail=t("llm.no_default_model"))
    return {"model": model}


@router.put("/models/default/{model_id}")
async def set_llm_default_model(model_id: str) -> dict[str, str]:
    """Définit le modèle LLM par défaut."""
    # Chercher le modèle par model_id
    models = get_models()
    model = next((m for m in models if m["model_id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail=t("model.not_found", id=model_id))

    # set_default_model attend le model_id string (pas l'id interne)
    set_default_model(model_id)
    return {"message": f"Modèle par défaut: {model_id}"}


@router.put("/providers/{provider_name}/config")
async def update_provider_config(
    provider_name: str, config: ProviderConfigRequest
) -> dict[str, str]:
    """Met à jour la configuration d'un provider (base_url pour self-hosted)."""
    provider = get_provider_by_name(provider_name)
    if not provider:
        raise HTTPException(status_code=404, detail=t("provider.not_found", name=provider_name))

    if provider.get("requires_api_key"):
        raise HTTPException(status_code=400, detail=t("provider.no_base_url"))

    if config.base_url:
        update_provider_base_url(provider["id"], config.base_url)
        return {"message": f"Configuration mise à jour pour {provider_name}"}
    update_provider_base_url(provider["id"], None)
    return {"message": f"Configuration supprimée pour {provider_name}"}


@router.get("/costs")
async def get_llm_costs(days: int = 30) -> dict[str, Any]:
    """Récupère les coûts LLM des N derniers jours."""
    total = get_total_costs(days)
    by_hour = get_costs_by_hour(days)
    by_model = get_costs_by_model(days)
    by_source = get_costs_by_source(days)

    return {
        "period_days": days,
        "total": total,
        "by_hour": by_hour,
        "by_model": by_model,
        "by_source": by_source,
    }


@router.get("/status")
async def get_llm_status_endpoint() -> dict[str, Any]:
    """Vérifie le statut du LLM."""
    return check_llm_status()


@router.get("/prompts")
async def list_llm_prompts(category: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Liste tous les prompts LLM."""
    prompts = get_prompts(category=category)
    return {"prompts": prompts}


@router.get("/prompts/{key}")
async def get_llm_prompt(key: str) -> dict[str, dict[str, Any]]:
    """Récupère le prompt actif pour une clé."""
    prompt = get_active_prompt(key)
    if not prompt:
        raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
    return {"prompt": prompt}


@router.put("/prompts/{key}/active")
async def set_llm_active_prompt(key: str, request: SetActivePromptRequest) -> dict[str, str]:
    """Active une version spécifique d'un prompt."""
    success = set_active_prompt(key, request.version)
    if not success:
        raise HTTPException(
            status_code=404, detail=f"Prompt '{key}' version '{request.version}' non trouvé"
        )
    return {"message": f"Prompt '{key}' version '{request.version}' activé"}


# ========================================
# ENDPOINTS PROMPTS (legacy, à consolider)
# ========================================


@router.get("/all-prompts", include_in_schema=False)
async def list_prompts_legacy() -> dict[str, list[dict[str, Any]]]:
    """Liste tous les prompts avec leur version active (legacy endpoint)."""
    try:
        prompts = get_all_prompts()
        return {"prompts": prompts}
    except Exception as e:
        logger.error("Erreur récupération prompts: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/prompts/{key}/content")
async def update_prompt(key: str, request: PromptUpdateRequest) -> dict[str, str]:
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
