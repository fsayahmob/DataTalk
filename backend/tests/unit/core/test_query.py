"""Tests pour core/query.py - Exécution de requêtes SQL."""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from fastapi import HTTPException

from core.query import (
    DEFAULT_MAX_CHART_ROWS,
    DEFAULT_QUERY_TIMEOUT_MS,
    QueryTimeoutError,
    build_filter_context,
    execute_query,
    should_disable_chart,
)


class TestExecuteQuery:
    """Tests de execute_query."""

    def test_raises_when_no_connection(self) -> None:
        """Lève HTTPException quand pas de connexion."""
        with patch("core.query.app_state") as mock_state:
            mock_state.db_connection = None
            with pytest.raises(HTTPException) as exc_info:
                execute_query("SELECT 1")
            assert exc_info.value.status_code == 500

    def test_executes_query_and_returns_data(self) -> None:
        """Exécute la requête et retourne les données."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"col1": [1, 2], "col2": ["a", "b"]}
        )

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value=None),
        ):
            mock_state.db_connection = mock_conn

            result = execute_query("SELECT * FROM test")

            assert len(result) == 2
            assert result[0]["col1"] == 1
            assert result[1]["col2"] == "b"

    def test_reads_timeout_from_settings(self) -> None:
        """Lit le timeout depuis les settings (mais ne l'applique pas - DuckDB ne supporte pas)."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchdf.return_value = pd.DataFrame()

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value="5000") as mock_setting,
        ):
            mock_state.db_connection = mock_conn

            execute_query("SELECT 1")

            # Vérifie que get_setting est appelé pour query_timeout_ms
            mock_setting.assert_called_with("query_timeout_ms")

    def test_uses_default_timeout_when_no_setting(self) -> None:
        """Utilise le timeout par défaut quand pas de setting."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchdf.return_value = pd.DataFrame()

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value=None) as mock_setting,
        ):
            mock_state.db_connection = mock_conn

            execute_query("SELECT 1")

            # get_setting est appelé pour récupérer query_timeout_ms
            mock_setting.assert_called_with("query_timeout_ms")

    def test_raises_timeout_error_on_cancelled(self) -> None:
        """Lève QueryTimeoutError sur requête annulée."""
        mock_conn = MagicMock()
        mock_conn.execute.side_effect = Exception("Query was cancelled")

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value=None),
        ):
            mock_state.db_connection = mock_conn

            with pytest.raises(QueryTimeoutError):
                execute_query("SELECT 1")

    def test_raises_timeout_error_on_interrupt(self) -> None:
        """Lève QueryTimeoutError sur interrupt."""
        mock_conn = MagicMock()
        mock_conn.execute.side_effect = Exception("Query was interrupted")

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value=None),
        ):
            mock_state.db_connection = mock_conn

            with pytest.raises(QueryTimeoutError):
                execute_query("SELECT 1")

    def test_propagates_other_exceptions(self) -> None:
        """Propage les autres exceptions."""
        mock_conn = MagicMock()
        mock_conn.execute.side_effect = Exception("Some other error")

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value=None),
        ):
            mock_state.db_connection = mock_conn

            with pytest.raises(Exception, match="Some other error"):
                execute_query("SELECT 1")

    def test_custom_timeout_parameter_skips_setting(self) -> None:
        """Utilise le timeout passé en paramètre au lieu des settings."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchdf.return_value = pd.DataFrame()

        with (
            patch("core.query.app_state") as mock_state,
            patch("core.query.get_setting", return_value="30000") as mock_setting,
        ):
            mock_state.db_connection = mock_conn

            execute_query("SELECT 1", timeout_ms=1000)

            # get_setting ne doit PAS être appelé car timeout_ms est passé
            mock_setting.assert_not_called()


