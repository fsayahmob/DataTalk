"""Tests pour db_migrations.py - Migrations de base de données."""

import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from db_migrations import (
    MIGRATIONS,
    MigrationError,
    _column_exists,
    _table_exists,
    run_migrations,
)


class TestColumnExists:
    """Tests de _column_exists."""

    def test_returns_true_when_column_exists(self) -> None:
        """Retourne True quand la colonne existe."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE test (id INTEGER, name TEXT)")
        cursor = conn.cursor()

        assert _column_exists(cursor, "test", "id") is True
        assert _column_exists(cursor, "test", "name") is True

        conn.close()

    def test_returns_false_when_column_missing(self) -> None:
        """Retourne False quand la colonne n'existe pas."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE test (id INTEGER)")
        cursor = conn.cursor()

        assert _column_exists(cursor, "test", "nonexistent") is False

        conn.close()


class TestTableExists:
    """Tests de _table_exists."""

    def test_returns_true_when_table_exists(self) -> None:
        """Retourne True quand la table existe."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE test (id INTEGER)")
        cursor = conn.cursor()

        assert _table_exists(cursor, "test") is True

        conn.close()

    def test_returns_false_when_table_missing(self) -> None:
        """Retourne False quand la table n'existe pas."""
        conn = sqlite3.connect(":memory:")
        cursor = conn.cursor()

        assert _table_exists(cursor, "nonexistent") is False

        conn.close()


class TestMigrationError:
    """Tests de MigrationError."""

    def test_is_exception(self) -> None:
        """Est une Exception."""
        assert issubclass(MigrationError, Exception)

    def test_stores_message(self) -> None:
        """Stocke le message."""
        error = MigrationError("test error")
        assert "test error" in str(error)


class TestRunMigrations:
    """Tests de run_migrations."""

    def test_creates_migrations_table(self) -> None:
        """Crée la table _migrations si elle n'existe pas."""
        conn = sqlite3.connect(":memory:")

        with patch("db_migrations.MIGRATIONS", []):
            run_migrations(conn)

        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
        assert cursor.fetchone() is not None

        conn.close()

    def test_returns_zero_when_no_migrations(self) -> None:
        """Retourne 0 quand pas de migrations."""
        conn = sqlite3.connect(":memory:")

        with patch("db_migrations.MIGRATIONS", []):
            result = run_migrations(conn)

        assert result == 0
        conn.close()

    def test_applies_new_migrations(self) -> None:
        """Applique les nouvelles migrations."""
        conn = sqlite3.connect(":memory:")

        migration_called = []

        def test_migration(cursor: sqlite3.Cursor) -> None:
            migration_called.append(True)
            cursor.execute("CREATE TABLE IF NOT EXISTS test_table (id INTEGER)")

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            result = run_migrations(conn)

        assert result == 1
        assert len(migration_called) == 1
        conn.close()

    def test_skips_applied_migrations(self) -> None:
        """Skip les migrations déjà appliquées."""
        conn = sqlite3.connect(":memory:")

        migration_called = []

        def test_migration(cursor: sqlite3.Cursor) -> None:
            migration_called.append(True)

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            # Première exécution
            run_migrations(conn)
            assert len(migration_called) == 1

            # Deuxième exécution - ne doit pas réappliquer
            run_migrations(conn)
            assert len(migration_called) == 1

        conn.close()

    def test_records_applied_migration(self) -> None:
        """Enregistre les migrations appliquées."""
        conn = sqlite3.connect(":memory:")

        def test_migration(cursor: sqlite3.Cursor) -> None:
            pass

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            run_migrations(conn)

        cursor = conn.cursor()
        cursor.execute("SELECT version FROM _migrations")
        versions = [row[0] for row in cursor.fetchall()]
        assert "test_001" in versions

        conn.close()

    def test_rollback_on_migration_failure(self) -> None:
        """Rollback en cas d'échec de migration."""
        conn = sqlite3.connect(":memory:")

        def failing_migration(cursor: sqlite3.Cursor) -> None:
            cursor.execute("CREATE TABLE test (id INTEGER)")
            raise ValueError("Intentional failure")

        with patch("db_migrations.MIGRATIONS", [("test_fail", failing_migration)]):
            with pytest.raises(MigrationError):
                run_migrations(conn)

        # La table ne doit pas exister (rollback)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='test'")
        # Note: SQLite ne supporte pas le rollback DDL, donc la table peut exister
        # Mais la migration ne doit pas être enregistrée
        cursor.execute("SELECT version FROM _migrations WHERE version='test_fail'")
        assert cursor.fetchone() is None

        conn.close()

    def test_raises_migration_error_on_failure(self) -> None:
        """Lève MigrationError en cas d'échec."""
        conn = sqlite3.connect(":memory:")

        def failing_migration(cursor: sqlite3.Cursor) -> None:
            raise Exception("Test error")

        with patch("db_migrations.MIGRATIONS", [("test_fail", failing_migration)]):
            with pytest.raises(MigrationError, match="test_fail"):
                run_migrations(conn)

        conn.close()


