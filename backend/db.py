"""
Connexion SQLite centralisée pour G7 Analytics.

La structure de la base est définie dans schema.sql (source unique de vérité).
Pour initialiser/recréer la base: sqlite3 catalog.sqlite < schema.sql
"""

import logging
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from config import SCHEMA_PATH, SQLITE_PATH
from db_migrations import MigrationError, run_migrations

logger = logging.getLogger(__name__)

# Chemin configuré dans config.py (local: backend/, Docker: /data/)
CATALOG_PATH = str(SQLITE_PATH)


def init_database() -> None:
    """Initialise la base de données avec schema.sql si elle n'existe pas."""
    if Path(CATALOG_PATH).exists():
        return  # Base déjà existante

    if not SCHEMA_PATH.exists():
        return  # Pas de schéma disponible

    conn = sqlite3.connect(CATALOG_PATH)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.commit()
    conn.close()
    logger.info("Database initialized from schema.sql")


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite.

    Active le mode WAL pour permettre les lectures concurrentes
    (API + Worker Celery).
    """
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    # Mode WAL: permet lectures concurrentes (important pour API + Celery)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Context manager pour les connexions SQLite.

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
