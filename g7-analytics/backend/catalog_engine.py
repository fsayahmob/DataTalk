"""
Moteur de génération de catalogue avec:
- Pydantic pour les modèles dynamiques (JSON Schema)
- LLM Service centralisé (LiteLLM + Instructor)

Architecture:
1. extract_metadata_from_connection() - DuckDB native
2. build_response_model() - Pydantic create_model()
3. enrich_with_llm() - llm_service.call_llm_structured()
4. save_to_catalog() - SQLite update
"""
import os
from typing import Any

from pydantic import BaseModel, Field, create_model

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")


# =============================================================================
# ÉTAPE 1: EXTRACTION DES MÉTADONNÉES (SQLAlchemy)
# =============================================================================

class ColumnMetadata(BaseModel):
    """Métadonnées d'une colonne extraites de la DB."""
    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False
    sample_values: list[str] = []
    value_range: str | None = None


class TableMetadata(BaseModel):
    """Métadonnées d'une table extraites de la DB."""
    name: str
    row_count: int
    columns: list[ColumnMetadata]


class ExtractedCatalog(BaseModel):
    """Catalogue complet extrait de la DB."""
    datasource: str
    tables: list[TableMetadata]


def extract_metadata_from_connection(conn: Any) -> ExtractedCatalog:
    """
    Extrait les métadonnées depuis une connexion DuckDB existante.

    Args:
        conn: Connexion DuckDB native (duckdb.DuckDBPyConnection)
    """
    tables_result: list[TableMetadata] = []

    # Récupérer les tables
    tables = conn.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
    """).fetchall()

    for (table_name,) in tables:
        # Nombre de lignes
        row_count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]

        # Colonnes via information_schema
        columns_info = conn.execute(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """).fetchall()

        columns_result: list[ColumnMetadata] = []

        for col_name, col_type in columns_info:
            # Échantillons de valeurs
            sample_values: list[str] = []
            try:
                samples = conn.execute(f'''
                    SELECT DISTINCT CAST("{col_name}" AS VARCHAR) as val
                    FROM "{table_name}"
                    WHERE "{col_name}" IS NOT NULL
                    LIMIT 5
                ''').fetchall()
                sample_values = [str(s[0])[:50] for s in samples if s[0]]
            except Exception:
                pass

            # Range pour les numériques
            value_range: str | None = None
            col_type_lower = col_type.lower()
            if any(t in col_type_lower for t in ['int', 'float', 'decimal', 'double', 'numeric']):
                try:
                    min_max = conn.execute(f'''
                        SELECT MIN("{col_name}"), MAX("{col_name}")
                        FROM "{table_name}"
                        WHERE "{col_name}" IS NOT NULL
                    ''').fetchone()
                    if min_max[0] is not None and min_max[1] is not None:
                        value_range = f"{min_max[0]} - {min_max[1]}"
                except Exception:
                    pass

            columns_result.append(ColumnMetadata(
                name=col_name,
                data_type=col_type,
                nullable=True,
                is_primary_key=False,
                sample_values=sample_values,
                value_range=value_range
            ))

        tables_result.append(TableMetadata(
            name=table_name,
            row_count=row_count,
            columns=columns_result
        ))

    return ExtractedCatalog(
        datasource="g7_analytics.duckdb",
        tables=tables_result
    )


# =============================================================================
# ÉTAPE 2: CRÉATION DYNAMIQUE DU MODÈLE PYDANTIC
# =============================================================================

