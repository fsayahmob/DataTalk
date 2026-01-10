"""
Agent de synchronisation du catalogue.
Détecte les changements dans DuckDB et met à jour le catalogue SQLite.
Peut être appelé manuellement ou via un cron/scheduler.
"""
import json
import os

import duckdb
import google.generativeai as genai
from catalog import (
    add_column,
    add_datasource,
    add_synonym,
    add_table,
    get_connection,
    get_schema_for_llm,
    init_catalog,
)
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def get_duckdb_schema() -> list[dict]:
    """Récupère le schéma actuel de DuckDB."""
    conn = duckdb.connect(DB_PATH, read_only=True)

    # Lister toutes les tables
    tables = conn.execute("SHOW TABLES").fetchall()

    schema = []
    for (table_name,) in tables:
        # Récupérer les colonnes
        columns = conn.execute(f"DESCRIBE {table_name}").fetchall()

        # Récupérer le nombre de lignes
        row_count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

        table_info = {
            "name": table_name,
            "row_count": row_count,
            "columns": []
        }

        for col in columns:
            col_name = col[0]
            col_type = col[1]

            # Récupérer quelques valeurs d'exemple (pour les colonnes catégorielles)
            sample_values = None
            try:
                if "VARCHAR" in col_type or "TEXT" in col_type:
                    samples = conn.execute(f"""
                        SELECT DISTINCT {col_name}
                        FROM {table_name}
                        WHERE {col_name} IS NOT NULL
                        LIMIT 5
                    """).fetchall()
                    if samples:
                        sample_values = ", ".join([str(s[0])[:30] for s in samples])
            except Exception:
                continue  # Skip columns that can't be sampled

            table_info["columns"].append({
                "name": col_name,
                "type": col_type,
                "sample_values": sample_values
            })

        schema.append(table_info)

    conn.close()
    return schema


def generate_descriptions_with_llm(schema: list[dict]) -> list[dict]:
    """
    Utilise Gemini pour générer des descriptions métier intelligentes
    basées sur les noms de colonnes et les valeurs d'exemple.
    """
    if not GEMINI_API_KEY:
        print("GEMINI_API_KEY non définie, descriptions génériques utilisées")
        return schema

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config={
            "temperature": 0.3,
            "response_mime_type": "application/json"
        }
    )

    prompt = f"""Tu es un expert en modélisation de données. Analyse ce schéma de base de données et génère des descriptions métier claires en français pour chaque table et colonne.

Schéma à analyser:
{json.dumps(schema, indent=2, ensure_ascii=False)}

Réponds en JSON avec cette structure:
{{
  "tables": [
    {{
      "name": "nom_table",
      "description": "Description métier de la table",
      "columns": [
        {{
          "name": "nom_colonne",
          "description": "Description métier de la colonne",
          "synonyms": ["terme1", "terme2"],  // Mots que les utilisateurs pourraient utiliser
          "value_range": "1-5" // Si applicable (notes, scores, etc.)
        }}
      ]
    }}
  ]
}}

Sois concis mais précis. Les descriptions doivent aider un utilisateur non-technique à comprendre les données."""

    try:
        response = model.generate_content(prompt)
        return json.loads(response.text)["tables"]
    except Exception as e:
        print(f"Erreur LLM: {e}")
        return schema


