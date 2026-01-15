"""
Connexion SQLite centralisée pour G7 Analytics.

La structure de la base est définie dans schema.sql (source unique de vérité).
Pour initialiser/recréer la base: sqlite3 catalog.sqlite < schema.sql
"""

import sqlite3
import uuid
from pathlib import Path

CATALOG_PATH = str(Path(__file__).parent / "catalog.sqlite")


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite."""
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def run_migrations() -> None:
    """Exécute les migrations de schéma si nécessaire."""
    conn = get_connection()
    cursor = conn.cursor()

    # Migration: Ajouter share_token à saved_reports si absente
    cursor.execute("PRAGMA table_info(saved_reports)")
    columns = [col[1] for col in cursor.fetchall()]

    if "share_token" not in columns:
        # SQLite ne permet pas ADD COLUMN avec UNIQUE, on ajoute sans contrainte
        cursor.execute("ALTER TABLE saved_reports ADD COLUMN share_token TEXT")
        # Créer un index unique séparé
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_share_token ON saved_reports(share_token)"
        )
        # Générer des tokens pour les rapports existants
        cursor.execute("SELECT id FROM saved_reports WHERE share_token IS NULL")
        for row in cursor.fetchall():
            cursor.execute(
                "UPDATE saved_reports SET share_token = ? WHERE id = ?",
                (str(uuid.uuid4()), row[0]),
            )
        conn.commit()

    conn.close()


# Exécuter les migrations au chargement du module
run_migrations()
