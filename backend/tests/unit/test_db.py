"""Tests pour db.py - Connexion PostgreSQL centralisée."""

import contextlib
from unittest.mock import MagicMock, patch

import psycopg2
import pytest

from db_migrations import MigrationError


class TestGetConnection:
    """Tests de get_connection."""

    def test_returns_psycopg2_connection(self) -> None:
        """Retourne une connexion psycopg2."""
        with patch("db.psycopg2.connect") as mock_connect:
            mock_conn = MagicMock(spec=psycopg2.extensions.connection)
            mock_connect.return_value = mock_conn

            from db import get_connection

            conn = get_connection()
            assert conn == mock_conn
            mock_connect.assert_called_once()


class TestGetDb:
    """Tests de get_db context manager."""

    def test_yields_connection(self) -> None:
        """Yield une connexion."""
        mock_conn = MagicMock(spec=psycopg2.extensions.connection)

        with patch("db.get_connection", return_value=mock_conn):
            from db import get_db

            with get_db() as conn:
                assert conn == mock_conn

    def test_commits_on_success(self) -> None:
        """Commit automatique en cas de succès."""
        mock_conn = MagicMock(spec=psycopg2.extensions.connection)

        with patch("db.get_connection", return_value=mock_conn):
            from db import get_db

            with get_db():
                pass

            mock_conn.commit.assert_called_once()
            mock_conn.close.assert_called_once()

    def test_rollback_on_exception(self) -> None:
        """Rollback en cas d'exception."""
        mock_conn = MagicMock(spec=psycopg2.extensions.connection)

        with patch("db.get_connection", return_value=mock_conn):
            from db import get_db

            with pytest.raises(ValueError, match="Test error"), get_db():
                raise ValueError("Test error")

            mock_conn.rollback.assert_called_once()
            mock_conn.close.assert_called_once()

    def test_closes_connection_always(self) -> None:
        """Ferme toujours la connexion."""
        mock_conn = MagicMock(spec=psycopg2.extensions.connection)

        with patch("db.get_connection", return_value=mock_conn):
            from db import get_db

            # Normal exit
            with get_db():
                pass
            assert mock_conn.close.called

            # Exception exit
            mock_conn.reset_mock()
            try:
                with get_db():
                    raise Exception("test")
            except Exception:
                pass
            assert mock_conn.close.called


class TestDictRow:
    """Tests de DictRow wrapper."""

    def test_access_by_key(self) -> None:
        """Accès par clé."""
        from db import DictRow

        mock_cursor = MagicMock()
        mock_cursor.description = [MagicMock(name="id"), MagicMock(name="name")]
        mock_cursor.description[0].name = "id"
        mock_cursor.description[1].name = "name"

        row = DictRow(mock_cursor, (1, "test"))
        assert row["id"] == 1
        assert row["name"] == "test"

    def test_access_by_index(self) -> None:
        """Accès par index."""
        from db import DictRow

        mock_cursor = MagicMock()
        mock_cursor.description = [MagicMock(name="id"), MagicMock(name="name")]
        mock_cursor.description[0].name = "id"
        mock_cursor.description[1].name = "name"

        row = DictRow(mock_cursor, (1, "test"))
        assert row[0] == 1
        assert row[1] == "test"

    def test_keys_method(self) -> None:
        """Méthode keys()."""
        from db import DictRow

        mock_cursor = MagicMock()
        mock_cursor.description = [MagicMock(name="id"), MagicMock(name="name")]
        mock_cursor.description[0].name = "id"
        mock_cursor.description[1].name = "name"

        row = DictRow(mock_cursor, (1, "test"))
        assert row.keys() == ["id", "name"]

    def test_get_method(self) -> None:
        """Méthode get() avec default."""
        from db import DictRow

        mock_cursor = MagicMock()
        mock_cursor.description = [MagicMock(name="id")]
        mock_cursor.description[0].name = "id"

        row = DictRow(mock_cursor, (1,))
        assert row.get("id") == 1
        assert row.get("missing", "default") == "default"


class TestRunMigrationsSafe:
    """Tests de _run_migrations_safe."""

    def test_runs_migrations(self) -> None:
        """Exécute les migrations."""
        mock_conn = MagicMock()

        with (
            patch("db.get_connection", return_value=mock_conn),
            patch("db.run_migrations", return_value=2) as mock_run,
        ):
            from db import _run_migrations_safe

            _run_migrations_safe()

            mock_run.assert_called_once_with(mock_conn)

    def test_logs_applied_count(self) -> None:
        """Log le nombre de migrations appliquées."""
        mock_conn = MagicMock()

        with (
            patch("db.get_connection", return_value=mock_conn),
            patch("db.run_migrations", return_value=3),
            patch("db.logger") as mock_logger,
        ):
            from db import _run_migrations_safe

            _run_migrations_safe()

            mock_logger.info.assert_called()

    def test_raises_on_migration_error(self) -> None:
        """Propage MigrationError."""
        mock_conn = MagicMock()

        with (
            patch("db.get_connection", return_value=mock_conn),
            patch("db.run_migrations", side_effect=MigrationError("test")),
        ):
            from db import _run_migrations_safe

            with pytest.raises(MigrationError):
                _run_migrations_safe()

    def test_closes_connection_on_success(self) -> None:
        """Ferme la connexion en cas de succès."""
        mock_conn = MagicMock()

        with (
            patch("db.get_connection", return_value=mock_conn),
            patch("db.run_migrations", return_value=0),
        ):
            from db import _run_migrations_safe

            _run_migrations_safe()

            mock_conn.close.assert_called_once()

    def test_closes_connection_on_error(self) -> None:
        """Ferme la connexion même en cas d'erreur."""
        mock_conn = MagicMock()

        with (
            patch("db.get_connection", return_value=mock_conn),
            patch("db.run_migrations", side_effect=MigrationError("test")),
        ):
            from db import _run_migrations_safe

            with contextlib.suppress(MigrationError):
                _run_migrations_safe()

            mock_conn.close.assert_called_once()
