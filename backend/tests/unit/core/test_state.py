"""Tests pour core/state.py - État applicatif thread-safe."""

import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import duckdb
import pytest

from core.state import (
    DEFAULT_DB_PATH,
    PromptNotConfiguredError,
    _AppState,
    app_state,
    get_duckdb_path,
    get_system_instruction,
)


class TestAppStateInit:
    """Tests d'initialisation de _AppState."""

    def test_initial_connection_is_none(self) -> None:
        """La connexion initiale est None."""
        state = _AppState()
        assert state.db_connection is None

    def test_initial_cache_is_none(self) -> None:
        """Le cache initial est None."""
        state = _AppState()
        assert state.db_schema_cache is None

    def test_initial_path_is_none(self) -> None:
        """Le path initial est None."""
        state = _AppState()
        assert state.current_db_path is None

    def test_has_rlock(self) -> None:
        """L'état utilise un RLock pour la thread-safety."""
        state = _AppState()
        assert isinstance(state._lock, type(threading.RLock()))


class TestAppStateConnection:
    """Tests de gestion de la connexion."""

    def test_set_and_get_connection(self) -> None:
        """Peut définir et récupérer une connexion."""
        state = _AppState()
        mock_conn = MagicMock()

        state.db_connection = mock_conn

        assert state.db_connection is mock_conn

    def test_connection_close_on_replace(self) -> None:
        """L'ancienne connexion est fermée lors du remplacement."""
        state = _AppState()

        old_conn = MagicMock()
        state.db_connection = old_conn

        new_conn = MagicMock()
        state.db_connection = new_conn

        old_conn.close.assert_called_once()

    def test_connection_close_error_ignored(self) -> None:
        """Les erreurs de fermeture DuckDB sont ignorées."""
        state = _AppState()

        old_conn = MagicMock()
        # Utiliser duckdb.Error spécifique au lieu de Exception générique
        old_conn.close.side_effect = duckdb.Error("Connection already closed")
        state.db_connection = old_conn

        # Ne doit pas lever d'exception
        new_conn = MagicMock()
        state.db_connection = new_conn

    def test_set_none_connection(self) -> None:
        """Peut définir une connexion à None."""
        state = _AppState()
        mock_conn = MagicMock()
        state.db_connection = mock_conn

        state.db_connection = None

        assert state.db_connection is None
        mock_conn.close.assert_called_once()


class TestAppStateCache:
    """Tests de la gestion du cache schéma."""

    def test_set_and_get_cache(self) -> None:
        """Peut définir et récupérer le cache."""
        state = _AppState()

        state.db_schema_cache = "test_schema"

        assert state.db_schema_cache == "test_schema"

    def test_cache_invalidated_on_connection_change(self) -> None:
        """Le cache est invalidé quand la connexion change."""
        state = _AppState()
        state._db_schema_cache = "cached_schema"

        mock_conn = MagicMock()
        state.db_connection = mock_conn

        assert state.db_schema_cache is None

    def test_cache_invalidated_on_path_change(self) -> None:
        """Le cache est invalidé quand le path change."""
        state = _AppState()
        state._db_schema_cache = "cached_schema"
        state._current_db_path = "/old/path.duckdb"

        state.current_db_path = "/new/path.duckdb"

        assert state.db_schema_cache is None

    def test_cache_not_invalidated_on_same_path(self) -> None:
        """Le cache n'est PAS invalidé si le path est identique."""
        state = _AppState()
        state._db_schema_cache = "cached_schema"
        state._current_db_path = "/same/path.duckdb"

        state.current_db_path = "/same/path.duckdb"

        assert state.db_schema_cache == "cached_schema"

    def test_invalidate_cache_method(self) -> None:
        """La méthode invalidate_cache() fonctionne."""
        state = _AppState()
        state._db_schema_cache = "cached_schema"

        state.invalidate_cache()

        assert state.db_schema_cache is None


class TestAppStatePath:
    """Tests de gestion du path."""

    def test_set_and_get_path(self) -> None:
        """Peut définir et récupérer le path."""
        state = _AppState()

        state.current_db_path = "/test/path.duckdb"

        assert state.current_db_path == "/test/path.duckdb"

    def test_set_none_path(self) -> None:
        """Peut définir le path à None."""
        state = _AppState()
        state.current_db_path = "/test/path.duckdb"

        state.current_db_path = None

        assert state.current_db_path is None