def build_response_model(catalog: ExtractedCatalog) -> type[BaseModel]:
    """
    Crée dynamiquement un modèle Pydantic basé sur la structure du catalogue.

    Le LLM devra retourner un JSON conforme à ce schéma:
    {
        "table_name": {
            "description": "...",
            "columns": {
                "col1": {"description": "...", "synonyms": [...]},
                "col2": {"description": "...", "synonyms": [...]}
            }
        }
    }
    """
    # Modèle pour une colonne enrichie
    class ColumnEnrichment(BaseModel):
        description: str = Field(description="Description métier de la colonne")
        synonyms: list[str] = Field(default=[], description="Termes alternatifs pour recherche NLP")

    # Pour chaque table, créer un modèle dynamique
    table_models: dict[str, tuple[type, Any]] = {}

    for table in catalog.tables:
        # Créer le modèle des colonnes pour cette table
        column_fields: dict[str, tuple[type, Any]] = {}
        for col in table.columns:
            column_fields[col.name] = (
                ColumnEnrichment,
                Field(description=f"Enrichissement pour la colonne {col.name}")
            )

        ColumnsModel = create_model(  # noqa: N806
            f"{table.name}_Columns",
            **column_fields  # type: ignore
        )

        # Créer le modèle de la table
        TableModel = create_model(  # noqa: N806
            f"{table.name}_Enrichment",
            description=(str, Field(description=f"Description métier de la table {table.name}")),
            columns=(ColumnsModel, Field(description="Enrichissement des colonnes"))
        )

        table_models[table.name] = (TableModel, Field(description=f"Enrichissement de la table {table.name}"))

    # Modèle global
    CatalogEnrichment = create_model(  # noqa: N806
        "CatalogEnrichment",
        **table_models  # type: ignore
    )

    return CatalogEnrichment


# =============================================================================
# ÉTAPE 3: APPEL LLM AVEC INSTRUCTOR
# =============================================================================

def enrich_with_llm(catalog: ExtractedCatalog) -> dict[str, Any]:
    """
    Appelle le LLM via llm_service pour obtenir les descriptions.

    Utilise call_llm_structured() qui gère:
    - Multi-provider (Gemini, OpenAI, Anthropic, etc.)
    - Instructor pour réponses structurées
    - Logging des coûts
    """
    from llm_service import call_llm_structured

    # Construire le modèle de réponse dynamique
    ResponseModel = build_response_model(catalog)  # noqa: N806

    # Construire le prompt avec le contexte
    tables_context = []
    for table in catalog.tables:
        cols_desc = []
        for col in table.columns:
            col_info = f"  - {col.name} ({col.data_type})"
            if col.sample_values:
                col_info += f" [Exemples: {', '.join(col.sample_values[:3])}]"
            if col.value_range:
                col_info += f" [Range: {col.value_range}]"
            cols_desc.append(col_info)

        tables_context.append(f"""
Table: {table.name} ({table.row_count:,} lignes)
Colonnes:
{chr(10).join(cols_desc)}
""")

    prompt = f"""Tu es un expert en data catalog. Analyse cette structure de base de données et génère des descriptions sémantiques.

STRUCTURE À DOCUMENTER:
{chr(10).join(tables_context)}

INSTRUCTIONS:
- Déduis le contexte métier à partir des noms et des exemples de valeurs
- Génère des descriptions claires en français
- Pour chaque colonne, propose 2-3 synonymes (termes alternatifs pour recherche NLP)
- Descriptions concises mais complètes
"""

    # Appel avec llm_service (Instructor intégré)
    try:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=ResponseModel,
            source="catalog_engine"
        )

        # Convertir en dict
        return result.model_dump()

    except Exception as e:
        print(f"Erreur LLM: {e}")
        # Fallback: retourner un dict vide structuré
        fallback: dict[str, Any] = {}
        for table in catalog.tables:
            fallback[table.name] = {
                "description": None,
                "columns": {col.name: {"description": None, "synonyms": []} for col in table.columns}
            }
        return fallback


# =============================================================================
# ÉTAPE 4: SAUVEGARDE DANS LE CATALOGUE SQLite
# =============================================================================

