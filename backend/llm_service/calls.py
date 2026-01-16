"""
Fonctions d'appel LLM.

Contient call_llm, call_llm_structured et check_llm_status.
"""

import logging
import time
from typing import Any, TypeVar

import instructor
import litellm
from llm_config import get_default_model, get_model, log_cost
from pydantic import BaseModel

from .circuit_breaker import _circuit_breaker
from .errors import ErrorSeverity, LLMError, LLMErrorCode, _handle_litellm_exception, get_error_severity
from .helpers import _get_api_key_for_model, _get_litellm_model_name
from .models import LLMResponse

# Type générique pour les réponses structurées
T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)


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

    # Construire les messages
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # Appeler LiteLLM
    litellm_model = _get_litellm_model_name(model)
    start_time = time.time()

    # Construire les kwargs pour LiteLLM
    completion_kwargs: dict[str, Any] = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    # Passer la clé API directement (pas dans os.environ)
    if api_key:
        completion_kwargs["api_key"] = api_key

    # Ajouter api_base pour les providers self-hosted
    base_url = model.get("base_url")
    if base_url:
        completion_kwargs["api_base"] = base_url

    try:
        response = litellm.completion(**completion_kwargs)

        response_time_ms = int((time.time() - start_time) * 1000)

        # Extraire les infos
        content = response.choices[0].message.content or ""
        tokens_input = response.usage.prompt_tokens if response.usage else 0
        tokens_output = response.usage.completion_tokens if response.usage else 0

        # Vérifier réponse vide
        if not content.strip():
            raise LLMError(LLMErrorCode.EMPTY_RESPONSE, provider_name)

        # Calculer le coût
        cost_input = 0.0
        cost_output = 0.0
        if model.get("cost_per_1m_input"):
            cost_input = tokens_input * model["cost_per_1m_input"] / 1_000_000
        if model.get("cost_per_1m_output"):
            cost_output = tokens_output * model["cost_per_1m_output"] / 1_000_000
        cost_total = cost_input + cost_output

        # Logger le coût
        log_cost(
            model_id=model["id"],
            source=source,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            response_time_ms=response_time_ms,
            conversation_id=conversation_id,
            success=True,
        )

        # Circuit breaker: enregistrer le succès
        _circuit_breaker.record_success()

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
        # Circuit breaker: les erreurs de config ne comptent pas comme des failures
        raise

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)

        # Convertir en LLMError typé
        llm_error = _handle_litellm_exception(e, provider_name)

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
            error_message=str(e),
        )

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

    # Construire les messages
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # Créer le client Instructor avec LiteLLM
    litellm_model = _get_litellm_model_name(model)
    client = instructor.from_litellm(litellm.completion)

    # Construire les kwargs
    completion_kwargs: dict[str, Any] = {
        "model": litellm_model,
        "messages": messages,
        "response_model": response_model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    # Passer la clé API directement (pas dans os.environ)
    if api_key:
        completion_kwargs["api_key"] = api_key

    # Ajouter api_base pour les providers self-hosted
    base_url = model.get("base_url")
    if base_url:
        completion_kwargs["api_base"] = base_url

    start_time = time.time()

    try:
        # Appel avec Instructor
        result, completion = client.chat.completions.create_with_completion(**completion_kwargs)

        response_time_ms = int((time.time() - start_time) * 1000)

        # Extraire les infos
        tokens_input = completion.usage.prompt_tokens if completion.usage else 0
        tokens_output = completion.usage.completion_tokens if completion.usage else 0

        # Calculer le coût
        cost_input = 0.0
        cost_output = 0.0
        if model.get("cost_per_1m_input"):
            cost_input = tokens_input * model["cost_per_1m_input"] / 1_000_000
        if model.get("cost_per_1m_output"):
            cost_output = tokens_output * model["cost_per_1m_output"] / 1_000_000
        cost_total = cost_input + cost_output

        # Logger le coût
        log_cost(
            model_id=model["id"],
            source=source,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            response_time_ms=response_time_ms,
            conversation_id=conversation_id,
            success=True,
        )

        # Circuit breaker: enregistrer le succès
        _circuit_breaker.record_success()

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
        # Circuit breaker: les erreurs de config ne comptent pas comme des failures
        raise

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)

        # Convertir en LLMError typé
        llm_error = _handle_litellm_exception(e, provider_name)

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
            error_message=str(e),
        )

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
