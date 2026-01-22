"""
Fonctions d'appel LLM.

Contient call_llm, call_llm_structured et check_llm_status.
Fonctions helper communes pour réduire la duplication.
"""

import logging
import time
from typing import Any, TypeVar

import instructor
import litellm
from llm_config import get_default_model, get_model, log_cost
from pydantic import BaseModel

from .circuit_breaker import _circuit_breaker
from .errors import (
    ErrorSeverity,
    LLMError,
    LLMErrorCode,
    _handle_litellm_exception,
    get_error_severity,
)
from .helpers import _get_api_key_for_model, _get_litellm_model_name
from .models import LLMResponse

# Type générique pour les réponses structurées
T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)


# =============================================================================
# FONCTIONS HELPER COMMUNES (EXTRACTION DUPLICATION)
# =============================================================================


def _prepare_llm_call(
    model_id: int | None = None,
) -> tuple[dict[str, Any], str, str | None]:
    """
    Prépare un appel LLM (validation et configuration).

    Args:
        model_id: ID du modèle à utiliser (défaut: modèle par défaut)

    Returns:
        Tuple (model_config, litellm_model_name, api_key)

    Raises:
        LLMError: Si circuit ouvert, modèle non configuré, ou clé API manquante
    """
    # Vérifier le circuit breaker
    if not _circuit_breaker.allow_request():
        raise LLMError(
            LLMErrorCode.SERVICE_UNAVAILABLE,
            details="Circuit breaker open - too many recent failures",
        )

    # Récupérer le modèle
    model = get_model(model_id) if model_id else get_default_model()
    if not model:
        raise LLMError(LLMErrorCode.NOT_CONFIGURED)

    provider_name = model.get("provider_display_name", "")

    # Récupérer la clé API
    api_key = _get_api_key_for_model(model)
    if not api_key and model.get("requires_api_key", True):
        raise LLMError(LLMErrorCode.API_KEY_MISSING, provider_name)

    # Construire le nom LiteLLM
    litellm_model = _get_litellm_model_name(model)

    return model, litellm_model, api_key


def _calculate_cost(
    tokens_input: int,
    tokens_output: int,
    model: dict[str, Any],
) -> tuple[float, float, float]:
    """
    Calcule le coût d'un appel LLM.

    Args:
        tokens_input: Nombre de tokens en entrée
        tokens_output: Nombre de tokens en sortie
        model: Configuration du modèle avec cost_per_1m_input/output

    Returns:
        Tuple (cost_input, cost_output, cost_total)
    """
    cost_input = tokens_input * model.get("cost_per_1m_input", 0) / 1_000_000
    cost_output = tokens_output * model.get("cost_per_1m_output", 0) / 1_000_000
    return cost_input, cost_output, cost_input + cost_output


def _finalize_llm_success(
    model: dict[str, Any],
    tokens_input: int,
    tokens_output: int,
    response_time_ms: int,
    source: str,
    conversation_id: int | None,
) -> float:
    """
    Finalise un appel LLM réussi (log coût, record success).

    Args:
        model: Configuration du modèle
        tokens_input: Nombre de tokens en entrée
        tokens_output: Nombre de tokens en sortie
        response_time_ms: Temps de réponse
        source: Source de l'appel
        conversation_id: ID de la conversation

    Returns:
        Coût total
    """
    _, _, cost_total = _calculate_cost(tokens_input, tokens_output, model)

    log_cost(
        model_id=model["id"],
        source=source,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        response_time_ms=response_time_ms,
        conversation_id=conversation_id,
        success=True,
    )

    _circuit_breaker.record_success()
    return cost_total


def _handle_llm_failure(
    error: Exception,
    model: dict[str, Any],
    response_time_ms: int,
    source: str,
    conversation_id: int | None,
) -> LLMError:
    """
    Gère un échec d'appel LLM (circuit breaker, logging).

    Args:
        error: Exception capturée
        model: Configuration du modèle
        response_time_ms: Temps de réponse
        source: Source de l'appel
        conversation_id: ID de la conversation

    Returns:
        LLMError typé à relancer
    """
    provider_name = model.get("provider_display_name", "")
    llm_error = _handle_litellm_exception(error, provider_name)

    # Circuit breaker: enregistrer l'échec avec classification
    is_transient = get_error_severity(llm_error.code) == ErrorSeverity.TRANSIENT
    _circuit_breaker.record_failure(is_transient=is_transient)

    # Logger l'erreur
    log_cost(
        model_id=model["id"],
        source=source,
        tokens_input=0,
        tokens_output=0,
        response_time_ms=response_time_ms,
        conversation_id=conversation_id,
        success=False,
        error_message=str(error),
    )

    return llm_error


