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


class PromptNotConfiguredError(Exception):
    """Erreur levée quand un prompt n'est pas configuré en base."""

    def __init__(self, prompt_key: str):
        self.prompt_key = prompt_key
        super().__init__(f"Prompt '{prompt_key}' non configuré. Exécutez: python seed_prompts.py")


def enrich_with_llm(catalog: ExtractedCatalog) -> dict[str, Any]:
    """
    Appelle le LLM via llm_service pour obtenir les descriptions.

    Utilise call_llm_structured() qui gère:
    - Multi-provider (Gemini, OpenAI, Anthropic, etc.)
    - Instructor pour réponses structurées
    - Logging des coûts

    Raises:
        PromptNotConfiguredError: Si le prompt catalog_enrichment n'est pas en base.
    """
    from llm_config import get_active_prompt
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

    # Récupérer le prompt depuis la DB (erreur si non trouvé)
    prompt_data = get_active_prompt("catalog_enrichment")
    if not prompt_data or not prompt_data.get("content"):
        raise PromptNotConfiguredError("catalog_enrichment")

    prompt = prompt_data["content"].format(tables_context=chr(10).join(tables_context))

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
# ÉTAPE 5: GÉNÉRATION DES KPIs
# =============================================================================

class KpiDefinition(BaseModel):
    """Définition d'un KPI généré par le LLM (KpiCompactData)."""
    id: str = Field(description="Slug unique (ex: 'total-evaluations')")
    title: str = Field(description="Titre du KPI (max 20 caractères)")
    sql_value: str = Field(description="Requête SQL pour la valeur actuelle (1 ligne)")
    sql_trend: str = Field(description="Requête SQL pour la valeur de comparaison (1 ligne)")
    sql_sparkline: str = Field(description="Requête SQL pour l'historique (12-15 lignes)")
    sparkline_type: str = Field(default="area", description="Type de sparkline: area ou bar")
    footer: str = Field(description="Texte explicatif avec la période")
    trend_label: str | None = Field(default=None, description="Label de tendance (ex: 'vs 1ère quinzaine')")


class KpisGenerationResult(BaseModel):
    """Résultat de la génération de KPIs."""
    kpis: list[KpiDefinition] = Field(description="Liste des 4 KPIs")


def get_data_period(conn: Any) -> str:
    """
    Récupère la période des données depuis la colonne de date principale.
    """
    try:
        # Essayer avec dat_course (table evaluations)
        result = conn.execute("""
            SELECT
                MIN(dat_course)::DATE as min_date,
                MAX(dat_course)::DATE as max_date,
                COUNT(DISTINCT dat_course::DATE) as nb_jours
            FROM evaluations
        """).fetchone()

        if result and result[0]:
            min_date = result[0]
            max_date = result[1]
            nb_jours = result[2]
            return f"Du {min_date} au {max_date} ({nb_jours} jours de données)"
    except Exception:
        pass

    return "Période non déterminée"


def generate_kpis(catalog: ExtractedCatalog, db_connection: Any) -> KpisGenerationResult | None:
    """
    Génère les 4 KPIs via LLM.

    Utilise le prompt 'widgets_generation' de la base de données.
    """
    from llm_config import get_active_prompt
    from llm_service import call_llm_structured

    # Récupérer le prompt depuis la DB
    prompt_data = get_active_prompt("widgets_generation")
    if not prompt_data or not prompt_data.get("content"):
        print("  [WARN] Prompt 'widgets_generation' non configuré. Exécutez: python seed_prompts.py --force")
        return None

    # Construire le schéma pour le prompt
    schema_lines = []
    for table in catalog.tables:
        schema_lines.append(f"Table: {table.name} ({table.row_count:,} lignes)")
        for col in table.columns:
            col_line = f"  - {col.name} ({col.data_type})"
            if col.sample_values:
                col_line += f" [Exemples: {', '.join(col.sample_values[:3])}]"
            if col.value_range:
                col_line += f" [Range: {col.value_range}]"
            schema_lines.append(col_line)
        schema_lines.append("")

    # Récupérer la période des données
    data_period = get_data_period(db_connection)

    prompt = prompt_data["content"].format(
        schema="\n".join(schema_lines),
        data_period=data_period
    )

    try:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=KpisGenerationResult,
            source="kpi_generation"
        )
        return result
    except Exception as e:
        print(f"  [ERROR] Erreur génération KPIs: {e}")
        return None


def save_kpis(result: KpisGenerationResult) -> dict[str, int]:
    """
    Sauvegarde les KPIs générés dans SQLite.
    """
    from catalog import get_connection

    conn = get_connection()
    cursor = conn.cursor()

    # Vider les anciens KPIs
    cursor.execute("DELETE FROM kpis")

    stats = {"kpis": 0}

    for i, kpi in enumerate(result.kpis):
        try:
            cursor.execute("""
                INSERT INTO kpis (
                    kpi_id, title, sql_value, sql_trend, sql_sparkline,
                    sparkline_type, footer, trend_label, display_order, is_enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
            """, (
                kpi.id,
                kpi.title,
                kpi.sql_value,
                kpi.sql_trend,
                kpi.sql_sparkline,
                kpi.sparkline_type,
                kpi.footer,
                kpi.trend_label,
                i
            ))
            stats["kpis"] += 1
        except Exception as e:
            print(f"  [WARN] Erreur KPI {kpi.id}: {e}")

    conn.commit()
    conn.close()
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

    # 4. Sauvegarde du catalogue
    print("4/4 - Sauvegarde dans le catalogue SQLite...")
    stats = save_to_catalog(catalog, enrichment, DB_PATH)
    print(f"    → {stats['tables']} tables, {stats['columns']} colonnes, {stats['synonyms']} synonymes")

    # 5. Génération des KPIs
    print("5/5 - Génération des 4 KPIs...")
    kpis_result = generate_kpis(catalog, db_connection)
    if kpis_result:
        kpis_stats = save_kpis(kpis_result)
        stats["kpis"] = kpis_stats["kpis"]
        print(f"    → {kpis_stats['kpis']} KPIs générés")
    else:
        stats["kpis"] = 0
        print("    → KPIs non générés (prompt manquant ou erreur)")

    return {
        "status": "ok",
        "message": "Catalogue généré avec succès",
        "stats": stats,
        "tables": [t.name for t in catalog.tables]
    }