class TestBuildFilterContext:
    """Tests de build_filter_context."""

    def test_returns_empty_when_no_filters(self) -> None:
        """Retourne chaîne vide sans filtres."""
        result = build_filter_context(None)
        assert result == ""

    def test_returns_empty_when_no_constraints(self) -> None:
        """Retourne chaîne vide sans contraintes."""

        class EmptyFilters:
            date_start = None
            date_end = None
            note_min = None
            note_max = None

        result = build_filter_context(EmptyFilters())
        assert result == ""

    def test_includes_date_start(self) -> None:
        """Inclut la date de début."""

        class Filters:
            date_start = "2024-01-01"
            date_end = None
            note_min = None
            note_max = None

        result = build_filter_context(Filters())
        assert "dat_course >= '2024-01-01'" in result

    def test_includes_date_end(self) -> None:
        """Inclut la date de fin."""

        class Filters:
            date_start = None
            date_end = "2024-12-31"
            note_min = None
            note_max = None

        result = build_filter_context(Filters())
        assert "dat_course <= '2024-12-31'" in result

    def test_includes_note_min(self) -> None:
        """Inclut la note minimum."""

        class Filters:
            date_start = None
            date_end = None
            note_min = 3
            note_max = None

        result = build_filter_context(Filters())
        assert "note_eval >= 3" in result

    def test_includes_note_max(self) -> None:
        """Inclut la note maximum."""

        class Filters:
            date_start = None
            date_end = None
            note_min = None
            note_max = 5

        result = build_filter_context(Filters())
        assert "note_eval <= 5" in result

    def test_combines_multiple_filters(self) -> None:
        """Combine plusieurs filtres avec AND."""

        class Filters:
            date_start = "2024-01-01"
            date_end = "2024-12-31"
            note_min = 3
            note_max = 5

        result = build_filter_context(Filters())
        assert "AND" in result
        assert "dat_course >= '2024-01-01'" in result
        assert "dat_course <= '2024-12-31'" in result
        assert "note_eval >= 3" in result
        assert "note_eval <= 5" in result


class TestShouldDisableChart:
    """Tests de should_disable_chart."""

    def test_returns_false_when_no_chart_type(self) -> None:
        """Retourne False quand pas de type de graphique."""
        with patch("core.query.get_setting", return_value=None):
            disabled, reason = should_disable_chart(10000, None)
        assert disabled is False
        assert reason is None

    def test_returns_false_for_none_chart_type(self) -> None:
        """Retourne False pour chart_type='none'."""
        with patch("core.query.get_setting", return_value=None):
            disabled, reason = should_disable_chart(10000, "none")
        assert disabled is False
        assert reason is None

    def test_returns_false_when_under_limit(self) -> None:
        """Retourne False quand sous la limite."""
        with patch("core.query.get_setting", return_value="5000"):
            disabled, reason = should_disable_chart(1000, "bar")
        assert disabled is False
        assert reason is None

    def test_returns_false_at_exact_limit(self) -> None:
        """Retourne False à la limite exacte."""
        with patch("core.query.get_setting", return_value="5000"):
            disabled, reason = should_disable_chart(5000, "line")
        assert disabled is False
        assert reason is None

    def test_returns_true_when_over_limit(self) -> None:
        """Retourne True quand au-dessus de la limite."""
        with patch("core.query.get_setting", return_value="5000"):
            disabled, reason = should_disable_chart(10000, "bar")
        assert disabled is True
        assert reason is not None

    def test_uses_default_limit_when_no_setting(self) -> None:
        """Utilise la limite par défaut sans setting."""
        with patch("core.query.get_setting", return_value=None):
            disabled, _ = should_disable_chart(DEFAULT_MAX_CHART_ROWS + 1, "bar")
        assert disabled is True

    def test_reason_includes_row_count(self) -> None:
        """La raison inclut le nombre de lignes."""
        with patch("core.query.get_setting", return_value="1000"):
            _, reason = should_disable_chart(5000, "bar")
        assert "5,000" in reason or "5000" in reason


class TestQueryTimeoutError:
    """Tests de QueryTimeoutError."""

    def test_is_exception(self) -> None:
        """Est une Exception."""
        assert issubclass(QueryTimeoutError, Exception)

    def test_can_be_raised(self) -> None:
        """Peut être levée."""
        with pytest.raises(QueryTimeoutError):
            raise QueryTimeoutError("timeout")


class TestConstants:
    """Tests des constantes."""

    def test_default_max_chart_rows(self) -> None:
        """Valeur par défaut raisonnable pour max_chart_rows."""
        assert DEFAULT_MAX_CHART_ROWS == 5000

    def test_default_query_timeout(self) -> None:
        """Valeur par défaut raisonnable pour le timeout."""
        assert DEFAULT_QUERY_TIMEOUT_MS == 30000  # 30 secondes