def _build_completion_kwargs(
    litellm_model: str,
    messages: list[dict[str, str]],
    api_key: str | None,
    model: dict[str, Any],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    """
    Construit les kwargs pour LiteLLM completion.

    Args:
        litellm_model: Nom du modèle LiteLLM
        messages: Liste des messages
        api_key: Clé API (optionnel)
        model: Configuration du modèle
        temperature: Température
        max_tokens: Max tokens en sortie

    Returns:
        Dict kwargs pour litellm.completion
    """
    completion_kwargs: dict[str, Any] = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if api_key:
        completion_kwargs["api_key"] = api_key

    base_url = model.get("base_url")
    if base_url:
        completion_kwargs["api_base"] = base_url

    return completion_kwargs


# =============================================================================
# FONCTIONS PUBLIQUES
# =============================================================================


def call_llm(
    prompt: str,
    system_prompt: str | None = None,
    model_id: int | None = None,
    source: str = "analytics",
    conversation_id: int | None = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
) -> LLMResponse:
    """
    Appelle un LLM et retourne la réponse avec métadonnées.

    Args:
        prompt: Le prompt utilisateur
        system_prompt: Instructions système (optionnel)
        model_id: ID du modèle à utiliser (défaut: modèle par défaut)
        source: Source de l'appel pour le tracking ("analytics", "catalog", "enrichment")
        conversation_id: ID de la conversation (optionnel)
        temperature: Température (0.0 = déterministe)
        max_tokens: Nombre max de tokens en sortie

    Returns:
        LLMResponse avec le contenu et les métadonnées

    Raises:
        LLMError: Erreur typée avec code i18n
    """
    # Préparation commune
    model, litellm_model, api_key = _prepare_llm_call(model_id)

    # Construire les messages
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # Construire les kwargs
    completion_kwargs = _build_completion_kwargs(
        litellm_model, messages, api_key, model, temperature, max_tokens
    )

    start_time = time.time()

    try:
        response = litellm.completion(**completion_kwargs)
        response_time_ms = int((time.time() - start_time) * 1000)

        # Extraire les infos
        content = response.choices[0].message.content or ""
        tokens_input = response.usage.prompt_tokens if response.usage else 0
        tokens_output = response.usage.completion_tokens if response.usage else 0

        # Vérifier réponse vide
        if not content.strip():
            raise LLMError(LLMErrorCode.EMPTY_RESPONSE, model.get("provider_display_name", ""))

        # Finaliser le succès
        cost_total = _finalize_llm_success(
            model, tokens_input, tokens_output, response_time_ms, source, conversation_id
        )

        return LLMResponse(
            content=content,
            model_id=model["id"],
            model_name=model["display_name"],
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            response_time_ms=response_time_ms,
            cost_total=cost_total,
        )

    except LLMError:
        raise

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        llm_error = _handle_llm_failure(e, model, response_time_ms, source, conversation_id)
        raise llm_error from e


def call_llm_structured(
    prompt: str,
    response_model: type[T],
    system_prompt: str | None = None,
    model_id: int | None = None,
    source: str = "analytics",
    conversation_id: int | None = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
) -> tuple[T, dict[str, Any]]:
    """
    Appelle un LLM et retourne une réponse structurée (Pydantic).

    Args:
        prompt: Le prompt utilisateur
        response_model: Classe Pydantic pour la réponse
        system_prompt: Instructions système (optionnel)
        model_id: ID du modèle à utiliser
        source: Source de l'appel pour le tracking
        conversation_id: ID de la conversation (optionnel)
        temperature: Température
        max_tokens: Nombre max de tokens en sortie

    Returns:
        Tuple (objet Pydantic, métadonnées dict)

    Raises:
        LLMError: Erreur typée avec code i18n
    """
    # Préparation commune
    model, litellm_model, api_key = _prepare_llm_call(model_id)

    # Construire les messages
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # Déterminer le mode Instructor basé sur le provider
    # Gemini ne supporte pas bien le mode TOOLS, utiliser JSON
    provider = model.get("provider", "").lower()
    if "gemini" in litellm_model.lower() or "vertex" in provider:
        instructor_mode = instructor.Mode.JSON
    else:
        instructor_mode = instructor.Mode.TOOLS

    # Créer le client Instructor avec LiteLLM
    client = instructor.from_litellm(litellm.completion, mode=instructor_mode)

    # Construire les kwargs avec response_model pour Instructor
    completion_kwargs = _build_completion_kwargs(
        litellm_model, messages, api_key, model, temperature, max_tokens
    )
    completion_kwargs["response_model"] = response_model

    start_time = time.time()

    try:
        result, completion = client.chat.completions.create_with_completion(**completion_kwargs)
        response_time_ms = int((time.time() - start_time) * 1000)

        # Extraire les infos
        tokens_input = completion.usage.prompt_tokens if completion.usage else 0
        tokens_output = completion.usage.completion_tokens if completion.usage else 0

        # Finaliser le succès
        cost_total = _finalize_llm_success(
            model, tokens_input, tokens_output, response_time_ms, source, conversation_id
        )

        metadata = {
            "model_id": model["id"],
            "model_name": model["display_name"],
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "response_time_ms": response_time_ms,
            "cost_total": cost_total,
        }

        return result, metadata

    except LLMError:
        raise

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        llm_error = _handle_llm_failure(e, model, response_time_ms, source, conversation_id)
        raise llm_error from e


def check_llm_status() -> dict[str, Any]:
    """Vérifie le statut du LLM configuré."""
    model = get_default_model()

    if not model:
        return {
            "status": "error",
            "message": "Aucun modèle LLM configuré",
            "model": None,
        }

    api_key = _get_api_key_for_model(model)

    if not api_key and model.get("requires_api_key", True):
        return {
            "status": "error",
            "message": f"Clé API non configurée pour {model.get('provider_display_name')}",
            "model": model.get("display_name"),
        }

    return {
        "status": "ok",
        "message": "LLM configuré",
        "model": model.get("display_name"),
        "provider": model.get("provider_display_name"),
    }
