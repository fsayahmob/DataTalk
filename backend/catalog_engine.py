"""
Moteur de génération de catalogue avec:
- Pydantic pour les modèles dynamiques (JSON Schema)
- LLM Service centralisé (LiteLLM + Instructor)

Architecture:
1. extract_metadata_from_connection() - DuckDB native
2. build_response_model() - Pydantic create_model()
3. enrich_with_llm() - llm_service.call_llm_structured()
4. save_to_catalog() - SQLite update
5. generate_kpis() - Génération des 4 KPIs
"""
import os
from typing import Any


# =============================================================================
# UTILITAIRES: ESTIMATION TOKENS & VALIDATION
# =============================================================================

def estimate_tokens(text: str) -> int:
    """
    Estime le nombre de tokens d'un texte.
    Approximation: ~4 caractères = 1 token (pour le français/anglais).
    """
    return len(text) // 4


def check_token_limit(prompt: str, max_input_tokens: int = 100000) -> tuple[bool, int, str]:
    """
    Vérifie si le prompt ne dépasse pas la limite de tokens.

    Args:
        prompt: Le texte du prompt
        max_input_tokens: Limite maximale (défaut 100k pour Gemini)

    Returns:
        (is_ok, token_count, message)
    """
    token_count = estimate_tokens(prompt)

    if token_count > max_input_tokens:
        return (False, token_count, f"Prompt trop long: {token_count:,} tokens (max: {max_input_tokens:,})")
    elif token_count > max_input_tokens * 0.8:
        return (True, token_count, f"Prompt volumineux: {token_count:,} tokens (80% de la limite)")
    else:
        return (True, token_count, f"OK: {token_count:,} tokens")


class CatalogValidationResult:
    """Résultat de validation du catalogue complet."""

    def __init__(self):
        self.tables_ok = 0
        self.tables_warning = 0
        self.columns_ok = 0
        self.columns_warning = 0
        self.synonyms_total = 0
        self.issues: list[str] = []

    @property
    def status(self) -> str:
        """Retourne OK si tout est bon, WARNING sinon."""
        if self.tables_warning == 0 and self.columns_warning == 0:
            return "OK"
        return "WARNING"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "tables": {"ok": self.tables_ok, "warning": self.tables_warning},
            "columns": {"ok": self.columns_ok, "warning": self.columns_warning},
            "synonyms": self.synonyms_total,
            "issues": self.issues
        }


def validate_catalog_enrichment(
    catalog: "ExtractedCatalog",
    enrichment: dict[str, Any]
) -> CatalogValidationResult:
    """
    Valide que l'enrichissement LLM a bien rempli tous les champs.

    Args:
        catalog: Le catalogue extrait (structure)
        enrichment: Les données enrichies par le LLM

    Returns:
        CatalogValidationResult avec status OK ou WARNING
    """
    result = CatalogValidationResult()

    for table in catalog.tables:
        table_enrichment = enrichment.get(table.name, {})

        # Vérifier la description de la table
        table_desc = table_enrichment.get("description")
        if table_desc and len(str(table_desc)) > 5:
            result.tables_ok += 1
        else:
            result.tables_warning += 1
            result.issues.append(f"Table '{table.name}': description manquante")

        # Vérifier chaque colonne
        columns_enrichment = table_enrichment.get("columns", {})
        for col in table.columns:
            col_enrichment = columns_enrichment.get(col.name, {})

            col_desc = col_enrichment.get("description")
            col_synonyms = col_enrichment.get("synonyms", [])

            if col_desc and len(str(col_desc)) > 3:
                result.columns_ok += 1
            else:
                result.columns_warning += 1
                result.issues.append(f"Colonne '{table.name}.{col.name}': description manquante")

            result.synonyms_total += len(col_synonyms) if col_synonyms else 0

    return result

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

    # Vérifier la taille du prompt avant l'appel
    is_ok, token_count, token_msg = check_token_limit(prompt)
    print(f"    → Tokens input: {token_msg}")
    if not is_ok:
        raise ValueError(f"Prompt trop volumineux pour le LLM: {token_count:,} tokens")

    # Appel avec llm_service (Instructor intégré)
    try:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=ResponseModel,
            source="catalog_engine",
            max_tokens=8192  # Assez pour les descriptions de toutes les colonnes
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
    invert_trend: bool = Field(default=False, description="Si true, baisse=positif (vert), hausse=négatif (rouge). Ex: taux d'erreur, insatisfaction")

    @classmethod
    def get_fields_description(cls) -> str:
        """
        Génère automatiquement la description des champs pour le prompt LLM.
        Extrait les infos du modèle Pydantic (nom, type, description, défaut).
        """
        from pydantic_core import PydanticUndefined

        lines = []
        for field_name, field_info in cls.model_fields.items():
            # Type du champ
            annotation = field_info.annotation
            if hasattr(annotation, "__origin__"):  # Pour Union, Optional, etc.
                type_str = str(annotation).replace("typing.", "")
            else:
                type_str = annotation.__name__ if hasattr(annotation, "__name__") else str(annotation)

            # Description
            desc = field_info.description or "Non documenté"

            # Valeur par défaut (ignorer PydanticUndefined = champ obligatoire)
            default = field_info.default
            if default is not None and default is not PydanticUndefined:
                default_str = f" (défaut: {default})"
            else:
                default_str = ""

            lines.append(f"- {field_name}: {type_str}{default_str} - {desc}")

        return "\n".join(lines)


