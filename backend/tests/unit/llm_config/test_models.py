"""Tests pour llm_config/models.py - CRUD modèles LLM."""

from unittest.mock import MagicMock, patch

import pytest

from llm_config.models import (
    get_default_model,
    get_model,
    get_model_by_model_id,
    get_models,
    set_default_model,
)


class TestGetModels:
    """Tests de get_models."""

    @patch("llm_config.models.get_connection")
    def test_returns_enabled_models(self, mock_conn: MagicMock) -> None:
        """Retourne les modèles activés par défaut."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "model_id": "gemini-2.0-flash", "is_enabled": 1},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        models = get_models()
        assert len(models) == 1

    @patch("llm_config.models.get_connection")
    def test_filters_by_provider(self, mock_conn: MagicMock) -> None:
        """Filtre par provider."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "model_id": "gemini-2.0-flash", "provider_id": 1},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_models(provider_id=1)

        # Vérifier que provider_id est dans la requête
        call_args = cursor.execute.call_args
        assert 1 in call_args[0][1]

    @patch("llm_config.models.get_connection")
    def test_returns_all_when_enabled_only_false(self, mock_conn: MagicMock) -> None:
        """Retourne tous les modèles."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "model_id": "model1"},
            {"id": 2, "model_id": "model2"},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        models = get_models(enabled_only=False)
        assert len(models) == 2


class TestGetModel:
    """Tests de get_model."""

    @patch("llm_config.models.get_connection")
    def test_returns_model_by_id(self, mock_conn: MagicMock) -> None:
        """Retourne le modèle par ID."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "id": 1,
            "model_id": "gemini-2.0-flash",
            "display_name": "Gemini 2.0 Flash",
            "provider_name": "google",
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_model(1)
        assert model is not None
        assert model["model_id"] == "gemini-2.0-flash"

    @patch("llm_config.models.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_model(999)
        assert model is None


class TestGetDefaultModel:
    """Tests de get_default_model."""

    @patch("llm_config.models.get_connection")
    def test_returns_default_model(self, mock_conn: MagicMock) -> None:
        """Retourne le modèle par défaut."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "id": 1,
            "model_id": "gemini-2.0-flash",
            "is_default": 1,
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_default_model()
        assert model is not None
        assert model["is_default"] == 1

    @patch("llm_config.models.get_connection")
    def test_returns_none_if_no_default(self, mock_conn: MagicMock) -> None:
        """Retourne None si pas de défaut."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_default_model()
        assert model is None


class TestGetModelByModelId:
    """Tests de get_model_by_model_id."""

    @patch("llm_config.models.get_connection")
    def test_returns_model_by_model_id(self, mock_conn: MagicMock) -> None:
        """Retourne le modèle par model_id."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "id": 1,
            "model_id": "gemini-2.0-flash",
            "display_name": "Gemini 2.0 Flash",
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_model_by_model_id("gemini-2.0-flash")
        assert model is not None
        assert model["display_name"] == "Gemini 2.0 Flash"

    @patch("llm_config.models.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        model = get_model_by_model_id("unknown-model")
        assert model is None


class TestSetDefaultModel:
    """Tests de set_default_model."""

    @patch("llm_config.models.get_connection")
    def test_sets_default_model(self, mock_conn: MagicMock) -> None:
        """Définit le modèle par défaut."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1}
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_default_model("gemini-2.0-flash")
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.models.get_connection")
    def test_resets_other_defaults(self, mock_conn: MagicMock) -> None:
        """Reset les autres défauts."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1}
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        set_default_model("gemini-2.0-flash")

        # Vérifier que is_default = 0 est dans les appels
        calls = [str(c) for c in cursor.execute.call_args_list]
        assert any("is_default = 0" in c for c in calls)

    @patch("llm_config.models.get_connection")
    def test_returns_false_if_model_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne False si modèle non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None  # Model not found
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_default_model("unknown-model")
        assert result is False
