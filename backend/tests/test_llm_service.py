"""
Tests pour llm_service.py

Règle: Importer uniquement depuis llm_service (pas depuis sous-modules futurs).
Ces tests doivent passer avant ET après refactoring.
"""

from unittest.mock import patch

import pytest

# Import depuis la racine du module
from llm_service import (
    CircuitBreaker,
    LLMError,
    LLMErrorCode,
    LLMResponse,
    _get_litellm_model_name,
    _handle_litellm_exception,
    check_llm_status,
    get_circuit_breaker_status,
    reset_circuit_breaker,
)


# =============================================================================
# TESTS ERROR CODES
# =============================================================================


class TestLLMErrorCode:
    """Tests des codes d'erreur."""

    def test_error_codes_are_strings(self) -> None:
        """Les codes d'erreur sont des strings."""
        assert isinstance(LLMErrorCode.NOT_CONFIGURED.value, str)
        assert isinstance(LLMErrorCode.API_KEY_MISSING.value, str)

    def test_error_codes_start_with_llm(self) -> None:
        """Les codes commencent par 'llm.' pour i18n."""
        for code in LLMErrorCode:
            assert code.value.startswith("llm.")


class TestLLMError:
    """Tests de l'exception LLMError."""

    def test_llm_error_has_code(self) -> None:
        """LLMError contient le code d'erreur."""
        error = LLMError(LLMErrorCode.API_KEY_MISSING, "Google")

        assert error.code == LLMErrorCode.API_KEY_MISSING
        assert error.provider == "Google"

    def test_llm_error_message(self) -> None:
        """LLMError a un message formaté."""
        error = LLMError(LLMErrorCode.TIMEOUT, "OpenAI", "Connection timed out")

        assert "timeout" in str(error).lower() or "llm.timeout" in str(error)


# =============================================================================
# TESTS LLM RESPONSE
# =============================================================================


class TestLLMResponse:
    """Tests de LLMResponse."""

    def test_response_to_dict(self) -> None:
        """LLMResponse.to_dict() retourne un dict complet."""
        response = LLMResponse(
            content="Hello world",
            model_id=1,
            model_name="GPT-4",
            tokens_input=10,
            tokens_output=5,
            response_time_ms=100,
            cost_total=0.001,
        )

        result = response.to_dict()

        assert result["content"] == "Hello world"
        assert result["model_id"] == 1
        assert result["tokens_input"] == 10
        assert result["tokens_output"] == 5
        assert result["response_time_ms"] == 100
        assert result["cost_total"] == 0.001


# =============================================================================
# TESTS CIRCUIT BREAKER (complémentaires à test_resilience.py)
# =============================================================================


class TestCircuitBreakerExtended:
    """Tests additionnels du circuit breaker."""

    def test_get_status_structure(self) -> None:
        """get_status retourne la bonne structure."""
        cb = CircuitBreaker()

        status = cb.get_status()

        assert "state" in status
        assert "failures" in status
        assert "threshold" in status
        assert "cooldown_seconds" in status

    def test_initial_state_is_closed(self) -> None:
        """L'état initial est CLOSED."""
        cb = CircuitBreaker()

        assert cb.get_status()["state"] == "CLOSED"

    def test_global_circuit_breaker_functions(self) -> None:
        """Les fonctions globales fonctionnent."""
        # Reset d'abord
        reset_circuit_breaker()

        status = get_circuit_breaker_status()

        assert status["state"] == "CLOSED"


# =============================================================================
# TESTS HELPERS
# =============================================================================


