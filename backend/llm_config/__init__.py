"""
Configuration LLM pour DataTalk.

Ce package gère les providers, modèles, secrets (chiffrés), tracking des coûts et prompts.
Réexporte toutes les fonctions pour maintenir la compatibilité avec les imports existants.
"""

# Réexporter les dépendances pour que les mocks des tests fonctionnent
# (les tests mockent llm_config.get_connection, llm_config.encrypt, etc.)
from crypto import decrypt, encrypt
from db import get_connection

from .costs import (
    get_costs_by_hour,
    get_costs_by_model,
    get_costs_by_period,
    get_costs_by_source,
    get_total_costs,
    log_cost,
)
from .models import (
    get_default_model,
    get_model,
    get_model_by_model_id,
    get_models,
    set_default_model,
)
from .prompts import (
    add_prompt,
    delete_prompt,
    get_active_prompt,
    get_all_prompts,
    get_prompt,
    get_prompts,
    set_active_prompt,
    update_prompt,
    update_prompt_content,
)
from .providers import (
    SELFHOSTED_HEALTH_ENDPOINTS,
    check_local_provider_available,
    get_provider,
    get_provider_by_name,
    get_providers,
    update_provider_base_url,
)
from .secrets import (
    get_api_key,
    get_api_key_hint,
    has_api_key,
    set_api_key,
)

__all__ = [
    # Providers
    "SELFHOSTED_HEALTH_ENDPOINTS",
    # Prompts
    "add_prompt",
    "check_local_provider_available",
    "delete_prompt",
    "get_active_prompt",
    "get_all_prompts",
    # Secrets
    "get_api_key",
    "get_api_key_hint",
    # Costs
    "get_costs_by_hour",
    "get_costs_by_model",
    "get_costs_by_period",
    "get_costs_by_source",
    # Models
    "get_default_model",
    "get_model",
    "get_model_by_model_id",
    "get_models",
    "get_prompt",
    "get_prompts",
    "get_provider",
    "get_provider_by_name",
    "get_providers",
    "get_total_costs",
    "has_api_key",
    "log_cost",
    "set_active_prompt",
    "set_api_key",
    "set_default_model",
    "update_prompt",
    "update_prompt_content",
    "update_provider_base_url",
]