class KpisGenerationResult(BaseModel):
    """Résultat de la génération de KPIs."""
    kpis: list[KpiDefinition] = Field(description="Liste des 4 KPIs")


class KpiValidationResult(BaseModel):
    """Résultat de la validation d'un KPI."""
    kpi_id: str
    status: str  # "OK" ou "WARNING"
    issues: list[str] = []


def validate_kpi(kpi: KpiDefinition) -> KpiValidationResult:
    """
    Valide qu'un KPI a tous ses champs requis correctement remplis.

    Returns:
        KpiValidationResult avec status OK ou WARNING et liste des problèmes
    """
    issues = []

    # Vérifier les champs obligatoires
    if not kpi.id or len(kpi.id) < 2:
        issues.append("id manquant ou trop court")

    if not kpi.title or len(kpi.title) < 2:
        issues.append("title manquant ou trop court")

    if not kpi.sql_value or "SELECT" not in kpi.sql_value.upper():
        issues.append("sql_value invalide (pas de SELECT)")

    if not kpi.sql_trend or "SELECT" not in kpi.sql_trend.upper():
        issues.append("sql_trend invalide (pas de SELECT)")

    if not kpi.sql_sparkline or "SELECT" not in kpi.sql_sparkline.upper():
        issues.append("sql_sparkline invalide (pas de SELECT)")

    if kpi.sparkline_type not in ("area", "bar"):
        issues.append(f"sparkline_type invalide: {kpi.sparkline_type}")

    if not kpi.footer:
        issues.append("footer manquant")

    return KpiValidationResult(
        kpi_id=kpi.id,
        status="OK" if not issues else "WARNING",
        issues=issues
    )


