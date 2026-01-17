"""Tests pour routes/reports.py - Gestion des rapports."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.reports import (
    create_report,
    execute_report,
    list_reports,
    pin_report,
    remove_report,
)
from routes.dependencies import SaveReportRequest


class TestListReports:
    """Tests de list_reports."""

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    async def test_returns_reports(self, mock_get: MagicMock) -> None:
        """Retourne les rapports."""
        mock_get.return_value = [
            {"id": 1, "title": "Report 1"},
            {"id": 2, "title": "Report 2"},
        ]

        result = await list_reports()

        assert len(result["reports"]) == 2


class TestCreateReport:
    """Tests de create_report."""

    @pytest.mark.asyncio
    @patch("routes.reports.save_report")
    async def test_creates_report(self, mock_save: MagicMock) -> None:
        """Crée un rapport."""
        token = "abc123"
        mock_save.return_value = {"id": 1, "share_token": token}

        request = SaveReportRequest(
            title="Mon rapport",
            question="Quelle est la note moyenne?",
            sql_query="SELECT AVG(note) FROM evaluations",
        )
        result = await create_report(request)

        assert result["id"] == 1
        assert result["share_token"] == token
        mock_save.assert_called_once_with(
            title="Mon rapport",
            question="Quelle est la note moyenne?",
            sql_query="SELECT AVG(note) FROM evaluations",
            chart_config=None,
            message_id=None,
        )


class TestRemoveReport:
    """Tests de remove_report."""

    @pytest.mark.asyncio
    @patch("routes.reports.delete_report")
    async def test_removes_report(self, mock_delete: MagicMock) -> None:
        """Supprime un rapport."""
        mock_delete.return_value = True

        result = await remove_report(1)

        assert "message" in result
        mock_delete.assert_called_once_with(1)

    @pytest.mark.asyncio
    @patch("routes.reports.delete_report")
    async def test_raises_if_not_found(self, mock_delete: MagicMock) -> None:
        """Lève une erreur si rapport non trouvé."""
        mock_delete.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await remove_report(999)

        assert exc_info.value.status_code == 404


class TestPinReport:
    """Tests de pin_report."""

    @pytest.mark.asyncio
    @patch("routes.reports.toggle_pin_report")
    async def test_toggles_pin(self, mock_toggle: MagicMock) -> None:
        """Toggle l'épinglage."""
        mock_toggle.return_value = True

        result = await pin_report(1)

        assert "message" in result
        mock_toggle.assert_called_once_with(1)

    @pytest.mark.asyncio
    @patch("routes.reports.toggle_pin_report")
    async def test_raises_if_not_found(self, mock_toggle: MagicMock) -> None:
        """Lève une erreur si rapport non trouvé."""
        mock_toggle.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await pin_report(999)

        assert exc_info.value.status_code == 404


class TestExecuteReport:
    """Tests de execute_report."""

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    @patch("routes.reports.execute_query")
    async def test_executes_report(self, mock_execute: MagicMock, mock_get: MagicMock) -> None:
        """Exécute un rapport."""
        mock_get.return_value = [
            {
                "id": 1,
                "title": "Test",
                "sql_query": "SELECT 1",
                "chart_config": '{"type": "bar"}',
            }
        ]
        mock_execute.return_value = [{"col": 1}]

        result = await execute_report(1)

        assert result["report_id"] == 1
        assert result["data"] == [{"col": 1}]
        assert result["chart"]["type"] == "bar"

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    async def test_raises_if_not_found(self, mock_get: MagicMock) -> None:
        """Lève une erreur si rapport non trouvé."""
        mock_get.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            await execute_report(999)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    async def test_raises_if_no_sql(self, mock_get: MagicMock) -> None:
        """Lève une erreur si pas de SQL."""
        mock_get.return_value = [{"id": 1, "sql_query": None}]

        with pytest.raises(HTTPException) as exc_info:
            await execute_report(1)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    @patch("routes.reports.execute_query")
    async def test_handles_invalid_chart_config(
        self, mock_execute: MagicMock, mock_get: MagicMock
    ) -> None:
        """Gère une config chart invalide."""
        mock_get.return_value = [
            {"id": 1, "title": "Test", "sql_query": "SELECT 1", "chart_config": "invalid"}
        ]
        mock_execute.return_value = [{"col": 1}]

        result = await execute_report(1)

        # Doit utiliser le chart par défaut
        assert result["chart"]["type"] == "none"

    @pytest.mark.asyncio
    @patch("routes.reports.get_saved_reports")
    @patch("routes.reports.execute_query")
    async def test_handles_query_error(self, mock_execute: MagicMock, mock_get: MagicMock) -> None:
        """Gère les erreurs de requête."""
        mock_get.return_value = [{"id": 1, "sql_query": "SELECT * FROM invalid"}]
        mock_execute.side_effect = Exception("Table not found")

        with pytest.raises(HTTPException) as exc_info:
            await execute_report(1)

        assert exc_info.value.status_code == 500
