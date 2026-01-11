"""
Connexion SQLite centralisée pour G7 Analytics.
Tous les modules importent get_connection() depuis ici.
"""
import os
import sqlite3

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "catalog.sqlite")


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite."""
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn
