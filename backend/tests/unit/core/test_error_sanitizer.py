"""Tests pour core/error_sanitizer.py - Sanitization des erreurs SQL."""

from unittest.mock import patch

import pytest

from core.error_sanitizer import (
    ERROR_PATTERNS,
    sanitize_error_message,
    sanitize_sql_error,
)


class TestSanitizeSqlError:
    """Tests de sanitize_sql_error."""

    def test_table_not_found_pattern(self) -> None:
        """Détecte 'table X does not exist'."""
        error = Exception("Table users does not exist")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.table_not_found"

    def test_table_not_found_pattern_alt(self) -> None:
        """Détecte 'table X not found'."""
        error = Exception("table evaluations not found in catalog")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.table_not_found"

    def test_column_not_found_pattern(self) -> None:
        """Détecte 'column X not found'."""
        error = Exception("Column 'email' not found")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.column_not_found"

    def test_column_does_not_exist_pattern(self) -> None:
        """Détecte 'column X does not exist'."""
        error = Exception("column xyz does not exist")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.column_not_found"

    def test_catalog_error_pattern(self) -> None:
        """Détecte 'catalog error'."""
        error = Exception("Catalog Error: invalid schema")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.catalog_error"

    def test_parser_error_pattern(self) -> None:
        """Détecte 'parser error'."""
        error = Exception("Parser Error at line 5")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.syntax_error"

    def test_syntax_error_pattern(self) -> None:
        """Détecte 'syntax error'."""
        error = Exception("SQL syntax error near SELECT")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.syntax_error"

    def test_binder_error_pattern(self) -> None:
        """Détecte 'binder error'."""
        error = Exception("Binder Error: column not found")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.binding_error"

    def test_constraint_pattern(self) -> None:
        """Détecte 'constraint'."""
        error = Exception("Constraint violation: UNIQUE")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.constraint_violated"

    def test_permission_denied_pattern(self) -> None:
        """Détecte 'permission denied'."""
        error = Exception("Permission denied for table")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.permission_denied"

    def test_timeout_pattern(self) -> None:
        """Détecte 'timeout'."""
        error = Exception("Query timeout after 30s")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.query_timeout"

    def test_connection_pattern(self) -> None:
        """Détecte 'connection'."""
        error = Exception("Connection refused to database")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.connection_error"

    def test_out_of_memory_pattern(self) -> None:
        """Détecte 'out of memory'."""
        error = Exception("Out of memory during query execution")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.out_of_memory"

    def test_division_by_zero_pattern(self) -> None:
        """Détecte 'division by zero'."""
        error = Exception("Division by zero in expression")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.division_by_zero"

    def test_invalid_input_pattern(self) -> None:
        """Détecte 'invalid input'."""
        error = Exception("Invalid input syntax for type integer")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.invalid_input"

    def test_unknown_error_returns_fallback(self) -> None:
        """Erreur inconnue retourne le fallback générique."""
        error = Exception("Some unknown error message")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.query_error"

    def test_case_insensitive_matching(self) -> None:
        """Le matching est insensible à la casse."""
        error = Exception("TABLE USERS DOES NOT EXIST")
        result = sanitize_sql_error(error, log_full=False)
        assert result == "db.table_not_found"

    def test_logs_full_error_when_enabled(self) -> None:
        """Log l'erreur complète quand log_full=True."""
        error = Exception("Test error")
        with patch("core.error_sanitizer.logger") as mock_logger:
            sanitize_sql_error(error, log_full=True)
            mock_logger.error.assert_called_once()

    def test_no_log_when_disabled(self) -> None:
        """Ne log pas quand log_full=False."""
        error = Exception("Test error")
        with patch("core.error_sanitizer.logger") as mock_logger:
            sanitize_sql_error(error, log_full=False)
            mock_logger.error.assert_not_called()


class TestSanitizeErrorMessage:
    """Tests de sanitize_error_message."""

    def test_removes_file_paths(self) -> None:
        """Supprime les chemins de fichiers."""
        error = Exception("Error in /home/user/project/file.py")
        result = sanitize_error_message(error)
        assert "/home/user/project/file.py" not in result
        assert "[path]" in result

    def test_removes_line_numbers(self) -> None:
        """Supprime les numéros de ligne."""
        error = Exception("Error at line 42")
        result = sanitize_error_message(error)
        assert "line 42" not in result
        assert "[line]" in result

    def test_removes_memory_addresses(self) -> None:
        """Supprime les adresses mémoire."""
        error = Exception("Object at 0x7f3b2c1d4e50")
        result = sanitize_error_message(error)
        assert "0x7f3b2c1d4e50" not in result
        assert "[addr]" in result

    def test_truncates_long_messages(self) -> None:
        """Tronque les messages trop longs."""
        long_message = "x" * 300
        error = Exception(long_message)
        result = sanitize_error_message(error)
        assert len(result) <= 203  # 200 + "..."
        assert result.endswith("...")

    def test_preserves_short_messages(self) -> None:
        """Préserve les messages courts."""
        error = Exception("Short error")
        result = sanitize_error_message(error)
        assert "Short error" in result
        assert not result.endswith("...")

    def test_logs_error_with_context(self) -> None:
        """Log l'erreur avec le contexte fourni."""
        error = Exception("Test error")
        with patch("core.error_sanitizer.logger") as mock_logger:
            sanitize_error_message(error, context="test_operation")
            mock_logger.error.assert_called_once()
            call_args = mock_logger.error.call_args
            assert "test_operation" in str(call_args)

    def test_multiple_patterns_in_same_message(self) -> None:
        """Gère plusieurs patterns dans le même message."""
        error = Exception("Error at /path/file.py line 42 at 0x1234")
        result = sanitize_error_message(error)
        assert "[path]" in result
        assert "[line]" in result
        assert "[addr]" in result


class TestErrorPatterns:
    """Tests de la constante ERROR_PATTERNS."""

    def test_all_patterns_are_valid_regex(self) -> None:
        """Tous les patterns sont des regex valides."""
        import re

        for pattern in ERROR_PATTERNS:
            # Ne doit pas lever d'exception
            re.compile(pattern, re.IGNORECASE)

    def test_all_values_are_i18n_keys(self) -> None:
        """Toutes les valeurs sont des clés i18n valides."""
        for key in ERROR_PATTERNS.values():
            assert key.startswith("db.")
            assert "." in key

    def test_expected_patterns_exist(self) -> None:
        """Les patterns attendus existent."""
        expected_patterns = [
            "table_not_found",
            "column_not_found",
            "syntax_error",
            "query_timeout",
            "connection_error",
        ]
        values = list(ERROR_PATTERNS.values())
        for pattern in expected_patterns:
            assert f"db.{pattern}" in values
