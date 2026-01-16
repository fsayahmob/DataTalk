"""
Service LLM centralisé pour G7 Analytics.

Utilise LiteLLM pour une interface unifiée multi-provider.
Gère le tracking des coûts automatiquement.
Inclut un circuit breaker pour protéger contre le spam.

Ce package réexporte toutes les fonctions pour maintenir la compatibilité
avec les imports existants: from llm_service import call_llm
"""

import logging

import litellm

# Désactiver les logs dupliqués de LiteLLM et httpx
# LiteLLM log via son propre système ET via le logger Python standard
# httpx log les URLs avec les clés API en clair - dangereux!
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("litellm").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Désactiver les logs verbeux de LiteLLM
litellm.set_verbose = False  # type: ignore[attr-defined]

# Errors
from .errors import LLMError, LLMErrorCode, _handle_litellm_exception

# Circuit Breaker
from .circuit_breaker import (
    CircuitBreaker,
    _circuit_breaker,
    get_circuit_breaker_status,
    reset_circuit_breaker,
)

# Models
from .models import LLMResponse, StructuredLLMResponse

# Helpers
from .helpers import _get_api_key_for_model, _get_litellm_model_name

# Calls
from .calls import call_llm, call_llm_structured, check_llm_status

__all__ = [
    # Circuit Breaker
    "CircuitBreaker",
    # Errors
    "LLMError",
    "LLMErrorCode",
    # Models
    "LLMResponse",
    "StructuredLLMResponse",
    "_circuit_breaker",
    # Helpers
    "_get_api_key_for_model",
    "_get_litellm_model_name",
    "_handle_litellm_exception",
    # Calls
    "call_llm",
    "call_llm_structured",
    "check_llm_status",
    "get_circuit_breaker_status",
    "reset_circuit_breaker",
]
