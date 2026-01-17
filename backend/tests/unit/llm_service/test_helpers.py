"""Tests pour llm_service/helpers.py - Fonctions helper LLM."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from llm_service.helpers import _get_api_key_for_model, _get_litellm_model_name


class TestGetLitellmModelName:
    """Tests de _get_litellm_model_name."""

    def test_google_provider(self) -> None:
        """Provider Google ajoute préfixe gemini/."""
        model = {"provider_name": "google", "model_id": "gemini-2.0-flash"}
        assert _get_litellm_model_name(model) == "gemini/gemini-2.0-flash"

    def test_openai_provider(self) -> None:
        """Provider OpenAI n'ajoute pas de préfixe."""
        model = {"provider_name": "openai", "model_id": "gpt-4o"}
        assert _get_litellm_model_name(model) == "gpt-4o"

    def test_anthropic_provider(self) -> None:
        """Provider Anthropic ajoute préfixe anthropic/."""
        model = {"provider_name": "anthropic", "model_id": "claude-3-5-sonnet"}
        assert _get_litellm_model_name(model) == "anthropic/claude-3-5-sonnet"

    def test_mistral_provider(self) -> None:
        """Provider Mistral ajoute préfixe mistral/."""
        model = {"provider_name": "mistral", "model_id": "mistral-large"}
        assert _get_litellm_model_name(model) == "mistral/mistral-large"

    def test_ollama_provider(self) -> None:
        """Provider Ollama ajoute préfixe ollama_chat/."""
        model = {"provider_name": "ollama", "model_id": "llama3"}
        assert _get_litellm_model_name(model) == "ollama_chat/llama3"

    def test_unknown_provider(self) -> None:
        """Provider inconnu retourne le model_id tel quel."""
        model = {"provider_name": "unknown", "model_id": "custom-model"}
        assert _get_litellm_model_name(model) == "custom-model"

    def test_missing_provider(self) -> None:
        """Provider manquant retourne le model_id tel quel."""
        model = {"model_id": "some-model"}
        assert _get_litellm_model_name(model) == "some-model"

    def test_missing_model_id(self) -> None:
        """Model ID manquant retourne chaîne vide."""
        model = {"provider_name": "google"}
        assert _get_litellm_model_name(model) == "gemini/"

    def test_empty_model(self) -> None:
        """Modèle vide retourne chaîne vide."""
        model: dict[str, str] = {}
        assert _get_litellm_model_name(model) == ""


class TestGetApiKeyForModel:
    """Tests de _get_api_key_for_model."""

    @patch("llm_service.helpers.get_api_key")
    def test_returns_api_key(self, mock_get_api_key: MagicMock) -> None:
        """Retourne la clé API si présente."""
        mock_get_api_key.return_value = "sk-test-key"
        model: dict[str, Any] = {"provider_id": 1}

        result = _get_api_key_for_model(model)

        assert result == "sk-test-key"
        mock_get_api_key.assert_called_once_with(1)

    @patch("llm_service.helpers.get_api_key")
    def test_returns_none_no_provider_id(self, mock_get_api_key: MagicMock) -> None:
        """Retourne None si pas de provider_id."""
        model: dict[str, int] = {}

        result = _get_api_key_for_model(model)

        assert result is None
        mock_get_api_key.assert_not_called()

    @patch("llm_service.helpers.get_api_key")
    def test_returns_none_if_no_key(self, mock_get_api_key: MagicMock) -> None:
        """Retourne None si pas de clé configurée."""
        mock_get_api_key.return_value = None
        model: dict[str, Any] = {"provider_id": 2}

        result = _get_api_key_for_model(model)

        assert result is None

    @patch("llm_service.helpers.get_api_key")
    def test_passes_provider_id(self, mock_get_api_key: MagicMock) -> None:
        """Passe le bon provider_id à get_api_key."""
        mock_get_api_key.return_value = "key"
        model: dict[str, Any] = {"provider_id": 42}

        _get_api_key_for_model(model)

        mock_get_api_key.assert_called_once_with(42)
