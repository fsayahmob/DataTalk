"""Tests pour routes/llm.py - Gestion des LLM providers et modèles."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.llm import (
    get_llm_costs,
    get_llm_default_model,
    get_llm_prompt,
    get_llm_status_endpoint,
    list_llm_models,
    list_llm_prompts,
    list_llm_providers,
    set_llm_active_prompt,
    set_llm_default_model,
    update_prompt,
    update_provider_config,
)
from routes.dependencies import PromptUpdateRequest, ProviderConfigRequest, SetActivePromptRequest


class TestListLlmProviders:
    """Tests de list_llm_providers."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_providers")
    @patch("routes.llm.get_api_key_hint")
    @patch("routes.llm.check_local_provider_available")
    async def test_returns_providers(
        self,
        mock_check: MagicMock,
        mock_hint: MagicMock,
        mock_get: MagicMock,
    ) -> None:
        """Retourne les providers."""
        mock_get.return_value = [
            {"id": 1, "name": "google", "display_name": "Google AI", "type": "cloud", "requires_api_key": 1, "is_enabled": 1},
            {"id": 2, "name": "ollama", "display_name": "Ollama", "type": "local", "requires_api_key": 0, "is_enabled": 1, "base_url": "http://localhost:11434"},
        ]
        mock_hint.side_effect = lambda pid: "sk-...xyz" if pid == 1 else None
        mock_check.return_value = True

        result = await list_llm_providers()

        assert len(result["providers"]) == 2
        assert result["providers"][0]["api_key_configured"] is True
        assert result["providers"][0]["requires_api_key"] is True
        assert result["providers"][1]["is_available"] is True


class TestListLlmModels:
    """Tests de list_llm_models."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_models")
    async def test_returns_all_models(self, mock_get: MagicMock) -> None:
        """Retourne tous les modèles."""
        mock_get.return_value = [
            {"id": 1, "model_id": "gemini-2.0-flash"},
            {"id": 2, "model_id": "gpt-4o"},
        ]

        result = await list_llm_models()

        assert len(result["models"]) == 2

    @pytest.mark.asyncio
    @patch("routes.llm.get_provider_by_name")
    @patch("routes.llm.get_models")
    async def test_filters_by_provider(
        self, mock_get_models: MagicMock, mock_get_provider: MagicMock
    ) -> None:
        """Filtre par provider."""
        mock_get_provider.return_value = {"id": 1, "name": "google"}
        mock_get_models.return_value = [{"id": 1, "model_id": "gemini-2.0-flash"}]

        result = await list_llm_models(provider_name="google")

        mock_get_models.assert_called_once_with(1)
        assert len(result["models"]) == 1

    @pytest.mark.asyncio
    @patch("routes.llm.get_provider_by_name")
    async def test_raises_if_provider_not_found(
        self, mock_get_provider: MagicMock
    ) -> None:
        """Lève une erreur si provider non trouvé."""
        mock_get_provider.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await list_llm_models(provider_name="unknown")

        assert exc_info.value.status_code == 404


class TestGetLlmDefaultModel:
    """Tests de get_llm_default_model."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_default_model")
    async def test_returns_default(self, mock_get: MagicMock) -> None:
        """Retourne le modèle par défaut."""
        mock_get.return_value = {"id": 1, "model_id": "gemini-2.0-flash"}

        result = await get_llm_default_model()

        assert result["model"]["model_id"] == "gemini-2.0-flash"

    @pytest.mark.asyncio
    @patch("routes.llm.get_default_model")
    async def test_raises_if_no_default(self, mock_get: MagicMock) -> None:
        """Lève une erreur si pas de défaut."""
        mock_get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_llm_default_model()

        assert exc_info.value.status_code == 404


class TestSetLlmDefaultModel:
    """Tests de set_llm_default_model."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_models")
    @patch("routes.llm.set_default_model")
    async def test_sets_default(
        self, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """Définit le modèle par défaut."""
        mock_get.return_value = [{"id": 1, "model_id": "gemini-2.0-flash"}]

        result = await set_llm_default_model("gemini-2.0-flash")

        mock_set.assert_called_once_with("gemini-2.0-flash")
        assert "gemini-2.0-flash" in result["message"]

    @pytest.mark.asyncio
    @patch("routes.llm.get_models")
    async def test_raises_if_model_not_found(self, mock_get: MagicMock) -> None:
        """Lève une erreur si modèle non trouvé."""
        mock_get.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            await set_llm_default_model("unknown-model")

        assert exc_info.value.status_code == 404


class TestUpdateProviderConfig:
    """Tests de update_provider_config."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_provider_by_name")
    @patch("routes.llm.update_provider_base_url")
    async def test_updates_base_url(
        self, mock_update: MagicMock, mock_get: MagicMock
    ) -> None:
        """Met à jour la base_url."""
        mock_get.return_value = {"id": 1, "name": "ollama", "requires_api_key": False}

        config = ProviderConfigRequest(base_url="http://localhost:11434")
        result = await update_provider_config("ollama", config)

        mock_update.assert_called_once_with(1, "http://localhost:11434")
        assert "message" in result

    @pytest.mark.asyncio
    @patch("routes.llm.get_provider_by_name")
    async def test_raises_if_provider_not_found(
        self, mock_get: MagicMock
    ) -> None:
        """Lève une erreur si provider non trouvé."""
        mock_get.return_value = None

        config = ProviderConfigRequest(base_url="http://test")
        with pytest.raises(HTTPException) as exc_info:
            await update_provider_config("unknown", config)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    @patch("routes.llm.get_provider_by_name")
    async def test_raises_if_cloud_provider(self, mock_get: MagicMock) -> None:
        """Lève une erreur si provider cloud."""
        mock_get.return_value = {"id": 1, "name": "google", "requires_api_key": True}

        config = ProviderConfigRequest(base_url="http://test")
        with pytest.raises(HTTPException) as exc_info:
            await update_provider_config("google", config)

        assert exc_info.value.status_code == 400