def sync_catalog(use_llm: bool = True):
    """
    Synchronise le catalogue SQLite avec le schéma DuckDB actuel.

    Args:
        use_llm: Si True, utilise Gemini pour générer des descriptions intelligentes
    """
    print("Synchronisation du catalogue...")

    # 1. Initialiser le catalogue si nécessaire
    init_catalog()

    # 2. Récupérer le schéma DuckDB
    print("Lecture du schéma DuckDB...")
    duckdb_schema = get_duckdb_schema()

    # 3. Optionnel: Générer des descriptions avec LLM
    if use_llm:
        print("Génération des descriptions avec Gemini...")
        enriched_schema = generate_descriptions_with_llm(duckdb_schema)
    else:
        enriched_schema = duckdb_schema

    # 4. Mettre à jour le catalogue
    print("Mise à jour du catalogue SQLite...")

    # Ajouter/mettre à jour la datasource
    ds_id = add_datasource(
        name="g7_analytics",
        type="duckdb",
        path=DB_PATH,
        description="Base analytique G7 - synchronisée automatiquement"
    )

    for table in enriched_schema:
        table_name = table.get("name")
        table_desc = table.get("description", "")
        row_count = table.get("row_count")

        # Trouver row_count dans le schéma original si pas dans enriched
        if row_count is None:
            for orig_table in duckdb_schema:
                if orig_table["name"] == table_name:
                    row_count = orig_table["row_count"]
                    break

        table_id = add_table(
            datasource_id=ds_id,
            name=table_name,
            description=table_desc,
            row_count=row_count
        )

        columns = table.get("columns", [])
        for col in columns:
            col_name = col.get("name")
            col_type = col.get("type", "VARCHAR")
            col_desc = col.get("description", "")
            sample_values = col.get("sample_values")
            value_range = col.get("value_range")
            synonyms = col.get("synonyms", [])

            # Trouver le type dans le schéma original
            for orig_table in duckdb_schema:
                if orig_table["name"] == table_name:
                    for orig_col in orig_table["columns"]:
                        if orig_col["name"] == col_name:
                            col_type = orig_col["type"]
                            if sample_values is None:
                                sample_values = orig_col.get("sample_values")
                            break

            col_id = add_column(
                table_id=table_id,
                name=col_name,
                data_type=col_type,
                description=col_desc,
                sample_values=sample_values,
                value_range=value_range
            )

            # Ajouter les synonymes
            for synonym in synonyms:
                add_synonym(col_id, synonym)

    print("Synchronisation terminée!")
    print("\n" + "="*60)
    print("NOUVEAU SCHÉMA:")
    print("="*60)
    print(get_schema_for_llm())


def check_schema_changes() -> bool:
    """
    Vérifie si le schéma DuckDB a changé par rapport au catalogue.
    Retourne True si des changements sont détectés.
    """
    duckdb_schema = get_duckdb_schema()

    conn = get_connection()
    cursor = conn.cursor()

    for table in duckdb_schema:
        # Vérifier si la table existe dans le catalogue
        cursor.execute("SELECT id, row_count FROM tables WHERE name = ?", (table["name"],))
        result = cursor.fetchone()

        if result is None:
            print(f"Nouvelle table détectée: {table['name']}")
            conn.close()
            return True

        # Vérifier le nombre de lignes (changement de données)
        if result["row_count"] != table["row_count"]:
            print(f"Changement de données dans {table['name']}: {result['row_count']} -> {table['row_count']}")
            conn.close()
            return True

        # Vérifier les colonnes
        cursor.execute("""
            SELECT name FROM columns WHERE table_id = ?
        """, (result["id"],))
        catalog_columns = {row["name"] for row in cursor.fetchall()}
        duckdb_columns = {col["name"] for col in table["columns"]}

        if catalog_columns != duckdb_columns:
            print(f"Changement de colonnes dans {table['name']}")
            conn.close()
            return True

    conn.close()
    return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Synchronisation du catalogue")
    parser.add_argument("--check", action="store_true", help="Vérifie les changements sans synchroniser")
    parser.add_argument("--no-llm", action="store_true", help="Désactive la génération de descriptions par LLM")
    parser.add_argument("--force", action="store_true", help="Force la synchronisation même sans changements")

    args = parser.parse_args()

    if args.check:
        has_changes = check_schema_changes()
        if has_changes:
            print("Des changements ont été détectés. Exécutez sans --check pour synchroniser.")
        else:
            print("Aucun changement détecté.")
    else:
        if args.force or check_schema_changes():
            sync_catalog(use_llm=not args.no_llm)
        else:
            print("Aucun changement détecté. Utilisez --force pour forcer la synchronisation.")
