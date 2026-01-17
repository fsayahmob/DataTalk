"""Tests pour llm_config/providers.py - CRUD providers."""

from unittest.mock import MagicMock, patch

import pytest

from llm_config.providers import (
    SELFHOSTED_HEALTH_ENDPOINTS,
    check_local_provider_available,
    get_provider,
    get_provider_by_name,
    get_providers,
    update_provider_base_url,
)


class TestSelfhostedHealthEndpoints:
    """Tests de SELFHOSTED_HEALTH_ENDPOINTS."""

    def test_has_ollama_endpoint(self) -> None:
        """A un endpoint pour Ollama."""
        assert "ollama" in SELFHOSTED_HEALTH_ENDPOINTS
        assert SELFHOSTED_HEALTH_ENDPOINTS["ollama"] == "/api/tags"


class TestCheckLocalProviderAvailable:
    """Tests de check_local_provider_available."""

    @patch("llm_config.providers.get_provider_by_name")
    def test_returns_false_if_provider_not_found(self, mock_get: MagicMock) -> None:
        """Retourne False si provider non trouvé."""
        mock_get.return_value = None
        result = check_local_provider_available("ollama")
        assert result is False

    @patch("llm_config.providers.get_provider_by_name")
    def test_returns_false_if_no_base_url(self, mock_get: MagicMock) -> None:
        """Retourne False si pas de base_url."""
        mock_get.return_value = {"name": "ollama", "base_url": None}
        result = check_local_provider_available("ollama")
        assert result is False

    @patch("llm_config.providers.urllib.request.urlopen")
    @patch("llm_config.providers.get_provider_by_name")
    def test_returns_true_if_reachable(self, mock_get: MagicMock, mock_urlopen: MagicMock) -> None:
        """Retourne True si provider accessible."""
        mock_get.return_value = {"name": "ollama", "base_url": "http://localhost:11434"}
        mock_urlopen.return_value.__enter__ = MagicMock()
        mock_urlopen.return_value.__exit__ = MagicMock()

        result = check_local_provider_available("ollama")
        assert result is True

    @patch("llm_config.providers.urllib.request.urlopen")
    @patch("llm_config.providers.get_provider_by_name")
    def test_returns_false_on_connection_error(
        self, mock_get: MagicMock, mock_urlopen: MagicMock
    ) -> None:
        """Retourne False si erreur de connexion."""
        import urllib.error

        mock_get.return_value = {"name": "ollama", "base_url": "http://localhost:11434"}
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        result = check_local_provider_available("ollama")
        assert result is False

    @patch("llm_config.providers.urllib.request.urlopen")
    @patch("llm_config.providers.get_provider_by_name")
    def test_returns_false_on_timeout(self, mock_get: MagicMock, mock_urlopen: MagicMock) -> None:
        """Retourne False sur timeout."""
        mock_get.return_value = {"name": "ollama", "base_url": "http://localhost:11434"}
        mock_urlopen.side_effect = TimeoutError()

        result = check_local_provider_available("ollama")
        assert result is False


class TestGetProviders:
    """Tests de get_providers."""

    @patch("llm_config.providers.get_connection")
    def test_returns_enabled_providers(self, mock_conn: MagicMock) -> None:
        """Retourne les providers activés par défaut."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "name": "google", "is_enabled": 1},
            {"id": 2, "name": "openai", "is_enabled": 1},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        providers = get_providers()
        assert len(providers) == 2
        assert any("is_enabled" in str(call) for call in cursor.execute.call_args_list)

    @patch("llm_config.providers.get_connection")
    def test_returns_all_providers(self, mock_conn: MagicMock) -> None:
        """Retourne tous les providers si enabled_only=False."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "name": "google"},
            {"id": 2, "name": "openai"},
            {"id": 3, "name": "disabled"},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        providers = get_providers(enabled_only=False)
        assert len(providers) == 3


class TestGetProvider:
    """Tests de get_provider."""

    @patch("llm_config.providers.get_connection")
    def test_returns_provider_by_id(self, mock_conn: MagicMock) -> None:
        """Retourne le provider par ID."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1, "name": "google"}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        provider = get_provider(1)
        assert provider is not None
        assert provider["name"] == "google"

    @patch("llm_config.providers.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        provider = get_provider(999)
        assert provider is None


class TestGetProviderByName:
    """Tests de get_provider_by_name."""

    @patch("llm_config.providers.get_connection")
    def test_returns_provider_by_name(self, mock_conn: MagicMock) -> None:
        """Retourne le provider par nom."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1, "name": "google", "display_name": "Google AI"}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        provider = get_provider_by_name("google")
        assert provider is not None
        assert provider["display_name"] == "Google AI"

    @patch("llm_config.providers.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        provider = get_provider_by_name("unknown")
        assert provider is None


class TestUpdateProviderBaseUrl:
    """Tests de update_provider_base_url."""

    @patch("llm_config.providers.get_connection")
    def test_updates_base_url(self, mock_conn: MagicMock) -> None:
        """Met à jour le base_url."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_provider_base_url(1, "http://localhost:11434")
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.providers.get_connection")
    def test_strips_trailing_slash(self, mock_conn: MagicMock) -> None:
        """Supprime le slash final."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        update_provider_base_url(1, "http://localhost:11434/")

        # Vérifier que le slash a été supprimé
        call_args = cursor.execute.call_args[0][1]
        assert call_args[0] == "http://localhost:11434"

    @patch("llm_config.providers.get_connection")
    def test_handles_none_base_url(self, mock_conn: MagicMock) -> None:
        """Gère base_url=None."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_provider_base_url(1, None)
        assert result is True

    @patch("llm_config.providers.get_connection")
    def test_returns_false_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne False si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_provider_base_url(999, "http://localhost")
        assert result is False
