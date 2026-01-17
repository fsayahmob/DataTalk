"""
Tests pour llm_config.py

Règle: Importer uniquement depuis llm_config (pas depuis sous-modules futurs).
Ces tests doivent passer avant ET après refactoring.
"""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Import depuis la racine du module (agnostique au refactoring)
from llm_config import (
    add_prompt,
    delete_prompt,
    get_active_prompt,
    get_api_key,
    get_api_key_hint,
    get_default_model,
    get_model,
    get_models,
    get_prompt,
    get_prompts,
    get_provider,
    get_provider_by_name,
    get_providers,
    get_total_costs,
    has_api_key,
    log_cost,
    set_api_key,
    set_default_model,
)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def mock_db_connection() -> Any:
    """Mock la connexion DB pour isoler les tests.

    Patch tous les sous-modules qui importent get_connection depuis db.
    """
    mock_cursor = MagicMock()
    mock_conn_instance = MagicMock()
    mock_conn_instance.cursor.return_value = mock_cursor
    mock_conn_instance.close = MagicMock()

    with (
        patch("llm_config.providers.get_connection", return_value=mock_conn_instance),
        patch("llm_config.models.get_connection", return_value=mock_conn_instance),
        patch("llm_config.secrets.get_connection", return_value=mock_conn_instance),
        patch("llm_config.costs.get_connection", return_value=mock_conn_instance),
        patch("llm_config.prompts.get_connection", return_value=mock_conn_instance),
    ):
        yield mock_conn_instance, mock_cursor


@pytest.fixture
def mock_crypto() -> Any:
    """Mock le chiffrement/déchiffrement."""
    with (
        patch("llm_config.secrets.encrypt") as mock_enc,
        patch("llm_config.secrets.decrypt") as mock_dec,
    ):
        mock_enc.return_value = "encrypted_key"
        mock_dec.return_value = "decrypted_key"
        yield mock_enc, mock_dec


# =============================================================================
# TESTS PROVIDERS
# =============================================================================


class TestProviders:
    """Tests CRUD providers."""

    def test_get_providers_returns_list(self, mock_db_connection: Any) -> None:
        """get_providers retourne une liste."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchall.return_value = []

        result = get_providers()

        assert isinstance(result, list)
        mock_cursor.execute.assert_called_once()

    def test_get_providers_enabled_only_filter(self, mock_db_connection: Any) -> None:
        """get_providers avec enabled_only=True filtre correctement."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchall.return_value = []

        get_providers(enabled_only=True)

        # Vérifier que la requête contient WHERE is_enabled = 1
        call_args = mock_cursor.execute.call_args[0][0]
        assert "is_enabled = 1" in call_args

    def test_get_provider_by_id_returns_dict_or_none(self, mock_db_connection: Any) -> None:
        """get_provider retourne un dict ou None."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = get_provider(999)

        assert result is None

    def test_get_provider_by_name_returns_dict_or_none(self, mock_db_connection: Any) -> None:
        """get_provider_by_name retourne un dict ou None."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = get_provider_by_name("nonexistent")

        assert result is None


# =============================================================================
# TESTS MODELS
# =============================================================================


class TestModels:
    """Tests CRUD models."""

    def test_get_models_returns_list(self, mock_db_connection: Any) -> None:
        """get_models retourne une liste."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchall.return_value = []

        result = get_models()

        assert isinstance(result, list)

    def test_get_model_by_id_returns_dict_or_none(self, mock_db_connection: Any) -> None:
        """get_model retourne un dict ou None."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = get_model(999)

        assert result is None

    def test_get_default_model_returns_dict_or_none(self, mock_db_connection: Any) -> None:
        """get_default_model retourne le modèle par défaut ou None."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = get_default_model()

        assert result is None

    def test_set_default_model_returns_bool(self, mock_db_connection: Any) -> None:
        """set_default_model retourne True/False."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None  # Modèle non trouvé

        result = set_default_model("nonexistent-model")

        assert result is False


# =============================================================================
# TESTS SECRETS
# =============================================================================