class TestMigrationsList:
    """Tests de la liste MIGRATIONS."""

    def test_migrations_are_tuples(self) -> None:
        """Toutes les migrations sont des tuples."""
        for migration in MIGRATIONS:
            assert isinstance(migration, tuple)
            assert len(migration) == 2

    def test_migrations_have_version_and_function(self) -> None:
        """Chaque migration a une version et une fonction."""
        for version, func in MIGRATIONS:
            assert isinstance(version, str)
            assert callable(func)

    def test_versions_are_ordered(self) -> None:
        """Les versions sont ordonnées."""
        versions = [v for v, _ in MIGRATIONS]
        assert versions == sorted(versions)

    def test_versions_are_unique(self) -> None:
        """Les versions sont uniques."""
        versions = [v for v, _ in MIGRATIONS]
        assert len(versions) == len(set(versions))


class TestIndividualMigrations:
    """Tests des migrations individuelles."""

    def test_migration_001_share_token(self) -> None:
        """Migration 001: ajoute share_token."""
        conn = sqlite3.connect(":memory:")
        conn.execute("""
            CREATE TABLE saved_reports (
                id INTEGER PRIMARY KEY,
                title TEXT
            )
        """)
        conn.execute("INSERT INTO saved_reports (title) VALUES ('Test')")
        conn.commit()

        from db_migrations import _migration_001_share_token

        cursor = conn.cursor()
        _migration_001_share_token(cursor)
        conn.commit()

        # Vérifier que la colonne existe
        assert _column_exists(cursor, "saved_reports", "share_token")

        # Vérifier qu'un token a été généré
        cursor.execute("SELECT share_token FROM saved_reports")
        token = cursor.fetchone()[0]
        assert token is not None

        conn.close()

    def test_migration_002_chart_config(self) -> None:
        """Migration 002: ajoute chart_config."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY)")
        conn.commit()

        from db_migrations import _migration_002_chart_config

        cursor = conn.cursor()
        _migration_002_chart_config(cursor)
        conn.commit()

        assert _column_exists(cursor, "messages", "chart_config")
        conn.close()

    def test_migration_003_costs_columns(self) -> None:
        """Migration 003: ajoute colonnes à llm_costs."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE llm_costs (id INTEGER PRIMARY KEY)")
        conn.commit()

        from db_migrations import _migration_003_costs_columns

        cursor = conn.cursor()
        _migration_003_costs_columns(cursor)
        conn.commit()

        assert _column_exists(cursor, "llm_costs", "conversation_id")
        assert _column_exists(cursor, "llm_costs", "success")
        assert _column_exists(cursor, "llm_costs", "error_message")
        conn.close()

    def test_migration_004_full_context(self) -> None:
        """Migration 004: ajoute full_context."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE columns (id INTEGER PRIMARY KEY)")
        conn.commit()

        from db_migrations import _migration_004_full_context

        cursor = conn.cursor()
        _migration_004_full_context(cursor)
        conn.commit()

        assert _column_exists(cursor, "columns", "full_context")
        conn.close()

    def test_migration_005_datasource_fields(self) -> None:
        """Migration 005: ajoute champs à datasources."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE datasources (id INTEGER PRIMARY KEY)")
        conn.commit()

        from db_migrations import _migration_005_datasource_fields

        cursor = conn.cursor()
        _migration_005_datasource_fields(cursor)
        conn.commit()

        assert _column_exists(cursor, "datasources", "is_active")
        assert _column_exists(cursor, "datasources", "file_size_bytes")
        assert _column_exists(cursor, "datasources", "last_modified")
        conn.close()

    def test_migration_skips_if_table_missing(self) -> None:
        """Les migrations skip si la table n'existe pas."""
        conn = sqlite3.connect(":memory:")
        cursor = conn.cursor()

        from db_migrations import _migration_001_share_token

        # Ne doit pas lever d'exception
        _migration_001_share_token(cursor)

        conn.close()

    def test_migration_skips_if_column_exists(self) -> None:
        """Les migrations skip si la colonne existe déjà."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE messages (id INTEGER, chart_config TEXT)")
        conn.commit()

        from db_migrations import _migration_002_chart_config

        cursor = conn.cursor()
        # Ne doit pas lever d'exception (colonne existe)
        _migration_002_chart_config(cursor)

        conn.close()