class TestGetLlmCosts:
    """Tests de get_llm_costs."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_total_costs")
    @patch("routes.llm.get_costs_by_hour")
    @patch("routes.llm.get_costs_by_model")
    @patch("routes.llm.get_costs_by_source")
    async def test_returns_costs(
        self,
        mock_source: MagicMock,
        mock_model: MagicMock,
        mock_hour: MagicMock,
        mock_total: MagicMock,
    ) -> None:
        """Retourne les coûts."""
        mock_total.return_value = {"total_cost": 1.50}
        mock_hour.return_value = []
        mock_model.return_value = []
        mock_source.return_value = []

        result = await get_llm_costs(days=7)

        assert result["period_days"] == 7
        assert result["total"]["total_cost"] == 1.50


class TestGetLlmStatusEndpoint:
    """Tests de get_llm_status_endpoint."""

    @pytest.mark.asyncio
    @patch("routes.llm.check_llm_status")
    async def test_returns_status(self, mock_check: MagicMock) -> None:
        """Retourne le statut."""
        mock_check.return_value = {"status": "ok", "model": "gemini"}

        result = await get_llm_status_endpoint()

        assert result["status"] == "ok"


class TestListLlmPrompts:
    """Tests de list_llm_prompts."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_prompts")
    async def test_returns_prompts(self, mock_get: MagicMock) -> None:
        """Retourne les prompts."""
        mock_get.return_value = [
            {"key": "analytics_system", "version": "v1"},
        ]

        result = await list_llm_prompts()

        assert len(result["prompts"]) == 1

    @pytest.mark.asyncio
    @patch("routes.llm.get_prompts")
    async def test_filters_by_category(self, mock_get: MagicMock) -> None:
        """Filtre par catégorie."""
        mock_get.return_value = []

        await list_llm_prompts(category="analytics")

        mock_get.assert_called_once_with(category="analytics")


class TestGetLlmPrompt:
    """Tests de get_llm_prompt."""

    @pytest.mark.asyncio
    @patch("routes.llm.get_active_prompt")
    async def test_returns_prompt(self, mock_get: MagicMock) -> None:
        """Retourne un prompt."""
        mock_get.return_value = {"key": "test", "content": "..."}

        result = await get_llm_prompt("test")

        assert result["prompt"]["key"] == "test"

    @pytest.mark.asyncio
    @patch("routes.llm.get_active_prompt")
    async def test_raises_if_not_found(self, mock_get: MagicMock) -> None:
        """Lève une erreur si prompt non trouvé."""
        mock_get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_llm_prompt("unknown")

        assert exc_info.value.status_code == 404


class TestSetLlmActivePrompt:
    """Tests de set_llm_active_prompt."""

    @pytest.mark.asyncio
    @patch("routes.llm.set_active_prompt")
    async def test_sets_active(self, mock_set: MagicMock) -> None:
        """Active une version de prompt."""
        mock_set.return_value = True

        request = SetActivePromptRequest(version="v2")
        result = await set_llm_active_prompt("analytics_system", request)

        mock_set.assert_called_once_with("analytics_system", "v2")
        assert "v2" in result["message"]

    @pytest.mark.asyncio
    @patch("routes.llm.set_active_prompt")
    async def test_raises_if_not_found(self, mock_set: MagicMock) -> None:
        """Lève une erreur si version non trouvée."""
        mock_set.return_value = False

        request = SetActivePromptRequest(version="v99")
        with pytest.raises(HTTPException) as exc_info:
            await set_llm_active_prompt("analytics_system", request)

        assert exc_info.value.status_code == 404


class TestUpdatePrompt:
    """Tests de update_prompt."""

    @pytest.mark.asyncio
    @patch("routes.llm.update_prompt_content")
    async def test_updates_prompt(self, mock_update: MagicMock) -> None:
        """Met à jour un prompt."""
        mock_update.return_value = True

        request = PromptUpdateRequest(content="New content")
        result = await update_prompt("test_key", request)

        mock_update.assert_called_once_with("test_key", "New content")
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    @patch("routes.llm.update_prompt_content")
    async def test_raises_if_not_found(self, mock_update: MagicMock) -> None:
        """Lève une erreur si prompt non trouvé."""
        mock_update.return_value = False

        request = PromptUpdateRequest(content="New content")
        with pytest.raises(HTTPException) as exc_info:
            await update_prompt("unknown", request)

        assert exc_info.value.status_code == 404
