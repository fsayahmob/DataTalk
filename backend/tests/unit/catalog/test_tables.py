"""Tests pour catalog/tables.py - CRUD tables, columns, synonyms."""

from unittest.mock import MagicMock, patch

import pytest

from catalog.tables import (
    add_column,
    add_synonym,
    add_table,
    get_schema_for_llm,
    get_table_by_id,
    get_table_info,
    set_table_enabled,
    toggle_table_enabled,
)


class TestAddTable:
    """Tests de add_table."""

    def test_inserts_table(self) -> None:
        """Insère une table."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 42
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = add_table(1, "test_table", "description", 1000)

        assert result == 42
        mock_cursor.execute.assert_called_once()
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_handles_optional_parameters(self) -> None:
        """Gère les paramètres optionnels."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = add_table(1, "test_table")

        assert result == 1
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[2] is None  # description
        assert call_args[3] is None  # row_count


class TestAddColumn:
    """Tests de add_column."""

    def test_inserts_column(self) -> None:
        """Insère une colonne."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 100
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = add_column(
                table_id=1,
                name="email",
                data_type="VARCHAR",
                description="Email address",
            )

        assert result == 100
        mock_conn.commit.assert_called_once()

    def test_handles_all_parameters(self) -> None:
        """Gère tous les paramètres."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = add_column(
                table_id=1,
                name="id",
                data_type="INTEGER",
                description="Primary key",
                sample_values="1, 2, 3",
                value_range="1-1000000",
                is_primary_key=True,
                full_context="Stats: 100% unique",
            )

        assert result == 1
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[6] is True  # is_primary_key


class TestAddSynonym:
    """Tests de add_synonym."""

    def test_inserts_synonym(self) -> None:
        """Insère un synonyme."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            add_synonym(1, "email_address")

        mock_cursor.execute.assert_called_once()
        assert "INSERT INTO synonyms" in mock_cursor.execute.call_args[0][0]
        mock_conn.commit.assert_called_once()


class TestGetSchemaForLlm:
    """Tests de get_schema_for_llm."""

    def test_returns_schema_string(self) -> None:
        """Retourne une string de schéma."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        # Mode setting
        mock_cursor.fetchone.side_effect = [
            {"value": "compact"},  # catalog_context_mode
        ]
        # Datasources
        mock_cursor.fetchall.side_effect = [
            [{"id": 1, "name": "test_ds"}],  # datasources
            [{"id": 1, "name": "users", "row_count": 1000}],  # tables
            [  # columns
                {
                    "name": "id",
                    "data_type": "INTEGER",
                    "description": "ID",
                    "value_range": "1-1000",
                    "full_context": None,
                }
            ],
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_schema_for_llm()

        assert isinstance(result, str)
        assert "users" in result
        mock_conn.close.assert_called_once()

    def test_filters_by_datasource_name(self) -> None:
        """Filtre par nom de datasource."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.fetchall.side_effect = [[], []]  # Empty results
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            get_schema_for_llm(datasource_name="specific_ds")

        # Should filter by name
        calls = [str(c) for c in mock_cursor.execute.call_args_list]
        assert any("specific_ds" in str(c) for c in calls)

    def test_uses_full_context_in_full_mode(self) -> None:
        """Utilise full_context en mode full."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        mock_cursor.fetchone.return_value = {"value": "full"}
        mock_cursor.fetchall.side_effect = [
            [{"id": 1, "name": "test_ds"}],
            [{"id": 1, "name": "test", "row_count": 100}],
            [
                {
                    "name": "col",
                    "data_type": "INT",
                    "description": None,
                    "value_range": None,
                    "full_context": "FULL_STATS",
                }
            ],
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_schema_for_llm()

        assert "FULL_STATS" in result

    def test_truncates_long_descriptions(self) -> None:
        """Tronque les descriptions longues."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        long_desc = "x" * 100
        mock_cursor.fetchone.return_value = None
        mock_cursor.fetchall.side_effect = [
            [{"id": 1, "name": "test_ds"}],
            [{"id": 1, "name": "test", "row_count": 100}],
            [
                {
                    "name": "col",
                    "data_type": "INT",
                    "description": long_desc,
                    "value_range": None,
                    "full_context": None,
                }
            ],
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_schema_for_llm()

        # Description should be truncated to 80 chars + "..."
        assert "..." in result


class TestGetTableInfo:
    """Tests de get_table_info."""

    def test_returns_table_info(self) -> None:
        """Retourne les infos de la table."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {
            "id": 1,
            "name": "users",
            "row_count": 1000,
            "datasource_name": "main",
        }
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_table_info("users")

        assert result is not None
        assert result["name"] == "users"

    def test_returns_none_when_not_found(self) -> None:
        """Retourne None si table non trouvée."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_table_info("nonexistent")

        assert result is None


class TestToggleTableEnabled:
    """Tests de toggle_table_enabled."""

    def test_toggles_enabled_state(self) -> None:
        """Inverse l'état enabled."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = toggle_table_enabled(1)

        assert result is True
        mock_conn.commit.assert_called_once()

    def test_returns_false_when_not_found(self) -> None:
        """Retourne False si table non trouvée."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = toggle_table_enabled(999)

        assert result is False


class TestSetTableEnabled:
    """Tests de set_table_enabled."""

    def test_sets_enabled_true(self) -> None:
        """Définit enabled à True."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = set_table_enabled(1, True)

        assert result is True
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[0] is True

    def test_sets_enabled_false(self) -> None:
        """Définit enabled à False."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = set_table_enabled(1, False)

        assert result is True
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[0] is False

    def test_returns_false_when_not_found(self) -> None:
        """Retourne False si table non trouvée."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = set_table_enabled(999, True)

        assert result is False


class TestGetTableById:
    """Tests de get_table_by_id."""

    def test_returns_table(self) -> None:
        """Retourne la table."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"id": 1, "name": "users"}
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_table_by_id(1)

        assert result is not None
        assert result["id"] == 1

    def test_returns_none_when_not_found(self) -> None:
        """Retourne None si non trouvée."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.tables.get_connection", return_value=mock_conn):
            result = get_table_by_id(999)

        assert result is None