class TestAppStateSingleton:
    """Tests du singleton app_state."""

    def test_app_state_is_singleton(self) -> None:
        """app_state est une instance unique."""
        from core.state import app_state as state1
        from core.state import app_state as state2

        assert state1 is state2

    def test_app_state_is_app_state_instance(self) -> None:
        """app_state est une instance de _AppState."""
        assert isinstance(app_state, _AppState)


class TestGetDuckdbPath:
    """Tests de get_duckdb_path."""

    def test_returns_setting_when_exists(self) -> None:
        """Retourne le path depuis les settings."""
        with patch("core.state.get_setting", return_value="/custom/path.duckdb"):
            result = get_duckdb_path()
        assert "custom" in result or result == "/custom/path.duckdb"

    def test_returns_default_when_no_setting(self) -> None:
        """Retourne le path par défaut sans setting."""
        with patch("core.state.get_setting", return_value=None):
            result = get_duckdb_path()
        assert result == DEFAULT_DB_PATH

    def test_resolves_relative_path(self) -> None:
        """Résout les chemins relatifs."""
        with patch("core.state.get_setting", return_value="data/test.duckdb"):
            result = get_duckdb_path()
        # Le chemin doit être absolu après résolution
        assert Path(result).is_absolute()

    def test_preserves_absolute_path(self) -> None:
        """Préserve les chemins absolus."""
        with patch("core.state.get_setting", return_value="/absolute/path.duckdb"):
            result = get_duckdb_path()
        assert result == "/absolute/path.duckdb"


class TestPromptNotConfiguredError:
    """Tests de PromptNotConfiguredError."""

    def test_is_exception(self) -> None:
        """Est une Exception."""
        assert issubclass(PromptNotConfiguredError, Exception)

    def test_stores_prompt_key(self) -> None:
        """Stocke la clé du prompt."""
        error = PromptNotConfiguredError("test_key")
        assert error.prompt_key == "test_key"

    def test_message_includes_key(self) -> None:
        """Le message inclut la clé."""
        error = PromptNotConfiguredError("analytics_system")
        assert "analytics_system" in str(error)

    def test_message_includes_hint(self) -> None:
        """Le message inclut un indice."""
        error = PromptNotConfiguredError("test_key")
        assert "seed_prompts.py" in str(error)


class TestGetSystemInstruction:
    """Tests de get_system_instruction."""

    def test_raises_when_no_prompt(self) -> None:
        """Lève PromptNotConfiguredError quand pas de prompt."""
        with (
            patch("core.state.app_state") as mock_state,
            patch("core.state.get_active_prompt", return_value=None),
        ):
            mock_state.db_schema_cache = "schema"

            with pytest.raises(PromptNotConfiguredError):
                get_system_instruction()

    def test_raises_when_empty_content(self) -> None:
        """Lève PromptNotConfiguredError quand contenu vide."""
        with (
            patch("core.state.app_state") as mock_state,
            patch("core.state.get_active_prompt", return_value={"content": ""}),
        ):
            mock_state.db_schema_cache = "schema"

            with pytest.raises(PromptNotConfiguredError):
                get_system_instruction()

    def test_injects_schema_in_prompt(self) -> None:
        """Injecte le schéma dans le prompt."""
        with (
            patch("core.state.app_state") as mock_state,
            patch(
                "core.state.get_active_prompt",
                return_value={"content": "Schema: {schema}"},
            ),
        ):
            mock_state.db_schema_cache = "test_schema"

            result = get_system_instruction()

            assert "test_schema" in result

    def test_loads_schema_if_not_cached(self) -> None:
        """Charge le schéma s'il n'est pas en cache."""
        with (
            patch("core.state.app_state") as mock_state,
            patch("core.state.get_schema_for_llm", return_value="loaded_schema"),
            patch(
                "core.state.get_active_prompt",
                return_value={"content": "Schema: {schema}"},
            ),
        ):
            mock_state.db_schema_cache = None

            get_system_instruction()

            # Le cache doit être mis à jour
            mock_state.db_schema_cache = "loaded_schema"


class TestConstants:
    """Tests des constantes."""

    def test_default_db_path_exists(self) -> None:
        """DEFAULT_DB_PATH est défini."""
        assert DEFAULT_DB_PATH is not None
        assert "duckdb" in DEFAULT_DB_PATH.lower()