def save_to_catalog(
    catalog: ExtractedCatalog,
    enrichment: dict[str, Any],
    db_path: str = DB_PATH
) -> dict[str, int]:
    """
    Sauvegarde le catalogue enrichi dans SQLite.

    Retourne les statistiques: tables, columns, synonyms créés.
    """
    from catalog import (
        add_column,
        add_datasource,
        add_synonym,
        add_table,
        get_connection,
    )

    # Créer la datasource
    datasource_id = add_datasource(
        name=catalog.datasource.replace(".duckdb", ""),
        type="duckdb",
        path=db_path,
        description="Base analytique générée automatiquement"
    )

    if datasource_id is None:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM datasources WHERE name = ?",
            (catalog.datasource.replace(".duckdb", ""),)
        )
        row = cursor.fetchone()
        datasource_id = row['id'] if row else None
        conn.close()

    if datasource_id is None:
        raise ValueError("Impossible de créer la datasource")

    stats = {"tables": 0, "columns": 0, "synonyms": 0}

    for table in catalog.tables:
        # Récupérer l'enrichissement de la table
        table_enrichment = enrichment.get(table.name, {})
        table_description = table_enrichment.get("description")
        columns_enrichment = table_enrichment.get("columns", {})

        # Créer la table
        table_id = add_table(
            datasource_id=datasource_id,
            name=table.name,
            description=table_description,
            row_count=table.row_count
        )

        if table_id is None:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM tables WHERE datasource_id = ? AND name = ?",
                (datasource_id, table.name)
            )
            row = cursor.fetchone()
            table_id = row['id'] if row else None
            conn.close()

        if table_id:
            stats["tables"] += 1

            for col in table.columns:
                # Récupérer l'enrichissement de la colonne
                col_enrichment = columns_enrichment.get(col.name, {})
                col_description = col_enrichment.get("description")
                synonyms = col_enrichment.get("synonyms", [])

                # Créer la colonne
                column_id = add_column(
                    table_id=table_id,
                    name=col.name,
                    data_type=col.data_type,
                    description=col_description,
                    sample_values=", ".join(col.sample_values) if col.sample_values else None,
                    value_range=col.value_range,
                    is_primary_key=col.is_primary_key
                )

                if column_id is None:
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT id FROM columns WHERE table_id = ? AND name = ?",
                        (table_id, col.name)
                    )
                    row = cursor.fetchone()
                    column_id = row['id'] if row else None
                    conn.close()

                if column_id:
                    stats["columns"] += 1

                    # Ajouter les synonymes
                    for synonym in synonyms:
                        try:
                            add_synonym(column_id, synonym)
                            stats["synonyms"] += 1
                        except Exception:
                            pass  # Ignorer les doublons

    return stats


# =============================================================================
# FONCTION PRINCIPALE: GÉNÉRATION COMPLÈTE
# =============================================================================

def generate_catalog_from_connection(db_connection: Any) -> dict[str, Any]:
    """
    Génère le catalogue complet depuis une connexion DuckDB existante.

    Utilise le LLM configuré par défaut via llm_service.

    Args:
        db_connection: Connexion DuckDB native (duckdb.DuckDBPyConnection)

    Retourne les statistiques et le catalogue.
    """
    # 1. Extraction depuis la connexion existante
    print("1/4 - Extraction des métadonnées depuis connexion DuckDB...")
    catalog = extract_metadata_from_connection(db_connection)
    print(f"    → {len(catalog.tables)} tables, {sum(len(t.columns) for t in catalog.tables)} colonnes")

    # 2. Modèle dynamique (implicite dans enrich_with_llm)
    print("2/4 - Création du modèle Pydantic dynamique...")

    # 3. Enrichissement LLM (utilise llm_service)
    print("3/4 - Enrichissement avec LLM Service...")
    enrichment = enrich_with_llm(catalog)

    # 4. Sauvegarde
    print("4/4 - Sauvegarde dans le catalogue SQLite...")
    stats = save_to_catalog(catalog, enrichment, DB_PATH)
    print(f"    → {stats['tables']} tables, {stats['columns']} colonnes, {stats['synonyms']} synonymes")

    return {
        "status": "ok",
        "message": "Catalogue généré avec succès",
        "stats": stats,
        "tables": [t.name for t in catalog.tables]
    }
