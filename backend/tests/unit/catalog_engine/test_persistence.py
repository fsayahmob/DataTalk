"""Tests pour catalog_engine/persistence.py - Persistence PostgreSQL."""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from catalog_engine.models import ColumnMetadata, ExtractedCatalog, TableMetadata
from catalog_engine.persistence import (
    DEFAULT_DB_PATH,
    get_duckdb_path,
    save_to_catalog,
    update_descriptions,
)


class TestGetDuckdbPath:
    """Tests de get_duckdb_path."""

    @patch("catalog_engine.persistence.get_setting")
    def test_returns_setting_value(self, mock_setting: MagicMock) -> None:
        """Retourne la valeur du setting."""
        mock_setting.return_value = "/custom/path/db.duckdb"
        path = get_duckdb_path()
        assert path == "/custom/path/db.duckdb"

    @patch("catalog_engine.persistence.get_setting")
    def test_returns_default_when_no_setting(self, mock_setting: MagicMock) -> None:
        """Retourne le défaut si pas de setting."""
        mock_setting.return_value = None
        path = get_duckdb_path()
        assert path == DEFAULT_DB_PATH

    @patch("catalog_engine.persistence.get_setting")
    def test_resolves_relative_path(self, mock_setting: MagicMock) -> None:
        """Résout les chemins relatifs."""
        mock_setting.return_value = "data/test.duckdb"
        path = get_duckdb_path()
        # Doit être un chemin absolu
        assert Path(path).is_absolute()


class TestSaveToCatalog:
    """Tests de save_to_catalog."""

    @patch("catalog_engine.persistence.add_synonym")
    @patch("catalog_engine.persistence.add_column")
    @patch("catalog_engine.persistence.add_table")
    @patch("catalog_engine.persistence.add_datasource")
    def test_creates_datasource(
        self,
        mock_ds: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_syn: MagicMock,
    ) -> None:
        """Crée la datasource."""
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1

        catalog = ExtractedCatalog(
            datasource="g7_analytics.duckdb",
            tables=[],
        )
        enrichment: dict[str, Any] = {}

        save_to_catalog(catalog, enrichment)

        mock_ds.assert_called_once()
        assert "g7_analytics" in mock_ds.call_args[1]["name"]

    @patch("catalog_engine.persistence.get_connection")
    @patch("catalog_engine.persistence.add_synonym")
    @patch("catalog_engine.persistence.add_column")
    @patch("catalog_engine.persistence.add_table")
    @patch("catalog_engine.persistence.add_datasource")
    def test_creates_tables(
        self,
        mock_ds: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_syn: MagicMock,
        mock_conn: MagicMock,
    ) -> None:
        """Crée les tables."""
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(name="users", row_count=100, columns=[]),
                TableMetadata(name="orders", row_count=50, columns=[]),
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {"description": "Users table", "columns": {}},
            "orders": {"description": "Orders table", "columns": {}},
        }

        stats = save_to_catalog(catalog, enrichment)
        assert stats["tables"] == 2

    @patch("catalog_engine.persistence.get_connection")
    @patch("catalog_engine.persistence.add_synonym")
    @patch("catalog_engine.persistence.add_column")
    @patch("catalog_engine.persistence.add_table")
    @patch("catalog_engine.persistence.add_datasource")
    def test_creates_columns(
        self,
        mock_ds: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_syn: MagicMock,
        mock_conn: MagicMock,
    ) -> None:
        """Crée les colonnes."""
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="id", data_type="INT"),
                        ColumnMetadata(name="name", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {
                "description": "Users table",
                "columns": {
                    "id": {"description": "User ID", "synonyms": []},
                    "name": {"description": "User name", "synonyms": []},
                },
            }
        }

        stats = save_to_catalog(catalog, enrichment)
        assert stats["columns"] == 2

    @patch("catalog_engine.persistence.get_connection")
    @patch("catalog_engine.persistence.add_synonym")
    @patch("catalog_engine.persistence.add_column")
    @patch("catalog_engine.persistence.add_table")
    @patch("catalog_engine.persistence.add_datasource")
    def test_creates_synonyms(
        self,
        mock_ds: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_syn: MagicMock,
        mock_conn: MagicMock,
    ) -> None:
        """Crée les synonymes."""
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {
                "description": "Users",
                "columns": {
                    "id": {"description": "ID", "synonyms": ["user_id", "uid"]},
                },
            }
        }

        stats = save_to_catalog(catalog, enrichment)
        assert stats["synonyms"] == 2

    @patch("catalog_engine.persistence.get_connection")
    @patch("catalog_engine.persistence.add_datasource")
    def test_raises_if_datasource_creation_fails(
        self,
        mock_ds: MagicMock,
        mock_conn: MagicMock,
    ) -> None:
        """Lève erreur si création datasource échoue."""
        mock_ds.return_value = None
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(datasource="test.duckdb", tables=[])
        enrichment: dict[str, Any] = {}

        with pytest.raises(ValueError, match="Impossible de créer"):
            save_to_catalog(catalog, enrichment)


