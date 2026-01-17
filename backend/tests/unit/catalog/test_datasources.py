"""Tests pour catalog/datasources.py - CRUD datasources."""

from unittest.mock import MagicMock, patch

import pytest

from catalog.datasources import add_datasource


class TestAddDatasource:
    """Tests de add_datasource."""

    def test_inserts_datasource(self) -> None:
        """Insère une datasource."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource(
                name="test_db",
                ds_type="duckdb",
            )

        assert result == 1
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_handles_all_parameters(self) -> None:
        """Gère tous les paramètres."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 2
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource(
                name="full_db",
                ds_type="duckdb",
                path="/path/to/db.duckdb",
                description="Test database",
            )

        assert result == 2
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[0] == "full_db"
        assert call_args[1] == "duckdb"
        assert call_args[2] == "/path/to/db.duckdb"
        assert call_args[3] == "Test database"

    def test_handles_optional_path(self) -> None:
        """Gère le path optionnel."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 3
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource(
                name="no_path_db",
                ds_type="sqlite",
            )

        assert result == 3
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[2] is None  # path

    def test_uses_insert_or_replace(self) -> None:
        """Utilise INSERT OR REPLACE."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            add_datasource("test", "duckdb")

        call_sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT OR REPLACE" in call_sql

    def test_returns_lastrowid(self) -> None:
        """Retourne le lastrowid."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 42
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource("test", "duckdb")

        assert result == 42

    def test_returns_none_when_no_lastrowid(self) -> None:
        """Retourne None si pas de lastrowid."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource("test", "duckdb")

        assert result is None
