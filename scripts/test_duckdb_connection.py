#!/usr/bin/env python3
"""
Script de test de connexion DuckDB.
Vérifie que le fichier g7_analytics.duckdb est accessible et affiche les tables.
"""
import os
import sys
import duckdb

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.catalog_engine import get_duckdb_path


def test_duckdb_connection():
    """Teste la connexion DuckDB et affiche les informations."""
    db_path = get_duckdb_path()

    print("=" * 60)
    print("TEST DE CONNEXION DUCKDB")
    print("=" * 60)
    print(f"\nChemin DuckDB: {db_path}")
    print(f"Fichier existe: {'✓ OUI' if os.path.exists(db_path) else '✗ NON'}")

    if not os.path.exists(db_path):
        print("\n[ERREUR] Le fichier DuckDB n'existe pas.")
        print("Créez-le d'abord avec:")
        print(f"  touch {db_path}")
        print("  # Ou laissez Airbyte le créer automatiquement")
        return False

    try:
        # Connexion
        conn = duckdb.connect(db_path, read_only=True)
        print("\n✓ Connexion établie")

        # Lister les tables
        tables_result = conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
            ORDER BY table_name
        """).fetchall()

        if not tables_result:
            print("\n⚠ Aucune table trouvée")
            print("Le fichier DuckDB est vide. Airbyte doit d'abord synchroniser les données.")
        else:
            print(f"\n✓ {len(tables_result)} table(s) trouvée(s):")
            for (table_name,) in tables_result:
                # Compter les lignes
                row_count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
                print(f"  - {table_name}: {row_count:,} lignes")

        # Version DuckDB
        version = conn.execute("SELECT version()").fetchone()[0]
        print(f"\nVersion DuckDB: {version}")

        conn.close()
        print("\n" + "=" * 60)
        print("TEST RÉUSSI ✓")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n[ERREUR] Échec de la connexion: {e}")
        print("\n" + "=" * 60)
        print("TEST ÉCHOUÉ ✗")
        print("=" * 60)
        return False


if __name__ == "__main__":
    success = test_duckdb_connection()
    sys.exit(0 if success else 1)
