"""Tests pour llm_config/secrets.py - Gestion clés API chiffrées."""

from unittest.mock import MagicMock, patch

import pytest

from llm_config.secrets import (
    get_api_key,
    get_api_key_hint,
    has_api_key,
    set_api_key,
)


class TestSetApiKey:
    """Tests de set_api_key."""

    @patch("llm_config.secrets.encrypt")
    @patch("llm_config.secrets.get_connection")
    def test_saves_encrypted_key(self, mock_conn: MagicMock, mock_encrypt: MagicMock) -> None:
        """Sauvegarde la clé chiffrée."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_encrypt.return_value = b"encrypted_key"

        result = set_api_key(1, "AIza1234567890abcdef")
        assert result is True
        mock_encrypt.assert_called_once_with("AIza1234567890abcdef")
        conn.commit.assert_called_once()

    @patch("llm_config.secrets.get_connection")
    def test_deletes_empty_key(self, mock_conn: MagicMock) -> None:
        """Supprime l'entrée si clé vide."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_api_key(1, "")
        assert result is True

        # Vérifie que DELETE a été appelé
        call_args = cursor.execute.call_args[0][0]
        assert "DELETE" in call_args

    @patch("llm_config.secrets.get_connection")
    def test_deletes_whitespace_key(self, mock_conn: MagicMock) -> None:
        """Supprime l'entrée si clé avec espaces."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_api_key(1, "   ")
        assert result is True

    @patch("llm_config.secrets.encrypt")
    @patch("llm_config.secrets.get_connection")
    def test_creates_key_hint(self, mock_conn: MagicMock, mock_encrypt: MagicMock) -> None:
        """Crée un indice de clé."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_encrypt.return_value = b"encrypted"

        set_api_key(1, "AIza1234567890abcdef")

        # Vérifier que l'indice est dans les paramètres INSERT
        call_args = cursor.execute.call_args[0][1]
        # call_args devrait contenir provider_id, encrypted_key, key_hint
        assert any("AIza" in str(arg) and "cdef" in str(arg) for arg in call_args)

    @patch("llm_config.secrets.encrypt")
    @patch("llm_config.secrets.get_connection")
    def test_short_key_masked(self, mock_conn: MagicMock, mock_encrypt: MagicMock) -> None:
        """Masque les clés courtes."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_encrypt.return_value = b"encrypted"

        set_api_key(1, "short")

        call_args = cursor.execute.call_args[0][1]
        # Clé courte devrait être masquée en ***
        assert any("***" in str(arg) for arg in call_args)


class TestGetApiKey:
    """Tests de get_api_key."""

    @patch("llm_config.secrets.decrypt")
    @patch("llm_config.secrets.get_connection")
    def test_returns_decrypted_key(self, mock_conn: MagicMock, mock_decrypt: MagicMock) -> None:
        """Retourne la clé déchiffrée."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"encrypted_api_key": b"encrypted_data"}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_decrypt.return_value = "AIza1234567890abcdef"

        key = get_api_key(1)
        assert key == "AIza1234567890abcdef"
        mock_decrypt.assert_called_once_with(b"encrypted_data")

    @patch("llm_config.secrets.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        key = get_api_key(999)
        assert key is None

    @patch("llm_config.secrets.get_connection")
    def test_returns_none_if_empty(self, mock_conn: MagicMock) -> None:
        """Retourne None si clé vide."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"encrypted_api_key": None}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        key = get_api_key(1)
        assert key is None


class TestHasApiKey:
    """Tests de has_api_key."""

    @patch("llm_config.secrets.get_api_key")
    def test_returns_true_if_key_exists(self, mock_get: MagicMock) -> None:
        """Retourne True si clé existe."""
        mock_get.return_value = "some_api_key"
        assert has_api_key(1) is True

    @patch("llm_config.secrets.get_api_key")
    def test_returns_false_if_no_key(self, mock_get: MagicMock) -> None:
        """Retourne False si pas de clé."""
        mock_get.return_value = None
        assert has_api_key(1) is False


class TestGetApiKeyHint:
    """Tests de get_api_key_hint."""

    @patch("llm_config.secrets.get_connection")
    def test_returns_hint(self, mock_conn: MagicMock) -> None:
        """Retourne l'indice."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"key_hint": "AIza...cdef"}
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        hint = get_api_key_hint(1)
        assert hint == "AIza...cdef"

    @patch("llm_config.secrets.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        hint = get_api_key_hint(999)
        assert hint is None
