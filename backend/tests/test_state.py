"""Tests pour core/state.py - État applicatif thread-safe."""

from unittest.mock import MagicMock


class TestAppStateCache:
    """Tests de la gestion du cache schéma."""

    def test_cache_invalidated_on_connection_change(self) -> None:
        """Le cache est invalidé quand la connexion change."""
        from core.state import _AppState

        state = _AppState()

        # Simuler un cache existant
        state._db_schema_cache = "cached_schema"

        # Changer la connexion
        mock_conn = MagicMock()
        state.db_connection = mock_conn

        # Le cache doit être invalidé
        assert state.db_schema_cache is None

    def test_cache_invalidated_on_path_change(self) -> None:
        """Le cache est invalidé quand le path change."""
        from core.state import _AppState

        state = _AppState()
        state._db_schema_cache = "cached_schema"
        state._current_db_path = "/old/path.duckdb"

        # Changer le path
        state.current_db_path = "/new/path.duckdb"

        # Le cache doit être invalidé
        assert state.db_schema_cache is None

    def test_cache_not_invalidated_on_same_path(self) -> None:
        """Le cache n'est PAS invalidé si le path est identique."""
        from core.state import _AppState

        state = _AppState()
        state._db_schema_cache = "cached_schema"
        state._current_db_path = "/same/path.duckdb"

        # Définir le même path
        state.current_db_path = "/same/path.duckdb"

        # Le cache doit être préservé
        assert state.db_schema_cache == "cached_schema"

    def test_invalidate_cache_method(self) -> None:
        """La méthode invalidate_cache() fonctionne."""
        from core.state import _AppState

        state = _AppState()
        state._db_schema_cache = "cached_schema"

        state.invalidate_cache()

        assert state.db_schema_cache is None


class TestAppStateThreadSafety:
    """Tests de la thread-safety."""

    def test_has_rlock(self) -> None:
        """L'état utilise un RLock pour la thread-safety."""
        import threading

        from core.state import _AppState

        state = _AppState()
        assert isinstance(state._lock, type(threading.RLock()))

    def test_connection_close_on_replace(self) -> None:
        """L'ancienne connexion est fermée lors du remplacement."""
        from core.state import _AppState

        state = _AppState()

        # Première connexion
        old_conn = MagicMock()
        state.db_connection = old_conn

        # Deuxième connexion
        new_conn = MagicMock()
        state.db_connection = new_conn

        # L'ancienne doit être fermée
        old_conn.close.assert_called_once()