def validate_all_kpis(result: KpisGenerationResult) -> dict[str, Any]:
    """
    Valide tous les KPIs générés.

    Returns:
        {
            "total": 4,
            "ok": 3,
            "warnings": 1,
            "details": [KpiValidationResult, ...]
        }
    """
    details = [validate_kpi(kpi) for kpi in result.kpis]
    ok_count = sum(1 for d in details if d.status == "OK")
    warning_count = sum(1 for d in details if d.status == "WARNING")

    return {
        "total": len(result.kpis),
        "ok": ok_count,
        "warnings": warning_count,
        "details": details
    }


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

    # Générer la description des champs KPI depuis le modèle Pydantic
    kpi_fields = KpiDefinition.get_fields_description()

    prompt = prompt_data["content"].format(
        schema="\n".join(schema_lines),
        data_period=data_period,
        kpi_fields=kpi_fields
    )

    # Vérifier la taille du prompt avant l'appel
    is_ok, token_count, token_msg = check_token_limit(prompt)
    print(f"    → Tokens input: {token_msg}")
    if not is_ok:
        print(f"  [ERROR] Prompt trop volumineux: {token_count:,} tokens")
        return None

    try:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=KpisGenerationResult,
            source="kpi_generation",
            max_tokens=8192  # 4 KPIs avec 3 SQL chacun = réponse longue
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
                    sparkline_type, footer, trend_label, invert_trend, display_order, is_enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
            """, (
                kpi.id,
                kpi.title,
                kpi.sql_value,
                kpi.sql_trend,
                kpi.sql_sparkline,
                kpi.sparkline_type,
                kpi.footer,
                kpi.trend_label,
                kpi.invert_trend,
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

    Retourne les statistiques, validations et le catalogue.
    """
    validation_results: dict[str, Any] = {
        "catalog": None,
        "kpis": None
    }

    # 1. Extraction depuis la connexion existante
    print("1/5 - Extraction des métadonnées depuis connexion DuckDB...")
    catalog = extract_metadata_from_connection(db_connection)
    print(f"    → {len(catalog.tables)} tables, {sum(len(t.columns) for t in catalog.tables)} colonnes")

    # 2. Modèle dynamique (implicite dans enrich_with_llm)
    print("2/5 - Création du modèle Pydantic dynamique...")

    # 3. Enrichissement LLM (utilise llm_service)
    print("3/5 - Enrichissement avec LLM Service...")
    enrichment = enrich_with_llm(catalog)

    # 3bis. Validation de l'enrichissement
    catalog_validation = validate_catalog_enrichment(catalog, enrichment)
    validation_results["catalog"] = catalog_validation.to_dict()
    if catalog_validation.status == "OK":
        print(f"    → Validation: [OK] {catalog_validation.tables_ok} tables, {catalog_validation.columns_ok} colonnes")
    else:
        print(f"    → Validation: [WARNING] {catalog_validation.tables_warning} tables, {catalog_validation.columns_warning} colonnes avec problèmes")
        for issue in catalog_validation.issues[:5]:  # Limiter à 5 issues
            print(f"      - {issue}")

    # 4. Sauvegarde du catalogue
    print("4/5 - Sauvegarde dans le catalogue SQLite...")
    stats = save_to_catalog(catalog, enrichment, DB_PATH)
    print(f"    → {stats['tables']} tables, {stats['columns']} colonnes, {stats['synonyms']} synonymes")

    # 5. Génération des KPIs
    print("5/5 - Génération des 4 KPIs...")
    kpis_result = generate_kpis(catalog, db_connection)
    if kpis_result:
        # Validation des KPIs
        kpis_validation = validate_all_kpis(kpis_result)
        validation_results["kpis"] = kpis_validation

        kpis_stats = save_kpis(kpis_result)
        stats["kpis"] = kpis_stats["kpis"]

        if kpis_validation["warnings"] == 0:
            print(f"    → [OK] {kpis_stats['kpis']} KPIs générés")
        else:
            print(f"    → [WARNING] {kpis_stats['kpis']} KPIs générés, {kpis_validation['warnings']} avec problèmes")
            for detail in kpis_validation["details"]:
                if detail.status == "WARNING":
                    print(f"      - {detail.kpi_id}: {', '.join(detail.issues)}")
    else:
        stats["kpis"] = 0
        validation_results["kpis"] = {"total": 0, "ok": 0, "warnings": 0, "details": []}
        print("    → [ERROR] KPIs non générés (prompt manquant ou erreur)")

    # Rapport final
    print("\n" + "=" * 50)
    overall_status = "OK"
    if validation_results["catalog"] and validation_results["catalog"]["status"] == "WARNING":
        overall_status = "WARNING"
    if validation_results["kpis"] and validation_results["kpis"]["warnings"] > 0:
        overall_status = "WARNING"
    if stats["kpis"] == 0:
        overall_status = "WARNING"

    print(f"RAPPORT FINAL: [{overall_status}]")
    print(f"  - Catalogue: {stats['tables']} tables, {stats['columns']} colonnes, {stats['synonyms']} synonymes")
    print(f"  - KPIs: {stats['kpis']}/4 générés")
    print("=" * 50)

    return {
        "status": overall_status.lower(),
        "message": "Catalogue généré avec succès" if overall_status == "OK" else "Catalogue généré avec des avertissements",
        "stats": stats,
        "tables": [t.name for t in catalog.tables],
        "validation": validation_results
    }
