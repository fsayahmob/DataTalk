"""Tests pour catalog/datasources.py - CRUD datasources."""

import json
from unittest.mock import MagicMock, patch

import pytest

from catalog.datasources import (
    add_datasource,
    delete_datasource,
    get_datasource,
    get_datasource_by_name,
    list_datasources,
    update_datasource,
    update_sync_status,
)


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
        """Gère tous les paramètres incluant sync_config."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 2
        mock_conn.cursor.return_value = mock_cursor

        sync_config = {"host": "localhost", "port": 5432}

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource(
                name="full_db",
                ds_type="postgres",
                dataset_id="dataset-123",
                source_type="postgres",
                path="postgres://localhost:5432",
                description="Test database",
                sync_config=sync_config,
            )

        assert result == 2
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[0] == "full_db"
        assert call_args[1] == "postgres"
        assert call_args[2] == "dataset-123"
        assert call_args[3] == "postgres"
        assert call_args[6] == json.dumps(sync_config)

    def test_returns_lastrowid(self) -> None:
        """Retourne le lastrowid."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 42
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = add_datasource("test", "duckdb")

        assert result == 42


class TestGetDatasource:
    """Tests de get_datasource."""

    def test_returns_datasource_with_parsed_json(self) -> None:
        """Retourne un dict avec sync_config parsé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        class MockRow(dict):
            def __init__(self, data: dict) -> None:
                super().__init__(data)

        mock_row = MockRow({"id": 1, "name": "test", "sync_config": None})
        mock_cursor.fetchone.return_value = mock_row
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = get_datasource(1)

        assert result is not None
        assert result["id"] == 1
        assert result["sync_config"] is None

    def test_returns_none_if_not_found(self) -> None:
        """Retourne None si non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = get_datasource(999)

        assert result is None
        mock_conn.close.assert_called_once()

    def test_parses_sync_config_json(self) -> None:
        """Parse le JSON sync_config."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        class MockRow(dict):
            def __init__(self, data: dict) -> None:
                super().__init__(data)

            def keys(self) -> list:
                return list(super().keys())

        mock_row = MockRow({"id": 1, "name": "test", "sync_config": '{"host": "localhost"}'})
        mock_cursor.fetchone.return_value = mock_row
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = get_datasource(1)

        assert result is not None
        assert result["sync_config"] == {"host": "localhost"}


class TestGetDatasourceByName:
    """Tests de get_datasource_by_name."""

    def test_returns_none_if_not_found(self) -> None:
        """Retourne None si non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = get_datasource_by_name("unknown")

        assert result is None


class TestListDatasources:
    """Tests de list_datasources."""

    def test_returns_empty_list_when_no_results(self) -> None:
        """Retourne une liste vide si pas de résultats."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = list_datasources()

        assert result == []
        mock_conn.close.assert_called_once()

    def test_filters_by_dataset_id(self) -> None:
        """Filtre par dataset_id."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            list_datasources(dataset_id="dataset-123")

        call_sql = mock_cursor.execute.call_args[0][0]
        assert "dataset_id = ?" in call_sql


class TestUpdateDatasource:
    """Tests de update_datasource."""

    def test_returns_false_if_no_updates(self) -> None:
        """Retourne False si aucune mise à jour."""
        result = update_datasource(1)
        assert result is False

    def test_updates_name(self) -> None:
        """Met à jour le nom."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = update_datasource(1, name="new_name")

        assert result is True
        mock_conn.commit.assert_called_once()

    def test_updates_sync_config_as_json(self) -> None:
        """Met à jour sync_config en JSON."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        config = {"host": "new_host"}
        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            update_datasource(1, sync_config=config)

        call_args = mock_cursor.execute.call_args[0][1]
        assert json.dumps(config) in call_args

    def test_returns_false_if_not_found(self) -> None:
        """Retourne False si non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = update_datasource(999, name="test")

        assert result is False


class TestUpdateSyncStatus:
    """Tests de update_sync_status."""

    def test_updates_status_to_success(self) -> None:
        """Met à jour le statut à success avec last_sync_at."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = update_sync_status(1, "success")

        assert result is True
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "last_sync_at = CURRENT_TIMESTAMP" in call_sql
        assert "last_sync_error = NULL" in call_sql

    def test_updates_status_to_error_with_message(self) -> None:
        """Met à jour le statut à error avec message."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = update_sync_status(1, "error", error="Connection failed")

        assert result is True
        call_args = mock_cursor.execute.call_args[0][1]
        assert "error" in call_args
        assert "Connection failed" in call_args

    def test_updates_status_to_running(self) -> None:
        """Met à jour le statut à running."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = update_sync_status(1, "running")

        assert result is True


class TestDeleteDatasource:
    """Tests de delete_datasource."""

    def test_deletes_datasource(self) -> None:
        """Supprime une datasource."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = delete_datasource(1)

        assert result is True
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_returns_false_if_not_found(self) -> None:
        """Retourne False si non trouvé."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.datasources.get_connection", return_value=mock_conn):
            result = delete_datasource(999)

        assert result is False
