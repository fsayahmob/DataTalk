"""Tests pour catalog/settings.py - CRUD settings."""

from unittest.mock import MagicMock, patch

import pytest

from catalog.settings import get_all_settings, get_setting, set_setting


class TestGetSetting:
    """Tests de get_setting."""

    def test_returns_value_when_exists(self) -> None:
        """Retourne la valeur quand elle existe."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"value": "test_value"}
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            result = get_setting("test_key")

        assert result == "test_value"
        mock_cursor.execute.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_returns_none_when_not_exists(self) -> None:
        """Retourne None quand la clé n'existe pas."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            result = get_setting("nonexistent_key")

        assert result is None

    def test_returns_default_when_not_exists(self) -> None:
        """Retourne la valeur par défaut quand la clé n'existe pas."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            result = get_setting("nonexistent_key", default="default_value")

        assert result == "default_value"

    def test_closes_connection_on_success(self) -> None:
        """Ferme la connexion en cas de succès."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"value": "test"}
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            get_setting("key")

        mock_conn.close.assert_called_once()

    def test_closes_connection_on_error(self) -> None:
        """Ferme la connexion même en cas d'erreur."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = Exception("DB error")
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            with pytest.raises(Exception):
                get_setting("key")

        mock_conn.close.assert_called_once()


class TestSetSetting:
    """Tests de set_setting."""

    def test_inserts_or_replaces_setting(self) -> None:
        """Insert ou remplace une valeur."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            set_setting("test_key", "test_value")

        mock_cursor.execute.assert_called_once()
        call_args = mock_cursor.execute.call_args
        assert "INSERT OR REPLACE" in call_args[0][0]
        assert call_args[0][1] == ("test_key", "test_value")

    def test_commits_transaction(self) -> None:
        """Commit la transaction."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            set_setting("key", "value")

        mock_conn.commit.assert_called_once()

    def test_closes_connection(self) -> None:
        """Ferme la connexion."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            set_setting("key", "value")

        mock_conn.close.assert_called_once()


class TestGetAllSettings:
    """Tests de get_all_settings."""

    def test_returns_dict_of_settings(self) -> None:
        """Retourne un dict de settings."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {"key": "key1", "value": "value1"},
            {"key": "key2", "value": "value2"},
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            result = get_all_settings()

        assert result == {"key1": "value1", "key2": "value2"}

    def test_returns_empty_dict_when_no_settings(self) -> None:
        """Retourne un dict vide sans settings."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            result = get_all_settings()

        assert result == {}

    def test_closes_connection(self) -> None:
        """Ferme la connexion."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.settings.get_connection", return_value=mock_conn):
            get_all_settings()

        mock_conn.close.assert_called_once()
