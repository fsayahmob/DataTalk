"""Tests pour routes/widgets.py - Widgets, KPIs et questions suggérées."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.widgets import (
    get_prompt,
    list_kpis,
    list_prompts,
    list_suggested_questions,
    list_widgets,
    refresh_widget,
    refresh_widgets,
    update_prompt_endpoint,
)
from routes.dependencies import PromptUpdateRequest


class TestListWidgets:
    """Tests de list_widgets."""

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.get_all_widgets_with_data")
    async def test_returns_widgets(
        self, mock_get: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne les widgets."""
        mock_app_state.db_connection = MagicMock()
        mock_get.return_value = [
            {"id": "w1", "title": "Widget 1"},
            {"id": "w2", "title": "Widget 2"},
        ]

        result = await list_widgets()

        assert len(result["widgets"]) == 2

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    async def test_raises_if_not_connected(self, mock_app_state: MagicMock) -> None:
        """Lève une erreur si DB non connectée."""
        mock_app_state.db_connection = None

        with pytest.raises(HTTPException) as exc_info:
            await list_widgets()

        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.get_all_widgets_with_data")
    async def test_returns_empty_on_error(
        self, mock_get: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne liste vide en cas d'erreur."""
        mock_app_state.db_connection = MagicMock()
        mock_get.side_effect = Exception("Table not found")

        result = await list_widgets()

        assert result["widgets"] == []


class TestRefreshWidgets:
    """Tests de refresh_widgets."""

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.refresh_all_widgets_cache")
    async def test_refreshes_cache(
        self, mock_refresh: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Rafraîchit le cache."""
        mock_app_state.db_connection = MagicMock()
        mock_refresh.return_value = {"success": True, "count": 5}

        result = await refresh_widgets()

        assert result["success"] is True
        assert result["count"] == 5

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    async def test_raises_if_not_connected(self, mock_app_state: MagicMock) -> None:
        """Lève une erreur si DB non connectée."""
        mock_app_state.db_connection = None

        with pytest.raises(HTTPException) as exc_info:
            await refresh_widgets()

        assert exc_info.value.status_code == 500


class TestRefreshWidget:
    """Tests de refresh_widget."""

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.refresh_single_widget_cache")
    async def test_refreshes_single_widget(
        self, mock_refresh: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Rafraîchit un widget."""
        mock_app_state.db_connection = MagicMock()
        mock_refresh.return_value = {"success": True}

        result = await refresh_widget("w1")

        mock_refresh.assert_called_once_with("w1", mock_app_state.db_connection)
        assert result["success"] is True

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.refresh_single_widget_cache")
    async def test_raises_if_widget_not_found(
        self, mock_refresh: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Lève une erreur si widget non trouvé."""
        mock_app_state.db_connection = MagicMock()
        mock_refresh.return_value = {"error": "Widget not found", "success": False}

        with pytest.raises(HTTPException) as exc_info:
            await refresh_widget("unknown")

        assert exc_info.value.status_code == 404


class TestListKpis:
    """Tests de list_kpis."""

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.get_all_kpis_with_data")
    async def test_returns_kpis(
        self, mock_get: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne les KPIs."""
        mock_app_state.db_connection = MagicMock()
        mock_get.return_value = [
            {"id": "k1", "title": "KPI 1", "value": 4.5},
        ]

        result = await list_kpis()

        assert len(result["kpis"]) == 1

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    async def test_raises_if_not_connected(self, mock_app_state: MagicMock) -> None:
        """Lève une erreur si DB non connectée."""
        mock_app_state.db_connection = None

        with pytest.raises(HTTPException) as exc_info:
            await list_kpis()

        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    @patch("routes.widgets.app_state")
    @patch("routes.widgets.get_all_kpis_with_data")
    async def test_returns_empty_on_error(
        self, mock_get: MagicMock, mock_app_state: MagicMock
    ) -> None:
        """Retourne liste vide en cas d'erreur."""
        mock_app_state.db_connection = MagicMock()
        mock_get.side_effect = Exception("Error")

        result = await list_kpis()

        assert result["kpis"] == []


class TestListSuggestedQuestions:
    """Tests de list_suggested_questions."""

    @pytest.mark.asyncio
    @patch("routes.widgets.get_connection")
    @patch("routes.widgets.get_suggested_questions")
    async def test_returns_questions(
        self, mock_get: MagicMock, mock_conn: MagicMock
    ) -> None:
        """Retourne les questions suggérées."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (5,)
        mock_conn.return_value = conn
        mock_get.return_value = [
            {"id": 1, "question": "Quelle est la note moyenne?"},
        ]

        result = await list_suggested_questions()

        assert len(result["questions"]) == 1
        mock_get.assert_called_once_with(enabled_only=True)

    @pytest.mark.asyncio
    @patch("routes.widgets.get_connection")
    async def test_returns_empty_if_no_tables(self, mock_conn: MagicMock) -> None:
        """Retourne liste vide si pas de tables."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0,)
        mock_conn.return_value = conn

        result = await list_suggested_questions()

        assert result["questions"] == []

    @pytest.mark.asyncio
    @patch("routes.widgets.get_connection")
    async def test_returns_empty_on_error(self, mock_conn: MagicMock) -> None:
        """Retourne liste vide en cas d'erreur."""
        mock_conn.side_effect = Exception("DB error")

        result = await list_suggested_questions()

        assert result["questions"] == []


class TestListPrompts:
    """Tests de list_prompts (legacy)."""

    @pytest.mark.asyncio
    @patch("routes.widgets.get_all_prompts")
    async def test_returns_prompts(self, mock_get: MagicMock) -> None:
        """Retourne les prompts."""
        mock_get.return_value = [{"key": "test", "content": "..."}]

        result = await list_prompts()

        assert len(result["prompts"]) == 1

    @pytest.mark.asyncio
    @patch("routes.widgets.get_all_prompts")
    async def test_raises_on_error(self, mock_get: MagicMock) -> None:
        """Lève une erreur en cas de problème."""
        mock_get.side_effect = Exception("DB error")

        with pytest.raises(HTTPException) as exc_info:
            await list_prompts()

        assert exc_info.value.status_code == 500


class TestGetPrompt:
    """Tests de get_prompt (legacy)."""

    @pytest.mark.asyncio
    @patch("routes.widgets.get_active_prompt")
    async def test_returns_prompt(self, mock_get: MagicMock) -> None:
        """Retourne un prompt."""
        mock_get.return_value = {"key": "test", "content": "..."}

        result = await get_prompt("test")

        assert result["key"] == "test"

    @pytest.mark.asyncio
    @patch("routes.widgets.get_active_prompt")
    async def test_raises_if_not_found(self, mock_get: MagicMock) -> None:
        """Lève une erreur si non trouvé."""
        mock_get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_prompt("unknown")

        assert exc_info.value.status_code == 404


class TestUpdatePromptEndpoint:
    """Tests de update_prompt_endpoint (legacy)."""

    @pytest.mark.asyncio
    @patch("routes.widgets.update_prompt_content")
    async def test_updates_prompt(self, mock_update: MagicMock) -> None:
        """Met à jour un prompt."""
        mock_update.return_value = True

        request = PromptUpdateRequest(content="New content")
        result = await update_prompt_endpoint("test", request)

        mock_update.assert_called_once_with("test", "New content")
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    @patch("routes.widgets.update_prompt_content")
    async def test_raises_if_not_found(self, mock_update: MagicMock) -> None:
        """Lève une erreur si non trouvé."""
        mock_update.return_value = False

        request = PromptUpdateRequest(content="New content")
        with pytest.raises(HTTPException) as exc_info:
            await update_prompt_endpoint("unknown", request)

        assert exc_info.value.status_code == 404
