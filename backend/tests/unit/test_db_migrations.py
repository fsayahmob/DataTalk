"""Tests pour db_migrations.py - Migrations de base de données PostgreSQL."""

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
        cursor = MagicMock()
        cursor.fetchone.return_value = (1,)

        result = _column_exists(cursor, "test", "id")

        assert result is True
        cursor.execute.assert_called_once()
        assert "information_schema.columns" in cursor.execute.call_args[0][0]

    def test_returns_false_when_column_missing(self) -> None:
        """Retourne False quand la colonne n'existe pas."""
        cursor = MagicMock()
        cursor.fetchone.return_value = None

        result = _column_exists(cursor, "test", "nonexistent")

        assert result is False


class TestTableExists:
    """Tests de _table_exists."""

    def test_returns_true_when_table_exists(self) -> None:
        """Retourne True quand la table existe."""
        cursor = MagicMock()
        cursor.fetchone.return_value = (1,)

        result = _table_exists(cursor, "test")

        assert result is True
        cursor.execute.assert_called_once()
        assert "information_schema.tables" in cursor.execute.call_args[0][0]

    def test_returns_false_when_table_missing(self) -> None:
        """Retourne False quand la table n'existe pas."""
        cursor = MagicMock()
        cursor.fetchone.return_value = None

        result = _table_exists(cursor, "nonexistent")

        assert result is False


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
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []

        with patch("db_migrations.MIGRATIONS", []):
            run_migrations(conn)

        # Vérifie que CREATE TABLE _migrations est appelé
        create_calls = [c for c in cursor.execute.call_args_list if "CREATE TABLE" in str(c)]
        assert len(create_calls) > 0
        assert "_migrations" in str(create_calls[0])

    def test_returns_zero_when_no_migrations(self) -> None:
        """Retourne 0 quand pas de migrations."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []

        with patch("db_migrations.MIGRATIONS", []):
            result = run_migrations(conn)

        assert result == 0

    def test_applies_new_migrations(self) -> None:
        """Applique les nouvelles migrations."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []  # Pas de migrations appliquées

        migration_called = []

        def test_migration(c: MagicMock) -> None:
            migration_called.append(True)

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            result = run_migrations(conn)

        assert result == 1
        assert len(migration_called) == 1
        conn.commit.assert_called()

    def test_skips_applied_migrations(self) -> None:
        """Skip les migrations déjà appliquées."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = [("test_001",)]  # Déjà appliquée

        migration_called = []

        def test_migration(c: MagicMock) -> None:
            migration_called.append(True)

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            result = run_migrations(conn)

        assert result == 0
        assert len(migration_called) == 0

    def test_records_applied_migration(self) -> None:
        """Enregistre les migrations appliquées."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []

        def test_migration(c: MagicMock) -> None:
            pass

        with patch("db_migrations.MIGRATIONS", [("test_001", test_migration)]):
            run_migrations(conn)

        # Vérifier que INSERT INTO _migrations est appelé
        insert_calls = [c for c in cursor.execute.call_args_list if "INSERT INTO _migrations" in str(c)]
        assert len(insert_calls) == 1
        assert "test_001" in str(insert_calls[0])

    def test_rollback_on_migration_failure(self) -> None:
        """Rollback en cas d'échec de migration."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []

        def failing_migration(c: MagicMock) -> None:
            raise ValueError("Intentional failure")

        with patch("db_migrations.MIGRATIONS", [("test_fail", failing_migration)]):
            with pytest.raises(MigrationError):
                run_migrations(conn)

        conn.rollback.assert_called()

    def test_raises_migration_error_on_failure(self) -> None:
        """Lève MigrationError en cas d'échec."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchall.return_value = []

        def failing_migration(c: MagicMock) -> None:
            raise Exception("Test error")

        with patch("db_migrations.MIGRATIONS", [("test_fail", failing_migration)]):
            with pytest.raises(MigrationError, match="test_fail"):
                run_migrations(conn)


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
        from db_migrations import _migration_001_share_token

        cursor = MagicMock()

        # Mock _table_exists et _column_exists
        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=False),
        ):
            cursor.fetchall.return_value = [(1,), (2,)]  # IDs des rapports existants
            _migration_001_share_token(cursor)

        # Vérifier ALTER TABLE
        alter_calls = [c for c in cursor.execute.call_args_list if "ALTER TABLE" in str(c)]
        assert len(alter_calls) >= 1

    def test_migration_002_chart_config(self) -> None:
        """Migration 002: ajoute chart_config."""
        from db_migrations import _migration_002_chart_config

        cursor = MagicMock()

        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=False),
        ):
            _migration_002_chart_config(cursor)

        alter_calls = [c for c in cursor.execute.call_args_list if "chart_config" in str(c)]
        assert len(alter_calls) >= 1

    def test_migration_003_costs_columns(self) -> None:
        """Migration 003: ajoute colonnes à llm_costs."""
        from db_migrations import _migration_003_costs_columns

        cursor = MagicMock()

        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=False),
        ):
            _migration_003_costs_columns(cursor)

        # 3 colonnes à ajouter
        alter_calls = [c for c in cursor.execute.call_args_list if "ALTER TABLE" in str(c)]
        assert len(alter_calls) == 3

    def test_migration_004_full_context(self) -> None:
        """Migration 004: ajoute full_context."""
        from db_migrations import _migration_004_full_context

        cursor = MagicMock()

        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=False),
        ):
            _migration_004_full_context(cursor)

        alter_calls = [c for c in cursor.execute.call_args_list if "full_context" in str(c)]
        assert len(alter_calls) >= 1

    def test_migration_005_datasource_fields(self) -> None:
        """Migration 005: ajoute champs à datasources."""
        from db_migrations import _migration_005_datasource_fields

        cursor = MagicMock()

        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=False),
        ):
            _migration_005_datasource_fields(cursor)

        # 3 colonnes à ajouter
        alter_calls = [c for c in cursor.execute.call_args_list if "ALTER TABLE" in str(c)]
        assert len(alter_calls) == 3

    def test_migration_skips_if_table_missing(self) -> None:
        """Les migrations skip si la table n'existe pas."""
        from db_migrations import _migration_001_share_token

        cursor = MagicMock()

        with patch("db_migrations._table_exists", return_value=False):
            _migration_001_share_token(cursor)

        # Pas d'ALTER TABLE
        alter_calls = [c for c in cursor.execute.call_args_list if "ALTER TABLE" in str(c)]
        assert len(alter_calls) == 0

    def test_migration_skips_if_column_exists(self) -> None:
        """Les migrations skip si la colonne existe déjà."""
        from db_migrations import _migration_002_chart_config

        cursor = MagicMock()

        with (
            patch("db_migrations._table_exists", return_value=True),
            patch("db_migrations._column_exists", return_value=True),  # Colonne existe
        ):
            _migration_002_chart_config(cursor)

        # Pas d'ALTER TABLE
        alter_calls = [c for c in cursor.execute.call_args_list if "ALTER TABLE" in str(c)]
        assert len(alter_calls) == 0
