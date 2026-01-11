"""
Script pour créer la vue dénormalisée evaluation_categories.
Cette vue "aplatit" les catégories JSON en lignes individuelles pour faciliter les requêtes SQL.
"""
import os

import duckdb

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")

def create_view():
    """Crée la vue evaluation_categories."""
    print(f"Connexion à DuckDB: {DB_PATH}")
    conn = duckdb.connect(DB_PATH, read_only=False)

    # Supprimer la vue si elle existe
    conn.execute("DROP VIEW IF EXISTS evaluation_categories")

    # Créer la vue dénormalisée
    # Chaque ligne = une catégorie pour un commentaire
    conn.execute("""
        CREATE VIEW evaluation_categories AS
        SELECT
            e.num_course,
            e.dat_course,
            e.cod_taxi,
            e.cod_client,
            e.typ_client,
            e.typ_chauffeur,
            e.lib_categorie AS offre_commerciale,
            e.note_eval,
            e.commentaire,
            e.sentiment_global,
            unnest(json_extract_string(e.categories, '$[*]')::VARCHAR[]) AS categorie,
            -- Extraire le sentiment spécifique à cette catégorie si disponible
            COALESCE(
                CAST(json_extract(e.sentiment_par_categorie, '$.' || unnest(json_extract_string(e.categories, '$[*]')::VARCHAR[])) AS FLOAT),
                e.sentiment_global
            ) AS sentiment_categorie,
            e.verbatim_cle
        FROM evaluations e
        WHERE e.categories IS NOT NULL
          AND e.categories != '[]'
          AND e.categories != ''
    """)

    # Vérifier que la vue fonctionne
    count = conn.execute("SELECT COUNT(*) FROM evaluation_categories").fetchone()[0]
    sample = conn.execute("""
        SELECT categorie, COUNT(*) as nb, ROUND(AVG(sentiment_categorie), 2) as sentiment_moyen
        FROM evaluation_categories
        GROUP BY categorie
        ORDER BY nb DESC
        LIMIT 5
    """).fetchall()

    print("Vue créée avec succès!")
    print(f"Nombre de lignes: {count}")
    print("\nTop 5 catégories:")
    for row in sample:
        print(f"  {row[0]}: {row[1]} mentions, sentiment moyen: {row[2]}")

    conn.close()
    print("\nVue evaluation_categories prête!")


if __name__ == "__main__":
    create_view()
