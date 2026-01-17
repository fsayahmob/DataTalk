"""Tests pour llm_service/errors.py - Gestion erreurs LLM."""

import pytest

from llm_service.errors import (
    ERROR_SEVERITY_MAP,
    ErrorSeverity,
    LLMError,
    LLMErrorCode,
    _handle_litellm_exception,
    get_error_severity,
)


class TestLLMErrorCode:
    """Tests de LLMErrorCode."""

    def test_is_string_enum(self) -> None:
        """Est un enum de strings."""
        assert LLMErrorCode.NOT_CONFIGURED.value == "llm.not_configured"

    def test_has_all_expected_codes(self) -> None:
        """A tous les codes attendus."""
        codes = [
            "NOT_CONFIGURED",
            "API_KEY_MISSING",
            "API_KEY_INVALID",
            "EMPTY_RESPONSE",
            "QUOTA_EXCEEDED",
            "CONNECTION_ERROR",
            "TIMEOUT",
            "CONTEXT_TOO_LONG",
            "CONTENT_POLICY",
            "SERVICE_UNAVAILABLE",
            "INVALID_JSON",
            "GENERIC_ERROR",
        ]
        for code in codes:
            assert hasattr(LLMErrorCode, code)


class TestLLMError:
    """Tests de LLMError."""

    def test_is_exception(self) -> None:
        """Est une Exception."""
        assert issubclass(LLMError, Exception)

    def test_stores_code(self) -> None:
        """Stocke le code d'erreur."""
        error = LLMError(LLMErrorCode.NOT_CONFIGURED)
        assert error.code == LLMErrorCode.NOT_CONFIGURED

    def test_stores_provider(self) -> None:
        """Stocke le provider."""
        error = LLMError(LLMErrorCode.API_KEY_MISSING, provider="Google AI")
        assert error.provider == "Google AI"

    def test_stores_details(self) -> None:
        """Stocke les détails."""
        error = LLMError(LLMErrorCode.GENERIC_ERROR, details="Something went wrong")
        assert error.details == "Something went wrong"

    def test_message_includes_code(self) -> None:
        """Le message inclut le code."""
        error = LLMError(LLMErrorCode.NOT_CONFIGURED)
        assert "llm.not_configured" in str(error)

    def test_message_includes_details(self) -> None:
        """Le message inclut les détails."""
        error = LLMError(LLMErrorCode.GENERIC_ERROR, details="Test details")
        assert "Test details" in str(error)


class TestHandleLitellmException:
    """Tests de _handle_litellm_exception."""

    def test_handles_authentication_error(self) -> None:
        """Gère AuthenticationError."""
        from litellm.exceptions import AuthenticationError

        exc = AuthenticationError(
            message="Invalid API key", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.API_KEY_INVALID

    def test_handles_rate_limit_error(self) -> None:
        """Gère RateLimitError."""
        from litellm.exceptions import RateLimitError

        exc = RateLimitError(
            message="Quota exceeded", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.QUOTA_EXCEEDED

    def test_handles_context_window_error(self) -> None:
        """Gère ContextWindowExceededError."""
        from litellm.exceptions import ContextWindowExceededError

        exc = ContextWindowExceededError(
            message="Context too long", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.CONTEXT_TOO_LONG

    def test_handles_content_policy_error(self) -> None:
        """Gère ContentPolicyViolationError."""
        from litellm.exceptions import ContentPolicyViolationError

        exc = ContentPolicyViolationError(
            message="Content blocked", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.CONTENT_POLICY

    def test_handles_service_unavailable(self) -> None:
        """Gère ServiceUnavailableError."""
        from litellm.exceptions import ServiceUnavailableError

        exc = ServiceUnavailableError(
            message="Service down", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.SERVICE_UNAVAILABLE

    def test_handles_connection_error(self) -> None:
        """Gère APIConnectionError."""
        from litellm.exceptions import APIConnectionError

        exc = APIConnectionError(
            message="Connection refused", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.CONNECTION_ERROR

    def test_handles_timeout_error(self) -> None:
        """Gère timeout dans APIConnectionError."""
        from litellm.exceptions import APIConnectionError

        exc = APIConnectionError(
            message="Request timeout occurred", llm_provider="google", model="gemini-2.0-flash"
        )
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.TIMEOUT

    def test_handles_generic_error(self) -> None:
        """Gère les erreurs génériques."""
        exc = Exception("Unknown error")
        error = _handle_litellm_exception(exc, "Google AI")
        assert error.code == LLMErrorCode.GENERIC_ERROR
        assert "Unknown error" in error.details


class TestErrorSeverity:
    """Tests de ErrorSeverity."""

    def test_has_transient(self) -> None:
        """A la sévérité TRANSIENT."""
        assert ErrorSeverity.TRANSIENT == "transient"

    def test_has_permanent(self) -> None:
        """A la sévérité PERMANENT."""
        assert ErrorSeverity.PERMANENT == "permanent"

    def test_has_unknown(self) -> None:
        """A la sévérité UNKNOWN."""
        assert ErrorSeverity.UNKNOWN == "unknown"


class TestGetErrorSeverity:
    """Tests de get_error_severity."""

    def test_timeout_is_transient(self) -> None:
        """TIMEOUT est transient."""
        assert get_error_severity(LLMErrorCode.TIMEOUT) == ErrorSeverity.TRANSIENT

    def test_quota_exceeded_is_transient(self) -> None:
        """QUOTA_EXCEEDED est transient."""
        assert get_error_severity(LLMErrorCode.QUOTA_EXCEEDED) == ErrorSeverity.TRANSIENT

    def test_connection_error_is_transient(self) -> None:
        """CONNECTION_ERROR est transient."""
        assert get_error_severity(LLMErrorCode.CONNECTION_ERROR) == ErrorSeverity.TRANSIENT

    def test_service_unavailable_is_transient(self) -> None:
        """SERVICE_UNAVAILABLE est transient."""
        assert get_error_severity(LLMErrorCode.SERVICE_UNAVAILABLE) == ErrorSeverity.TRANSIENT

    def test_api_key_invalid_is_permanent(self) -> None:
        """API_KEY_INVALID est permanent."""
        assert get_error_severity(LLMErrorCode.API_KEY_INVALID) == ErrorSeverity.PERMANENT

    def test_api_key_missing_is_permanent(self) -> None:
        """API_KEY_MISSING est permanent."""
        assert get_error_severity(LLMErrorCode.API_KEY_MISSING) == ErrorSeverity.PERMANENT

    def test_not_configured_is_permanent(self) -> None:
        """NOT_CONFIGURED est permanent."""
        assert get_error_severity(LLMErrorCode.NOT_CONFIGURED) == ErrorSeverity.PERMANENT

    def test_context_too_long_is_permanent(self) -> None:
        """CONTEXT_TOO_LONG est permanent."""
        assert get_error_severity(LLMErrorCode.CONTEXT_TOO_LONG) == ErrorSeverity.PERMANENT

    def test_unknown_code_returns_unknown(self) -> None:
        """Code inconnu retourne UNKNOWN."""
        # EMPTY_RESPONSE n'est pas dans ERROR_SEVERITY_MAP
        assert get_error_severity(LLMErrorCode.EMPTY_RESPONSE) == ErrorSeverity.UNKNOWN
