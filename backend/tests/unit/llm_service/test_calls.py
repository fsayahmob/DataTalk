"""Tests pour llm_service/calls.py - Appels LLM."""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from llm_service.calls import call_llm, call_llm_structured, check_llm_status
from llm_service.errors import LLMError, LLMErrorCode


class TestCallLlm:
    """Tests de call_llm."""

    @patch("llm_service.calls._circuit_breaker")
    def test_raises_if_circuit_open(self, mock_cb: MagicMock) -> None:
        """Lève une erreur si le circuit est ouvert."""
        mock_cb.allow_request.return_value = False

        with pytest.raises(LLMError) as exc_info:
            call_llm("test prompt")

        assert exc_info.value.code == LLMErrorCode.SERVICE_UNAVAILABLE

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    def test_raises_if_no_model(self, mock_get_model: MagicMock, mock_cb: MagicMock) -> None:
        """Lève une erreur si pas de modèle configuré."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = None

        with pytest.raises(LLMError) as exc_info:
            call_llm("test prompt")

        assert exc_info.value.code == LLMErrorCode.NOT_CONFIGURED

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    def test_raises_if_no_api_key(
        self,
        mock_get_key: MagicMock,
        mock_get_model: MagicMock,
        mock_cb: MagicMock,
    ) -> None:
        """Lève une erreur si pas de clé API."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = {
            "id": 1,
            "provider_display_name": "Google",
            "requires_api_key": True,
        }
        mock_get_key.return_value = None

        with pytest.raises(LLMError) as exc_info:
            call_llm("test prompt")

        assert exc_info.value.code == LLMErrorCode.API_KEY_MISSING

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    @patch("llm_service.calls._get_litellm_model_name")
    @patch("llm_service.calls.litellm.completion")
    @patch("llm_service.calls.log_cost")
    def test_successful_call(
        self,
        mock_log_cost: MagicMock,
        mock_completion: MagicMock,
        mock_model_name: MagicMock,
        mock_get_key: MagicMock,
        mock_get_model: MagicMock,
        mock_cb: MagicMock,
    ) -> None:
        """Appel réussi retourne LLMResponse."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = {
            "id": 1,
            "display_name": "Gemini Flash",
            "provider_display_name": "Google",
            "requires_api_key": True,
            "cost_per_1m_input": 0.1,
            "cost_per_1m_output": 0.3,
        }
        mock_get_key.return_value = "sk-test"
        mock_model_name.return_value = "gemini/gemini-2.0-flash"

        # Mock de la réponse LiteLLM
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        mock_completion.return_value = mock_response

        result = call_llm("test prompt", system_prompt="Be helpful")

        assert result.content == "Test response"
        assert result.model_id == 1
        assert result.tokens_input == 10
        assert result.tokens_output == 20
        mock_cb.record_success.assert_called_once()

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    @patch("llm_service.calls._get_litellm_model_name")
    @patch("llm_service.calls.litellm.completion")
    def test_raises_on_empty_response(
        self,
        mock_completion: MagicMock,
        mock_model_name: MagicMock,
        mock_get_key: MagicMock,
        mock_get_model: MagicMock,
        mock_cb: MagicMock,
    ) -> None:
        """Lève une erreur si la réponse est vide."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = {
            "id": 1,
            "display_name": "Test",
            "provider_display_name": "Test",
            "requires_api_key": True,
        }
        mock_get_key.return_value = "key"
        mock_model_name.return_value = "test"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "   "
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 0
        mock_completion.return_value = mock_response

        with pytest.raises(LLMError) as exc_info:
            call_llm("test")

        assert exc_info.value.code == LLMErrorCode.EMPTY_RESPONSE

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_model")
    @patch("llm_service.calls._get_api_key_for_model")
    @patch("llm_service.calls._get_litellm_model_name")
    @patch("llm_service.calls.litellm.completion")
    @patch("llm_service.calls.log_cost")
    def test_uses_model_id(
        self,
        mock_log_cost: MagicMock,
        mock_completion: MagicMock,
        mock_model_name: MagicMock,
        mock_get_key: MagicMock,
        mock_get_model: MagicMock,
        mock_cb: MagicMock,
    ) -> None:
        """Utilise le model_id si fourni."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = {
            "id": 5,
            "display_name": "GPT-4",
            "provider_display_name": "OpenAI",
            "requires_api_key": True,
        }
        mock_get_key.return_value = "sk-openai"
        mock_model_name.return_value = "gpt-4"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Hello"
        mock_response.usage.prompt_tokens = 5
        mock_response.usage.completion_tokens = 1
        mock_completion.return_value = mock_response

        result = call_llm("hi", model_id=5)

        mock_get_model.assert_called_once_with(5)
        assert result.model_id == 5


class _ResponseModel(BaseModel):
    """Modèle Pydantic de test pour call_llm_structured."""

    message: str
    count: int


class TestCallLlmStructured:
    """Tests de call_llm_structured."""

    @patch("llm_service.calls._circuit_breaker")
    def test_raises_if_circuit_open(self, mock_cb: MagicMock) -> None:
        """Lève une erreur si le circuit est ouvert."""
        mock_cb.allow_request.return_value = False

        with pytest.raises(LLMError) as exc_info:
            call_llm_structured("test", _ResponseModel)

        assert exc_info.value.code == LLMErrorCode.SERVICE_UNAVAILABLE

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    def test_raises_if_no_model(self, mock_get_model: MagicMock, mock_cb: MagicMock) -> None:
        """Lève une erreur si pas de modèle."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = None

        with pytest.raises(LLMError) as exc_info:
            call_llm_structured("test", _ResponseModel)

        assert exc_info.value.code == LLMErrorCode.NOT_CONFIGURED

    @patch("llm_service.calls._circuit_breaker")
    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    @patch("llm_service.calls._get_litellm_model_name")
    @patch("llm_service.calls.instructor.from_litellm")
    @patch("llm_service.calls.log_cost")
    def test_successful_structured_call(
        self,
        mock_log_cost: MagicMock,
        mock_instructor: MagicMock,
        mock_model_name: MagicMock,
        mock_get_key: MagicMock,
        mock_get_model: MagicMock,
        mock_cb: MagicMock,
    ) -> None:
        """Appel structuré réussi."""
        mock_cb.allow_request.return_value = True
        mock_get_model.return_value = {
            "id": 1,
            "display_name": "Test",
            "provider_display_name": "Test",
            "requires_api_key": True,
            "cost_per_1m_input": 0.1,
            "cost_per_1m_output": 0.3,
        }
        mock_get_key.return_value = "key"
        mock_model_name.return_value = "test"

        # Mock Instructor
        mock_client = MagicMock()
        mock_instructor.return_value = mock_client

        result_obj = _ResponseModel(message="test", count=5)
        mock_completion = MagicMock()
        mock_completion.usage.prompt_tokens = 10
        mock_completion.usage.completion_tokens = 20
        mock_client.chat.completions.create_with_completion.return_value = (
            result_obj,
            mock_completion,
        )

        result, metadata = call_llm_structured("prompt", _ResponseModel)

        assert result.message == "test"
        assert result.count == 5
        assert metadata["tokens_input"] == 10
        assert metadata["tokens_output"] == 20
        mock_cb.record_success.assert_called_once()


