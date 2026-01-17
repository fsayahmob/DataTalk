"""Tests pour routes/settings.py - Configuration système."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.settings import (
    get_database_status,
    get_schema,
    get_settings,
    get_single_setting,
    health_check,
    refresh_schema,
    update_settings,
    update_single_setting,
)
from routes.dependencies import SettingsUpdateRequest, UpdateSettingRequest


class TestHealthCheck:
    """Tests de health_check."""

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.check_llm_status")
    @patch("routes.settings.get_connection")
    async def test_returns_health_status(
        self,
        mock_get_conn: MagicMock,
        mock_llm_status: MagicMock,
        mock_app_state: MagicMock,
    ) -> None:
        """Retourne le statut de santé."""
        # DB connectée
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = (1,)
        mock_app_state.db_connection = mock_db

        # LLM ok
        mock_llm_status.return_value = {"status": "ok", "model": "gemini"}

        # Catalog ok
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (5,)
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        result = await health_check()

        assert result["status"] == "ok"
        assert "components" in result
        assert "database" in result["components"]
        assert "llm" in result["components"]

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.check_llm_status")
    @patch("routes.settings.get_connection")
    async def test_degraded_if_db_disconnected(
        self,
        mock_get_conn: MagicMock,
        mock_llm_status: MagicMock,
        mock_app_state: MagicMock,
    ) -> None:
        """Retourne 'degraded' si DB déconnectée."""
        mock_app_state.db_connection = None
        mock_llm_status.return_value = {"status": "ok"}
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (0,)
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        result = await health_check()

        assert result["status"] == "degraded"


class TestGetDatabaseStatus:
    """Tests de get_database_status."""

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.get_setting")
    async def test_returns_db_status(
        self, mock_get_setting: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne le statut de la base."""
        mock_app_state.db_connection = MagicMock()
        mock_app_state.current_db_path = "/data/test.duckdb"
        mock_get_setting.return_value = "data/g7.duckdb"

        result = await get_database_status()

        assert result["status"] == "connected"
        assert result["path"] == "/data/test.duckdb"
        assert result["engine"] == "DuckDB"

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.get_setting")
    async def test_returns_disconnected(
        self, mock_get_setting: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne 'disconnected' si pas de connexion."""
        mock_app_state.db_connection = None
        mock_app_state.current_db_path = None
        mock_get_setting.return_value = None

        result = await get_database_status()

        assert result["status"] == "disconnected"


class TestRefreshSchema:
    """Tests de refresh_schema."""

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.get_schema_for_llm")
    async def test_refreshes_cache(
        self, mock_get_schema: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Rafraîchit le cache du schéma."""
        mock_get_schema.return_value = "TABLE evaluations (id INT, ...)"

        result = await refresh_schema()

        assert result["status"] == "ok"
        assert mock_app_state.db_schema_cache == "TABLE evaluations (id INT, ...)"


class TestGetSchema:
    """Tests de get_schema."""

    @pytest.mark.asyncio
    @patch("routes.settings.get_system_instruction")
    async def test_returns_schema(self, mock_get_instruction: MagicMock) -> None:
        """Retourne le schéma."""
        mock_get_instruction.return_value = "Schema content here"

        result = await get_schema()

        assert result["schema"] == "Schema content here"


class TestGetSettings:
    """Tests de get_settings."""

    @pytest.mark.asyncio
    @patch("routes.settings.get_all_settings")
    @patch("routes.settings.check_llm_status")
    @patch("routes.settings.get_default_model")
    @patch("routes.settings.get_providers")
    @patch("routes.settings.get_api_key_hint")
    async def test_returns_all_settings(
        self,
        mock_hint: MagicMock,
        mock_providers: MagicMock,
        mock_default: MagicMock,
        mock_llm: MagicMock,
        mock_settings: MagicMock,
    ) -> None:
        """Retourne toutes les configurations."""
        mock_settings.return_value = {"key": "value"}
        mock_llm.return_value = {"status": "ok"}
        mock_default.return_value = {"id": 1, "name": "gemini"}
        mock_providers.return_value = [
            {"id": 1, "name": "google", "display_name": "Google AI", "type": "cloud", "requires_api_key": True}
        ]
        mock_hint.return_value = "sk-...xyz"

        result = await get_settings()

        assert "settings" in result
        assert "llm" in result
        assert result["llm"]["status"] == "ok"


class TestUpdateSettings:
    """Tests de update_settings."""

    @pytest.mark.asyncio
    @patch("routes.settings.get_provider_by_name")
    @patch("routes.settings.set_api_key")
    async def test_updates_api_key(
        self, mock_set_key: MagicMock, mock_get_provider: MagicMock
    ) -> None:
        """Met à jour une clé API."""
        mock_get_provider.return_value = {"id": 1, "name": "google"}
        request = SettingsUpdateRequest(api_key="sk-test", provider_name="google")

        result = await update_settings(request)

        mock_set_key.assert_called_once_with(1, "sk-test")
        assert "message" in result

    @pytest.mark.asyncio
    @patch("routes.settings.get_provider_by_name")
    async def test_raises_if_provider_not_found(
        self, mock_get_provider: MagicMock
    ) -> None:
        """Lève une erreur si provider non trouvé."""
        mock_get_provider.return_value = None
        request = SettingsUpdateRequest(api_key="sk-test", provider_name="unknown")

        with pytest.raises(HTTPException) as exc_info:
            await update_settings(request)

        assert exc_info.value.status_code == 404


class TestGetSingleSetting:
    """Tests de get_single_setting."""

    @pytest.mark.asyncio
    @patch("routes.settings.get_setting")
    async def test_returns_setting(self, mock_get: MagicMock) -> None:
        """Retourne un setting."""
        mock_get.return_value = "compact"

        result = await get_single_setting("catalog_context_mode")

        assert result["key"] == "catalog_context_mode"
        assert result["value"] == "compact"

    @pytest.mark.asyncio
    @patch("routes.settings.get_setting")
    async def test_raises_if_not_found(self, mock_get: MagicMock) -> None:
        """Lève une erreur si setting non trouvé."""
        mock_get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_single_setting("unknown_key")

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    @patch("routes.settings.get_setting")
    async def test_masks_api_key(self, mock_get: MagicMock) -> None:
        """Masque les clés API."""
        mock_get.return_value = "sk-1234567890abcdef"

        result = await get_single_setting("gemini_api_key")

        assert result["value"] == "sk-1...cdef"


class TestUpdateSingleSetting:
    """Tests de update_single_setting."""

    @pytest.mark.asyncio
    async def test_rejects_non_allowed_keys(self) -> None:
        """Rejette les clés non autorisées."""
        request = UpdateSettingRequest(value="test")

        with pytest.raises(HTTPException) as exc_info:
            await update_single_setting("secret_key", request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_validates_catalog_context_mode(self) -> None:
        """Valide catalog_context_mode."""
        request = UpdateSettingRequest(value="invalid")

        with pytest.raises(HTTPException) as exc_info:
            await update_single_setting("catalog_context_mode", request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_validates_max_tables_per_batch_numeric(self) -> None:
        """Valide que max_tables_per_batch est numérique."""
        request = UpdateSettingRequest(value="not_a_number")

        with pytest.raises(HTTPException) as exc_info:
            await update_single_setting("max_tables_per_batch", request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_validates_max_tables_per_batch_range(self) -> None:
        """Valide que max_tables_per_batch est dans la plage."""
        request = UpdateSettingRequest(value="100")

        with pytest.raises(HTTPException) as exc_info:
            await update_single_setting("max_tables_per_batch", request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    @patch("routes.settings.app_state")
    @patch("routes.settings.set_setting")
    async def test_updates_valid_setting(self, mock_set: MagicMock, mock_state: MagicMock) -> None:
        """Met à jour un setting valide et invalide le cache."""
        request = UpdateSettingRequest(value="compact")

        result = await update_single_setting("catalog_context_mode", request)

        assert result["status"] == "ok"
        mock_set.assert_called_once_with("catalog_context_mode", "compact")
        # Vérifie que le cache schéma est invalidé
        assert mock_state.db_schema_cache is None
