"""
Service LLM centralisé pour G7 Analytics.
Utilise LiteLLM pour une interface unifiée multi-provider.
Gère le tracking des coûts automatiquement.
"""
import time
from enum import Enum
from typing import Optional, Type, TypeVar

import instructor
import litellm
from litellm.exceptions import (
    APIConnectionError,
    APIError,
    AuthenticationError,
    BadRequestError,
    ContentPolicyViolationError,
    ContextWindowExceededError,
    RateLimitError,
    ServiceUnavailableError,
)
from llm_config import (
    get_api_key,
    get_default_model,
    get_model,
    log_cost,
)
from pydantic import BaseModel


class LLMErrorCode(str, Enum):
    """Codes d'erreur LLM pour le mapping i18n."""
    NOT_CONFIGURED = "llm.not_configured"
    API_KEY_MISSING = "llm.api_key_missing"
    API_KEY_INVALID = "llm.api_key_invalid"
    EMPTY_RESPONSE = "llm.empty_response"
    QUOTA_EXCEEDED = "llm.quota_exceeded"
    CONNECTION_ERROR = "llm.connection_error"
    TIMEOUT = "llm.timeout"
    CONTEXT_TOO_LONG = "llm.context_too_long"
    CONTENT_POLICY = "llm.content_policy"
    SERVICE_UNAVAILABLE = "llm.service_unavailable"
    INVALID_JSON = "llm.invalid_json"
    GENERIC_ERROR = "llm.generic_error"


class LLMError(Exception):
    """Exception LLM avec code d'erreur typé."""

    def __init__(self, code: LLMErrorCode, provider: str = "", details: str = ""):
        self.code = code
        self.provider = provider
        self.details = details
        super().__init__(f"{code.value}: {details}" if details else code.value)


def _handle_litellm_exception(e: Exception, provider: str) -> LLMError:
    """Convertit une exception LiteLLM en LLMError typé."""
    if isinstance(e, AuthenticationError):
        return LLMError(LLMErrorCode.API_KEY_INVALID, provider)
    elif isinstance(e, RateLimitError):
        return LLMError(LLMErrorCode.QUOTA_EXCEEDED, provider)
    elif isinstance(e, APIConnectionError):
        if "timeout" in str(e).lower():
            return LLMError(LLMErrorCode.TIMEOUT, provider)
        return LLMError(LLMErrorCode.CONNECTION_ERROR, provider)
    elif isinstance(e, ContextWindowExceededError):
        return LLMError(LLMErrorCode.CONTEXT_TOO_LONG, provider)
    elif isinstance(e, ContentPolicyViolationError):
        return LLMError(LLMErrorCode.CONTENT_POLICY, provider)
    elif isinstance(e, ServiceUnavailableError):
        return LLMError(LLMErrorCode.SERVICE_UNAVAILABLE, provider)
    elif isinstance(e, BadRequestError):
        return LLMError(LLMErrorCode.GENERIC_ERROR, provider, str(e))
    elif isinstance(e, APIError):
        return LLMError(LLMErrorCode.GENERIC_ERROR, provider, str(e))
    else:
        return LLMError(LLMErrorCode.GENERIC_ERROR, provider, str(e))


# Désactiver les logs verbeux de LiteLLM
litellm.set_verbose = False

# Type générique pour les réponses structurées
T = TypeVar("T", bound=BaseModel)


class LLMResponse:
    """Réponse d'un appel LLM avec métadonnées."""

    def __init__(
        self,
        content: str,
        model_id: int,
        model_name: str,
        tokens_input: int,
        tokens_output: int,
        response_time_ms: int,
        cost_total: float,
    ):
        self.content = content
        self.model_id = model_id
        self.model_name = model_name
        self.tokens_input = tokens_input
        self.tokens_output = tokens_output
        self.response_time_ms = response_time_ms
        self.cost_total = cost_total

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "model_id": self.model_id,
            "model_name": self.model_name,
            "tokens_input": self.tokens_input,
            "tokens_output": self.tokens_output,
            "response_time_ms": self.response_time_ms,
            "cost_total": self.cost_total,
        }


class StructuredLLMResponse(LLMResponse):
    """Réponse structurée avec objet Pydantic."""

    def __init__(self, data: BaseModel, **kwargs):
        super().__init__(content="", **kwargs)
        self.data = data


def _get_litellm_model_name(model: dict) -> str:
    """Convertit notre model_id en format LiteLLM."""
    provider = model.get("provider_name", "")
    model_id = model.get("model_id", "")

    # Mapping provider -> préfixe LiteLLM
    if provider == "google":
        return f"gemini/{model_id}"
    elif provider == "openai":
        return model_id  # OpenAI n'a pas besoin de préfixe
    elif provider == "anthropic":
        return f"anthropic/{model_id}"
    elif provider == "mistral":
        return f"mistral/{model_id}"
    elif provider == "ollama":
        return f"ollama_chat/{model_id}"
    else:
        return model_id


def _configure_api_key(model: dict) -> bool:
    """Configure la clé API pour le provider."""
    import os

    provider_id = model.get("provider_id")
    if not provider_id:
        return False

    # Récupérer la clé (env var ou SQLite)
    api_key = get_api_key(provider_id)
    if not api_key:
        # Pas de clé requise (ex: Ollama)
        if not model.get("requires_api_key", True):
            return True
        return False

    # Configurer la clé pour LiteLLM
    provider_name = model.get("provider_name", "")
    if provider_name == "google":
        os.environ["GEMINI_API_KEY"] = api_key
    elif provider_name == "openai":
        os.environ["OPENAI_API_KEY"] = api_key
    elif provider_name == "anthropic":
        os.environ["ANTHROPIC_API_KEY"] = api_key
    elif provider_name == "mistral":
        os.environ["MISTRAL_API_KEY"] = api_key

    return True


def call_llm(
    prompt: str,
    system_prompt: Optional[str] = None,
    model_id: Optional[int] = None,
    source: str = "analytics",
    conversation_id: Optional[int] = None,
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
    # Récupérer le modèle
    if model_id:
        model = get_model(model_id)
    else:
        model = get_default_model()

    if not model:
        raise LLMError(LLMErrorCode.NOT_CONFIGURED)

    provider_name = model.get("provider_display_name", "")

    # Configurer la clé API
    if not _configure_api_key(model):
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
    completion_kwargs = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

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
        raise  # Propager nos propres erreurs

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)

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

        # Convertir en LLMError typé
        raise _handle_litellm_exception(e, provider_name) from e


def call_llm_structured(
    prompt: str,
    response_model: Type[T],
    system_prompt: Optional[str] = None,
    model_id: Optional[int] = None,
    source: str = "analytics",
    conversation_id: Optional[int] = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
) -> tuple[T, dict]:
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
    # Récupérer le modèle
    if model_id:
        model = get_model(model_id)
    else:
        model = get_default_model()

    if not model:
        raise LLMError(LLMErrorCode.NOT_CONFIGURED)

    provider_name = model.get("provider_display_name", "")

    # Configurer la clé API
    if not _configure_api_key(model):
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
    completion_kwargs = {
        "model": litellm_model,
        "messages": messages,
        "response_model": response_model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

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
        raise  # Propager nos propres erreurs

    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)

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

        # Convertir en LLMError typé
        raise _handle_litellm_exception(e, provider_name) from e


def check_llm_status() -> dict:
    """Vérifie le statut du LLM configuré."""
    model = get_default_model()

    if not model:
        return {
            "status": "error",
            "message": "Aucun modèle LLM configuré",
            "model": None,
        }

    has_key = _configure_api_key(model)

    if not has_key and model.get("requires_api_key", True):
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