class TestUpdateDescriptions:
    """Tests de update_descriptions."""

    @patch("catalog_engine.persistence.get_connection")
    def test_updates_table_descriptions(self, mock_conn: MagicMock) -> None:
        """Met à jour les descriptions de tables."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.return_value = {"id": 1}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="users", row_count=100, columns=[])],
        )
        enrichment: dict[str, Any] = {"users": {"description": "New description", "columns": {}}}

        stats = update_descriptions(catalog, enrichment)
        assert stats["tables"] == 1

    @patch("catalog_engine.persistence.get_connection")
    def test_updates_column_descriptions(self, mock_conn: MagicMock) -> None:
        """Met à jour les descriptions de colonnes."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [
            {"id": 1},  # table id
            {"id": 10},  # column id (pour synonymes)
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {
                "description": "Table desc",
                "columns": {"id": {"description": "ID desc", "synonyms": []}},
            }
        }

        stats = update_descriptions(catalog, enrichment)
        assert stats["columns"] == 1

    @patch("catalog_engine.persistence.get_connection")
    def test_adds_synonyms(self, mock_conn: MagicMock) -> None:
        """Ajoute les synonymes."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [
            {"id": 1},  # table id
            {"id": 10},  # column id
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {
                "description": "Table",
                "columns": {"id": {"description": "ID", "synonyms": ["user_id", "uid"]}},
            }
        }

        stats = update_descriptions(catalog, enrichment)
        assert stats["synonyms"] == 2

    @patch("catalog_engine.persistence.get_connection")
    def test_skips_missing_table(self, mock_conn: MagicMock) -> None:
        """Skip les tables manquantes."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0  # No row updated
        cursor.fetchone.return_value = None  # Table not found
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="missing", row_count=100, columns=[])],
        )
        enrichment: dict[str, Any] = {"missing": {"description": "Desc", "columns": {}}}

        stats = update_descriptions(catalog, enrichment)
        assert stats["columns"] == 0

    @patch("catalog_engine.persistence.get_connection")
    def test_skips_empty_description(self, mock_conn: MagicMock) -> None:
        """Skip les descriptions vides."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0
        cursor.fetchone.return_value = {"id": 1}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="users", row_count=100, columns=[])],
        )
        enrichment: dict[str, Any] = {
            "users": {"description": "", "columns": {}}  # Empty
        }

        stats = update_descriptions(catalog, enrichment)
        assert stats["tables"] == 0

    @patch("catalog_engine.persistence.get_connection")
    def test_commits_and_closes(self, mock_conn: MagicMock) -> None:
        """Commit et ferme la connexion."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        catalog = ExtractedCatalog(datasource="test.duckdb", tables=[])
        enrichment: dict[str, Any] = {}

        update_descriptions(catalog, enrichment)

        conn.commit.assert_called_once()
        conn.close.assert_called_once()
