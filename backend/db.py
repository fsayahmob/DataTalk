"""
Connexion SQLite centralisée pour G7 Analytics.

La structure de la base est définie dans schema.sql (source unique de vérité).
Pour initialiser/recréer la base: sqlite3 catalog.sqlite < schema.sql
"""

import sqlite3
from pathlib import Path

CATALOG_PATH = str(Path(__file__).parent / "catalog.sqlite")


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite."""
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn
