"""
Connexion PostgreSQL centralisée pour DataTalk.

La structure de la base est définie dans schema.sql (source unique de vérité).
PostgreSQL remplace SQLite pour résoudre les problèmes de concurrence
(API + Worker Celery écrivant simultanément).
"""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import psycopg2

from config import DATABASE_URL, SCHEMA_PATH
from db_migrations import MigrationError, run_migrations

logger = logging.getLogger(__name__)


def init_database() -> None:
    """Initialise la base de données avec schema.sql si les tables n'existent pas."""
    if not SCHEMA_PATH.exists():
        logger.warning("schema.sql not found, skipping database initialization")
        return

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    # Vérifier si les tables existent déjà
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'conversations'
        )
    """)
    tables_exist = cursor.fetchone()[0]

    if not tables_exist:
        # Exécuter le schéma complet
        cursor.execute(SCHEMA_PATH.read_text())
        logger.info("Database initialized from schema.sql")

    cursor.close()
    conn.close()


class DictRow:
    """Wrapper pour simuler le comportement de sqlite3.Row avec PostgreSQL.

    Permet l'accès par clé (row['column']) et par index (row[0]).
    """

    def __init__(self, cursor: Any, row: tuple[Any, ...]) -> None:
        self._keys = [col.name for col in cursor.description]
        self._data = dict(zip(self._keys, row))
        self._values = list(row)

    def __getitem__(self, key: str | int) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def __iter__(self) -> Generator[str, None, None]:
        yield from self._keys

    def keys(self) -> list[str]:
        return self._keys

    def values(self) -> list[Any]:
        return self._values

    def items(self) -> list[tuple[str, Any]]:
        return list(self._data.items())

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)


def get_connection() -> psycopg2.extensions.connection:
    """Retourne une connexion au catalogue PostgreSQL.

    PostgreSQL gère nativement la concurrence via MVCC.
    Pas besoin de WAL ou busy_timeout comme avec SQLite.
    """
    conn = psycopg2.connect(DATABASE_URL)
    return conn


@contextmanager
def get_db() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Context manager pour les connexions PostgreSQL.

    Gère automatiquement le commit/rollback et la fermeture de connexion.

    Usage:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ...")
            # commit automatique si pas d'exception
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _run_migrations_safe() -> None:
    """Exécute les migrations de manière sécurisée."""
    conn = get_connection()
    try:
        applied = run_migrations(conn)
        if applied > 0:
            logger.info("Applied %d migration(s)", applied)
    except MigrationError:
        logger.critical("Database migration failed!")
        raise
    finally:
        conn.close()


# Initialiser la base et exécuter les migrations au chargement du module
init_database()
_run_migrations_safe()