class TestSecrets:
    """Tests CRUD secrets (API keys)."""

    def test_set_api_key_encrypts_key(self, mock_db_connection: Any, mock_crypto: Any) -> None:
        """set_api_key chiffre la clé avant stockage."""
        _mock_conn, _mock_cursor = mock_db_connection
        mock_encrypt, _ = mock_crypto

        set_api_key(1, "my-secret-key")

        mock_encrypt.assert_called_once_with("my-secret-key")

    def test_set_api_key_empty_deletes(
        self,
        mock_db_connection: Any,
        mock_crypto: Any,
    ) -> None:
        """set_api_key avec clé vide supprime l'entrée."""
        _mock_conn, mock_cursor = mock_db_connection

        result = set_api_key(1, "")

        assert result is True
        # Vérifier que DELETE a été appelé
        executed_sql = mock_cursor.execute.call_args[0][0]
        assert "DELETE" in executed_sql

    def test_get_api_key_decrypts(self, mock_db_connection: Any, mock_crypto: Any) -> None:
        """get_api_key déchiffre la clé."""
        _mock_conn, mock_cursor = mock_db_connection
        _, mock_decrypt = mock_crypto
        mock_cursor.fetchone.return_value = {"encrypted_api_key": "encrypted"}

        result = get_api_key(1)

        mock_decrypt.assert_called_once_with("encrypted")
        assert result == "decrypted_key"

    def test_has_api_key_returns_bool(
        self,
        mock_db_connection: Any,
        mock_crypto: Any,
    ) -> None:
        """has_api_key retourne True/False."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = has_api_key(1)

        assert result is False

    def test_get_api_key_hint_returns_masked_key(self, mock_db_connection: Any) -> None:
        """get_api_key_hint retourne le hint masqué."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = {"key_hint": "AIza...xyz"}

        result = get_api_key_hint(1)

        assert result == "AIza...xyz"


# =============================================================================
# TESTS COSTS
# =============================================================================


class TestCosts:
    """Tests tracking des coûts."""

    def test_log_cost_returns_id(self, mock_db_connection: Any) -> None:
        """log_cost retourne l'ID du log créé."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.lastrowid = 42

        # Mock get_model pour éviter l'appel DB supplémentaire
        with patch(
            "llm_config.costs.get_model",
            return_value={"cost_per_1m_input": 0.1, "cost_per_1m_output": 0.2},
        ):
            result = log_cost(
                model_id=1,
                source="test",
                tokens_input=100,
                tokens_output=50,
            )

        assert result == 42

    def test_get_total_costs_structure(self, mock_db_connection: Any) -> None:
        """get_total_costs retourne la bonne structure."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = {
            "total_calls": 10,
            "total_tokens_input": 1000,
            "total_tokens_output": 500,
            "total_cost": 0.05,
        }

        result = get_total_costs(days=30)

        assert "total_calls" in result
        assert "total_tokens_input" in result
        assert "total_tokens_output" in result
        assert "total_cost" in result


# =============================================================================
# TESTS PROMPTS
# =============================================================================


class TestPrompts:
    """Tests CRUD prompts."""

    def test_get_prompts_returns_list(self, mock_db_connection: Any) -> None:
        """get_prompts retourne une liste."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchall.return_value = []

        result = get_prompts()

        assert isinstance(result, list)

    def test_get_prompt_by_key_version(self, mock_db_connection: Any) -> None:
        """get_prompt cherche par clé et version."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.fetchone.return_value = None

        result = get_prompt("catalog_enrichment", "normal")

        assert result is None
        # Vérifier les paramètres de la requête
        call_args = mock_cursor.execute.call_args
        assert "catalog_enrichment" in call_args[0][1]
        assert "normal" in call_args[0][1]

    def test_get_active_prompt_fallback(self, mock_db_connection: Any) -> None:
        """get_active_prompt fait fallback sur version 'normal'."""
        _mock_conn, mock_cursor = mock_db_connection
        # Premier appel (actif) retourne None, deuxième (fallback) aussi
        mock_cursor.fetchone.return_value = None

        result = get_active_prompt("nonexistent")

        # Devrait avoir appelé execute au moins une fois
        assert mock_cursor.execute.call_count >= 1
        assert result is None

    def test_add_prompt_returns_id(self, mock_db_connection: Any) -> None:
        """add_prompt retourne l'ID du prompt créé."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.lastrowid = 123

        result = add_prompt(
            key="test_prompt",
            name="Test Prompt",
            category="test",
            content="Test content",
        )

        assert result == 123

    def test_delete_prompt_returns_bool(self, mock_db_connection: Any) -> None:
        """delete_prompt retourne True/False."""
        _mock_conn, mock_cursor = mock_db_connection
        mock_cursor.rowcount = 1

        result = delete_prompt(1)

        assert result is True
