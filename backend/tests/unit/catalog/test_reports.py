"""Tests pour catalog/reports.py - CRUD saved reports."""

from unittest.mock import MagicMock, patch

import pytest

from catalog.reports import (
    delete_report,
    get_report_by_token,
    get_saved_reports,
    save_report,
    toggle_pin_report,
)


class TestSaveReport:
    """Tests de save_report."""

    def test_saves_report_and_returns_id(self) -> None:
        """Sauvegarde un rapport et retourne l'ID."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 42
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = save_report(
                title="Test Report",
                question="What is the count?",
                sql_query="SELECT COUNT(*) FROM users",
            )

        assert result["id"] == 42
        assert "share_token" in result
        assert len(result["share_token"]) > 0  # UUID
        mock_conn.commit.assert_called_once()

    def test_generates_unique_share_token(self) -> None:
        """Génère un token de partage unique."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result1 = save_report("R1", "Q1", "SELECT 1")
            result2 = save_report("R2", "Q2", "SELECT 2")

        assert result1["share_token"] != result2["share_token"]

    def test_handles_optional_parameters(self) -> None:
        """Gère les paramètres optionnels."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = save_report(
                title="Full Report",
                question="Question?",
                sql_query="SELECT 1",
                chart_config='{"type": "bar"}',
                message_id=100,
                is_pinned=True,
            )

        assert result["id"] == 1
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[3] == '{"type": "bar"}'  # chart_config
        assert call_args[4] == 100  # message_id
        assert call_args[5] is True  # is_pinned


class TestGetSavedReports:
    """Tests de get_saved_reports."""

    def test_returns_list_of_reports(self) -> None:
        """Retourne une liste de rapports."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {"id": 1, "title": "Report 1", "is_pinned": True},
            {"id": 2, "title": "Report 2", "is_pinned": False},
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = get_saved_reports()

        assert len(result) == 2
        assert result[0]["title"] == "Report 1"

    def test_orders_by_pinned_then_date(self) -> None:
        """Trie par épinglé puis date."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            get_saved_reports()

        call_sql = mock_cursor.execute.call_args[0][0]
        assert "ORDER BY" in call_sql
        assert "is_pinned DESC" in call_sql

    def test_returns_empty_list_when_no_reports(self) -> None:
        """Retourne liste vide sans rapports."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = get_saved_reports()

        assert result == []


class TestDeleteReport:
    """Tests de delete_report."""

    def test_deletes_existing_report(self) -> None:
        """Supprime un rapport existant."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = delete_report(1)

        assert result is True
        mock_conn.commit.assert_called_once()

    def test_returns_false_when_not_found(self) -> None:
        """Retourne False si rapport non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = delete_report(999)

        assert result is False


class TestTogglePinReport:
    """Tests de toggle_pin_report."""

    def test_toggles_pin_state(self) -> None:
        """Inverse l'état épinglé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = toggle_pin_report(1)

        assert result is True
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "NOT is_pinned" in call_sql
        mock_conn.commit.assert_called_once()

    def test_returns_false_when_not_found(self) -> None:
        """Retourne False si rapport non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = toggle_pin_report(999)

        assert result is False


class TestGetReportByToken:
    """Tests de get_report_by_token."""

    def test_returns_report_when_found(self) -> None:
        """Retourne le rapport quand trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        test_token = "abc-123"
        mock_cursor.fetchone.return_value = {
            "id": 1,
            "title": "Shared Report",
            "share_token": test_token,
        }
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = get_report_by_token(test_token)

        assert result is not None
        assert result["share_token"] == test_token

    def test_returns_none_when_not_found(self) -> None:
        """Retourne None si token non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            result = get_report_by_token("invalid-token")

        assert result is None

    def test_queries_by_share_token(self) -> None:
        """Recherche par share_token."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.reports.get_connection", return_value=mock_conn):
            get_report_by_token("test-token")

        call_args = mock_cursor.execute.call_args[0]
        assert "share_token" in call_args[0]
        assert call_args[1] == ("test-token",)
