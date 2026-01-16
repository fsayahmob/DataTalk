"""
Gestion des erreurs LLM.

Contient les codes d'erreur, l'exception LLMError et le handler d'exceptions LiteLLM.
"""

from enum import Enum

from litellm.exceptions import (
    APIConnectionError,
    AuthenticationError,
    ContentPolicyViolationError,
    ContextWindowExceededError,
    RateLimitError,
    ServiceUnavailableError,
)


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
    # Mapping type -> code d'erreur
    error_mapping: dict[type, LLMErrorCode] = {
        AuthenticationError: LLMErrorCode.API_KEY_INVALID,
        RateLimitError: LLMErrorCode.QUOTA_EXCEEDED,
        ContextWindowExceededError: LLMErrorCode.CONTEXT_TOO_LONG,
        ContentPolicyViolationError: LLMErrorCode.CONTENT_POLICY,
        ServiceUnavailableError: LLMErrorCode.SERVICE_UNAVAILABLE,
    }

    # Cas spécial: APIConnectionError peut être timeout ou connexion
    if isinstance(e, APIConnectionError):
        code = (
            LLMErrorCode.TIMEOUT if "timeout" in str(e).lower() else LLMErrorCode.CONNECTION_ERROR
        )
        return LLMError(code, provider)

    # Chercher dans le mapping
    for exc_type, error_code in error_mapping.items():
        if isinstance(e, exc_type):
            return LLMError(error_code, provider)

    # Fallback: erreur générique avec détails
    return LLMError(LLMErrorCode.GENERIC_ERROR, provider, str(e))


# =============================================================================
# CLASSIFICATION DES ERREURS POUR CIRCUIT BREAKER
# =============================================================================


class ErrorSeverity:
    """Classification des erreurs pour le circuit breaker."""

    TRANSIENT = "transient"  # Erreurs temporaires (retry possible)
    PERMANENT = "permanent"  # Erreurs de config (pas de retry)
    UNKNOWN = "unknown"


ERROR_SEVERITY_MAP: dict[LLMErrorCode, str] = {
    # Transient: peuvent se résoudre avec le temps
    LLMErrorCode.TIMEOUT: ErrorSeverity.TRANSIENT,
    LLMErrorCode.QUOTA_EXCEEDED: ErrorSeverity.TRANSIENT,
    LLMErrorCode.CONNECTION_ERROR: ErrorSeverity.TRANSIENT,
    LLMErrorCode.SERVICE_UNAVAILABLE: ErrorSeverity.TRANSIENT,
    # Permanent: nécessitent une intervention
    LLMErrorCode.API_KEY_INVALID: ErrorSeverity.PERMANENT,
    LLMErrorCode.API_KEY_MISSING: ErrorSeverity.PERMANENT,
    LLMErrorCode.NOT_CONFIGURED: ErrorSeverity.PERMANENT,
    LLMErrorCode.CONTEXT_TOO_LONG: ErrorSeverity.PERMANENT,
    LLMErrorCode.CONTENT_POLICY: ErrorSeverity.PERMANENT,
}


def get_error_severity(code: LLMErrorCode) -> str:
    """Retourne la sévérité d'une erreur LLM."""
    return ERROR_SEVERITY_MAP.get(code, ErrorSeverity.UNKNOWN)