class TestHelpers:
    """Tests des fonctions helper."""

    def test_get_litellm_model_name_google(self) -> None:
        """Conversion modèle Google."""
        model = {"provider_name": "google", "model_id": "gemini-2.0-flash"}

        result = _get_litellm_model_name(model)

        assert result == "gemini/gemini-2.0-flash"

    def test_get_litellm_model_name_openai(self) -> None:
        """Conversion modèle OpenAI (pas de préfixe)."""
        model = {"provider_name": "openai", "model_id": "gpt-4"}

        result = _get_litellm_model_name(model)

        assert result == "gpt-4"

    def test_get_litellm_model_name_anthropic(self) -> None:
        """Conversion modèle Anthropic."""
        model = {"provider_name": "anthropic", "model_id": "claude-3-opus"}

        result = _get_litellm_model_name(model)

        assert result == "anthropic/claude-3-opus"

    def test_get_litellm_model_name_ollama(self) -> None:
        """Conversion modèle Ollama."""
        model = {"provider_name": "ollama", "model_id": "llama2"}

        result = _get_litellm_model_name(model)

        assert result == "ollama_chat/llama2"


# =============================================================================
# TESTS EXCEPTION HANDLING
# =============================================================================


class TestExceptionHandling:
    """Tests de la conversion d'exceptions."""

    def test_handle_authentication_error(self) -> None:
        """AuthenticationError -> API_KEY_INVALID."""
        litellm_exceptions = pytest.importorskip("litellm.exceptions")

        exc = litellm_exceptions.AuthenticationError(
            message="Invalid API key", llm_provider="google", model="gemini"
        )
        result = _handle_litellm_exception(exc, "Google")

        assert result.code == LLMErrorCode.API_KEY_INVALID

    def test_handle_rate_limit_error(self) -> None:
        """RateLimitError -> QUOTA_EXCEEDED."""
        litellm_exceptions = pytest.importorskip("litellm.exceptions")

        exc = litellm_exceptions.RateLimitError(
            message="Rate limit exceeded", llm_provider="openai", model="gpt-4"
        )
        result = _handle_litellm_exception(exc, "OpenAI")

        assert result.code == LLMErrorCode.QUOTA_EXCEEDED

    def test_handle_context_window_error(self) -> None:
        """ContextWindowExceededError -> CONTEXT_TOO_LONG."""
        litellm_exceptions = pytest.importorskip("litellm.exceptions")

        exc = litellm_exceptions.ContextWindowExceededError(
            message="Context too long", llm_provider="anthropic", model="claude"
        )
        result = _handle_litellm_exception(exc, "Anthropic")

        assert result.code == LLMErrorCode.CONTEXT_TOO_LONG

    def test_handle_unknown_error(self) -> None:
        """Exception inconnue -> GENERIC_ERROR."""
        exc = ValueError("Something went wrong")
        result = _handle_litellm_exception(exc, "Unknown")

        assert result.code == LLMErrorCode.GENERIC_ERROR


# =============================================================================
# TESTS CHECK LLM STATUS
# =============================================================================


class TestCheckLLMStatus:
    """Tests de check_llm_status."""

    def test_no_model_configured(self) -> None:
        """Retourne erreur si pas de modèle."""
        with patch("llm_service.get_default_model", return_value=None):
            result = check_llm_status()

        assert result["status"] == "error"
        assert "model" in result

    def test_no_api_key_configured(self) -> None:
        """Retourne erreur si pas de clé API."""
        mock_model = {
            "provider_display_name": "Google",
            "display_name": "Gemini",
            "requires_api_key": True,
            "provider_id": 1,
        }

        with (
            patch("llm_service.get_default_model", return_value=mock_model),
            patch("llm_service._get_api_key_for_model", return_value=None),
        ):
            result = check_llm_status()

        assert result["status"] == "error"

    def test_llm_configured_ok(self) -> None:
        """Retourne ok si tout est configuré."""
        mock_model = {
            "provider_display_name": "Google",
            "display_name": "Gemini",
            "requires_api_key": True,
            "provider_id": 1,
        }

        with (
            patch("llm_service.get_default_model", return_value=mock_model),
            patch("llm_service._get_api_key_for_model", return_value="fake-key"),
        ):
            result = check_llm_status()

        assert result["status"] == "ok"