class TestCheckLlmStatus:
    """Tests de check_llm_status."""

    @patch("llm_service.calls.get_default_model")
    def test_returns_error_if_no_model(self, mock_get_model: MagicMock) -> None:
        """Retourne erreur si pas de modèle."""
        mock_get_model.return_value = None

        result = check_llm_status()

        assert result["status"] == "error"
        assert "Aucun modèle" in result["message"]

    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    def test_returns_error_if_no_api_key(
        self, mock_get_key: MagicMock, mock_get_model: MagicMock
    ) -> None:
        """Retourne erreur si pas de clé API."""
        mock_get_model.return_value = {
            "display_name": "Test",
            "provider_display_name": "Test Provider",
            "requires_api_key": True,
        }
        mock_get_key.return_value = None

        result = check_llm_status()

        assert result["status"] == "error"
        assert "Clé API non configurée" in result["message"]

    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    def test_returns_ok_when_configured(
        self, mock_get_key: MagicMock, mock_get_model: MagicMock
    ) -> None:
        """Retourne OK si tout est configuré."""
        mock_get_model.return_value = {
            "display_name": "Gemini Flash",
            "provider_display_name": "Google AI",
            "requires_api_key": True,
        }
        mock_get_key.return_value = "sk-key"

        result = check_llm_status()

        assert result["status"] == "ok"
        assert result["model"] == "Gemini Flash"
        assert result["provider"] == "Google AI"

    @patch("llm_service.calls.get_default_model")
    @patch("llm_service.calls._get_api_key_for_model")
    def test_ok_without_api_key_if_not_required(
        self, mock_get_key: MagicMock, mock_get_model: MagicMock
    ) -> None:
        """OK si clé non requise (ex: Ollama)."""
        mock_get_model.return_value = {
            "display_name": "Llama 3",
            "provider_display_name": "Ollama",
            "requires_api_key": False,
        }
        mock_get_key.return_value = None

        result = check_llm_status()

        assert result["status"] == "ok"
