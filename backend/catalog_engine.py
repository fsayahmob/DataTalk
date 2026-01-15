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
import json
import re
from contextlib import contextmanager, suppress
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, create_model
from pydantic_core import PydanticUndefined

from catalog import (
    WorkflowManager,
    add_column,
    add_datasource,
    add_synonym,
    add_table,
    get_connection,
    get_schema_for_llm,
    get_setting,
)
from llm_config import get_active_prompt
from llm_service import call_llm, call_llm_structured

if TYPE_CHECKING:
    pass


# =============================================================================
# UTILITAIRES: ESTIMATION TOKENS & VALIDATION
# =============================================================================

@contextmanager
def _dummy_context():
    """Context manager vide pour compatibilité quand job_id est None."""
    yield

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
    if token_count > max_input_tokens * 0.8:
        return (True, token_count, f"Prompt volumineux: {token_count:,} tokens (80% de la limite)")
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

# Configuration par défaut (fallback si settings non initialisé)
DEFAULT_DB_PATH = str(Path(__file__).parent / ".." / "data" / "g7_analytics.duckdb")


def get_duckdb_path() -> str:
    """Récupère le chemin DuckDB depuis les settings ou utilise le défaut."""
    path = get_setting("duckdb_path")
    if path:
        # Si chemin relatif, le résoudre par rapport au dossier backend
        if not Path(path).is_absolute():
            path = str(Path(__file__).parent / ".." / path)
        return str(Path(path).resolve())
    return DEFAULT_DB_PATH


# =============================================================================
# ÉTAPE 1: EXTRACTION DES MÉTADONNÉES (SQLAlchemy)
# =============================================================================

class ValueFrequency(BaseModel):
    """Valeur avec sa fréquence d'apparition."""
    value: str
    count: int
    percentage: float


class ColumnMetadata(BaseModel):
    """
    Métadonnées d'une colonne extraites de la DB.

    Inspiré des data catalogs professionnels (dbt, DataHub, Amundsen):
    - Statistiques de base (null_rate, cardinality)
    - Distribution des valeurs (top_values avec fréquences)
    - Patterns détectés (email, UUID, etc.)
    - Statistiques sur les longueurs (pour VARCHAR)
    """
    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False

    # Statistiques de base
    null_count: int = 0
    null_rate: float = 0.0  # % de NULL (0.0 à 1.0)
    distinct_count: int = 0  # Cardinalité
    unique_rate: float = 0.0  # % de valeurs uniques (0.0 à 1.0)

    # Valeurs
    sample_values: list[str] = []  # Échantillon ou toutes valeurs si catégoriel
    top_values: list[ValueFrequency] = []  # Top 10 valeurs avec fréquences
    is_categorical: bool = False  # True si colonne catégorielle (≤50 valeurs distinctes)

    # Range et statistiques numériques
    value_range: str | None = None  # "min - max" pour numériques
    mean: float | None = None  # Moyenne (numériques)
    median: float | None = None  # Médiane (numériques)

    # Statistiques texte (VARCHAR)
    min_length: int | None = None
    max_length: int | None = None
    avg_length: float | None = None

    # Patterns détectés
    detected_pattern: str | None = None  # ex: "email", "uuid", "phone", "date", "url"
    pattern_match_rate: float | None = None  # % de valeurs matchant le pattern

    # Relations potentielles
    potential_fk_table: str | None = None  # Table référencée potentielle
    potential_fk_column: str | None = None  # Colonne référencée potentielle


class TableMetadata(BaseModel):
    """Métadonnées d'une table extraites de la DB."""
    name: str
    row_count: int
    columns: list[ColumnMetadata]


class ExtractedCatalog(BaseModel):
    """Catalogue complet extrait de la DB."""
    datasource: str
    tables: list[TableMetadata]


# Patterns communs pour détection automatique
COMMON_PATTERNS = {
    "email": r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
    "uuid": r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    "phone_fr": r"^(?:\+33|0)[1-9](?:[0-9]{8}|[0-9]{2}(?:\s|\.|-)?[0-9]{2}(?:\s|\.|-)?[0-9]{2}(?:\s|\.|-)?[0-9]{2})$",
    "url": r"^https?://[^\s]+$",
    "ip_address": r"^(?:\d{1,3}\.){3}\d{1,3}$",
    "date_iso": r"^\d{4}-\d{2}-\d{2}$",
    "datetime_iso": r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}",
    "postal_code_fr": r"^\d{5}$",
    "siret": r"^\d{14}$",
    "siren": r"^\d{9}$",
}


def detect_pattern(values: list[str]) -> tuple[str | None, float | None]:
    """
    Détecte un pattern commun dans une liste de valeurs.

    Returns:
        (pattern_name, match_rate) ou (None, None) si aucun pattern trouvé
    """
    if not values:
        return None, None

    best_pattern = None
    best_rate = 0.0

    for pattern_name, regex in COMMON_PATTERNS.items():
        try:
            compiled = re.compile(regex)
            matches = sum(1 for v in values if v and compiled.match(str(v)))
            rate = matches / len(values) if values else 0

            # On garde si >70% des valeurs matchent
            if rate > 0.7 and rate > best_rate:
                best_pattern = pattern_name
                best_rate = rate
        except Exception:  # noqa: S112
            continue

    return (best_pattern, best_rate) if best_pattern else (None, None)


def extract_column_stats(conn: Any, table_name: str, col_name: str, col_type: str, row_count: int) -> ColumnMetadata:
    """
    Extrait les statistiques complètes d'une colonne.

    Inspiré des data catalogs professionnels (dbt, DataHub, Amundsen, Great Expectations).
    """
    categorical_threshold = 50
    col_type_lower = col_type.lower()
    is_numeric = any(t in col_type_lower for t in ["int", "float", "decimal", "double", "numeric", "real"])
    is_text = any(t in col_type_lower for t in ["varchar", "text", "char", "string"])

    # Initialiser les valeurs par défaut
    stats: dict[str, Any] = {
        "name": col_name,
        "data_type": col_type,
        "nullable": True,
        "is_primary_key": False,
        "null_count": 0,
        "null_rate": 0.0,
        "distinct_count": 0,
        "unique_rate": 0.0,
        "sample_values": [],
        "top_values": [],
        "is_categorical": False,
        "value_range": None,
        "mean": None,
        "median": None,
        "min_length": None,
        "max_length": None,
        "avg_length": None,
        "detected_pattern": None,
        "pattern_match_rate": None,
        "potential_fk_table": None,
        "potential_fk_column": None,
    }

    try:
        # 1. Statistiques de base (null_count, distinct_count)
        base_stats = conn.execute(f"""
            SELECT
                COUNT(*) - COUNT("{col_name}") as null_count,
                COUNT(DISTINCT "{col_name}") as distinct_count
            FROM "{table_name}"
        """).fetchone()  # noqa: S608

        null_count = base_stats[0] or 0
        distinct_count = base_stats[1] or 0

        stats["null_count"] = null_count
        stats["null_rate"] = round(null_count / row_count, 4) if row_count > 0 else 0.0
        stats["distinct_count"] = distinct_count
        stats["unique_rate"] = round(distinct_count / row_count, 4) if row_count > 0 else 0.0

        # 2. Détection catégorielle et valeurs
        stats["is_categorical"] = distinct_count <= categorical_threshold

        if stats["is_categorical"]:
            # Récupérer TOUTES les valeurs pour colonnes catégorielles
            samples = conn.execute(f"""
                SELECT DISTINCT CAST("{col_name}" AS VARCHAR) as val
                FROM "{table_name}"
                WHERE "{col_name}" IS NOT NULL
                ORDER BY val
            """).fetchall()  # noqa: S608
            stats["sample_values"] = [str(s[0])[:100] for s in samples if s[0]]
        else:
            # Échantillon de 5 valeurs
            samples = conn.execute(f"""
                SELECT DISTINCT CAST("{col_name}" AS VARCHAR) as val
                FROM "{table_name}"
                WHERE "{col_name}" IS NOT NULL
                LIMIT 5
            """).fetchall()  # noqa: S608
            stats["sample_values"] = [str(s[0])[:50] for s in samples if s[0]]

        # 3. Top 10 valeurs avec fréquences (distribution)
        top_values_result = conn.execute(f"""
            SELECT CAST("{col_name}" AS VARCHAR) as val, COUNT(*) as cnt
            FROM "{table_name}"
            WHERE "{col_name}" IS NOT NULL
            GROUP BY "{col_name}"
            ORDER BY cnt DESC
            LIMIT 10
        """).fetchall()  # noqa: S608

        stats["top_values"] = [
            ValueFrequency(
                value=str(v[0])[:50] if v[0] else "NULL",
                count=v[1],
                percentage=round(v[1] / row_count * 100, 2) if row_count > 0 else 0.0
            )
            for v in top_values_result
        ]

        # 4. Statistiques numériques
        if is_numeric:
            with suppress(Exception):
                num_stats = conn.execute(f"""
                    SELECT
                        MIN("{col_name}"),
                        MAX("{col_name}"),
                        AVG("{col_name}"),
                        MEDIAN("{col_name}")
                    FROM "{table_name}"
                    WHERE "{col_name}" IS NOT NULL
                """).fetchone()  # noqa: S608

                if num_stats[0] is not None:
                    stats["value_range"] = f"{num_stats[0]} - {num_stats[1]}"
                    stats["mean"] = round(float(num_stats[2]), 4) if num_stats[2] else None
                    stats["median"] = round(float(num_stats[3]), 4) if num_stats[3] else None

        # 5. Statistiques texte (longueurs)
        if is_text:
            with suppress(Exception):
                text_stats = conn.execute(f"""
                    SELECT
                        MIN(LENGTH("{col_name}")),
                        MAX(LENGTH("{col_name}")),
                        AVG(LENGTH("{col_name}"))
                    FROM "{table_name}"
                    WHERE "{col_name}" IS NOT NULL
                """).fetchone()  # noqa: S608

                if text_stats[0] is not None:
                    stats["min_length"] = text_stats[0]
                    stats["max_length"] = text_stats[1]
                    stats["avg_length"] = round(float(text_stats[2]), 2) if text_stats[2] else None

        # 6. Détection de patterns (sur échantillon pour performance)
        if is_text and distinct_count > 10:
            with suppress(Exception):
                pattern_samples = conn.execute(f"""
                    SELECT CAST("{col_name}" AS VARCHAR)
                    FROM "{table_name}"
                    WHERE "{col_name}" IS NOT NULL
                    LIMIT 100
                """).fetchall()  # noqa: S608
                sample_values_for_pattern = [str(s[0]) for s in pattern_samples if s[0]]

                pattern, rate = detect_pattern(sample_values_for_pattern)
                if pattern:
                    stats["detected_pattern"] = pattern
                    stats["pattern_match_rate"] = round(rate, 4) if rate else None

    except Exception as e:
        print(f"    [WARN] Erreur extraction stats {table_name}.{col_name}: {e}")

    return ColumnMetadata(**stats)


def extract_metadata_from_connection(conn: Any) -> ExtractedCatalog:
    """
    Extrait les métadonnées avancées depuis une connexion DuckDB.

    Collecte pour chaque colonne:
    - Statistiques de base (null_rate, cardinality, unique_rate)
    - Distribution des valeurs (top 10 avec fréquences)
    - Statistiques numériques (mean, median, range)
    - Statistiques texte (longueurs min/max/avg)
    - Patterns détectés (email, UUID, phone, etc.)

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

    print(f"  Extraction avancée de {len(tables)} tables...")

    for (table_name,) in tables:
        # Nombre de lignes
        row_count = conn.execute(
            f'SELECT COUNT(*) FROM "{table_name}"'  # noqa: S608
        ).fetchone()[0]

        # Colonnes via information_schema
        columns_info = conn.execute(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """).fetchall()  # noqa: S608

        print(f"    → {table_name}: {len(columns_info)} colonnes, {row_count:,} lignes")

        columns_result: list[ColumnMetadata] = []

        for col_name, col_type in columns_info:
            col_metadata = extract_column_stats(conn, table_name, col_name, col_type, row_count)
            columns_result.append(col_metadata)

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
    return create_model(
        "CatalogEnrichment",
        **table_models  # type: ignore
    )


# =============================================================================
# ÉTAPE 3: APPEL LLM AVEC INSTRUCTOR
# =============================================================================


class PromptNotConfiguredError(Exception):
    """Erreur levée quand un prompt n'est pas configuré en base."""

    def __init__(self, prompt_key: str):
        self.prompt_key = prompt_key
        super().__init__(f"Prompt '{prompt_key}' non configuré. Exécutez: python seed_prompts.py")


# Type alias pour le mode de prompt
PromptMode = str  # "compact" ou "full"


def build_column_full_context(col: ColumnMetadata) -> str:
    """
    Construit le contexte complet pour UNE colonne (stocké en SQLite).

    Ce contexte est calculé une seule fois à l'extraction et réutilisé
    pour l'enrichissement LLM et le text-to-SQL.

    Inclut: stats de base, ENUM/exemples, distribution, stats numériques,
    stats texte, patterns détectés.
    """
    parts = []

    # Statistiques de base
    stats_parts = []
    if col.null_rate > 0:
        stats_parts.append(f"{col.null_rate*100:.1f}% NULL")
    if col.distinct_count > 0:
        stats_parts.append(f"{col.distinct_count} valeurs distinctes")
    if stats_parts:
        parts.append(f"[{', '.join(stats_parts)}]")

    # Valeurs (catégorielle = toutes, sinon échantillon)
    if col.sample_values:
        if col.is_categorical:
            parts.append(f"ENUM: {', '.join(col.sample_values)}")
        else:
            parts.append(f"Exemples: {', '.join(col.sample_values[:5])}")

    # Distribution (top valeurs avec %)
    if col.top_values and not col.is_categorical:
        top_str = ", ".join([f"{v.value}({v.percentage:.1f}%)" for v in col.top_values[:5]])
        parts.append(f"Top valeurs: {top_str}")

    # Statistiques numériques
    if col.value_range:
        range_parts = [f"Range: {col.value_range}"]
        if col.mean is not None:
            range_parts.append(f"Moyenne: {col.mean:.2f}")
        if col.median is not None:
            range_parts.append(f"Médiane: {col.median:.2f}")
        parts.append(" | ".join(range_parts))

    # Statistiques texte
    if col.min_length is not None and col.max_length is not None:
        parts.append(f"Longueur: {col.min_length}-{col.max_length} chars (avg: {col.avg_length:.0f})")

    # Pattern détecté
    if col.detected_pattern:
        parts.append(f"Pattern: {col.detected_pattern} ({col.pattern_match_rate*100:.0f}% match)")

    return " | ".join(parts) if parts else ""


def _build_full_context(catalog: ExtractedCatalog) -> str:
    """
    Construit le contexte en format FULL (nouveau format enrichi).

    Inclut:
    - Statistiques de base (null_rate, distinct_count)
    - ENUM pour colonnes catégorielles
    - Distribution (top valeurs avec %)
    - Statistiques numériques (mean, median, range)
    - Statistiques texte (longueurs)
    - Patterns détectés
    """
    tables_context = []
    for table in catalog.tables:
        cols_desc = []
        for col in table.columns:
            # Ligne principale: nom, type, stats de base
            col_info = f"  - {col.name} ({col.data_type})"

            # Statistiques de base
            stats_parts = []
            if col.null_rate > 0:
                stats_parts.append(f"{col.null_rate*100:.1f}% NULL")
            if col.distinct_count > 0:
                stats_parts.append(f"{col.distinct_count} valeurs distinctes")
            if stats_parts:
                col_info += f" [{', '.join(stats_parts)}]"

            # Valeurs (catégorielle = toutes, sinon échantillon)
            if col.sample_values:
                if col.is_categorical:
                    col_info += f"\n      ENUM: {', '.join(col.sample_values)}"
                else:
                    col_info += f"\n      Exemples: {', '.join(col.sample_values[:3])}"

            # Distribution (top valeurs avec %)
            if col.top_values and not col.is_categorical:
                top_str = ", ".join([f"{v.value}({v.percentage}%)" for v in col.top_values[:3]])
                col_info += f"\n      Top valeurs: {top_str}"

            # Statistiques numériques
            if col.value_range:
                col_info += f"\n      Range: {col.value_range}"
            if col.mean is not None:
                col_info += f" | Moyenne: {col.mean}"
            if col.median is not None:
                col_info += f" | Médiane: {col.median}"

            # Statistiques texte
            if col.min_length is not None and col.max_length is not None:
                col_info += f"\n      Longueur: {col.min_length}-{col.max_length} chars (avg: {col.avg_length})"

            # Pattern détecté
            if col.detected_pattern:
                col_info += f"\n      Pattern détecté: {col.detected_pattern} ({col.pattern_match_rate*100:.0f}% match)"

            cols_desc.append(col_info)

        tables_context.append(f"""
Table: {table.name} ({table.row_count:,} lignes)
Colonnes:
{chr(10).join(cols_desc)}
""")

    return chr(10).join(tables_context)


def enrich_with_llm(
    catalog: ExtractedCatalog,
    tables_context: str | None = None
) -> dict[str, Any]:
    """
    Appelle le LLM via llm_service pour obtenir les descriptions.

    Args:
        catalog: Catalogue extrait à enrichir (pour construire le modèle de réponse)
        tables_context: Contexte pré-construit depuis SQLite (full_context).
                        Si None, utilise _build_full_context() (fallback).

    Utilise call_llm_structured() qui gère:
    - Multi-provider (Gemini, OpenAI, Anthropic, etc.)
    - Instructor pour réponses structurées
    - Logging des coûts

    Raises:
        PromptNotConfiguredError: Si le prompt catalog_enrichment n'est pas en base.
    """
    # Construire le modèle de réponse dynamique
    ResponseModel = build_response_model(catalog)  # noqa: N806

    # Utiliser le contexte fourni ou fallback sur _build_full_context
    if tables_context is None:
        tables_context = _build_full_context(catalog)
        print("    → Contexte construit depuis catalogue (fallback)")
    else:
        print("    → Contexte lu depuis SQLite (full_context)")

    # Récupérer le prompt depuis la DB (erreur si non trouvé)
    prompt_data = get_active_prompt("catalog_enrichment")
    if not prompt_data or not prompt_data.get("content"):
        raise PromptNotConfiguredError("catalog_enrichment")

    prompt = prompt_data["content"].format(tables_context=tables_context)

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
    db_path: str | None = None
) -> dict[str, int]:
    """
    Sauvegarde le catalogue enrichi dans SQLite.

    Retourne les statistiques: tables, columns, synonyms créés.
    """
    # Créer la datasource
    datasource_id = add_datasource(
        name=catalog.datasource.replace(".duckdb", ""),
        ds_type="duckdb",
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
        datasource_id = row["id"] if row else None
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
            table_id = row["id"] if row else None
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
                    column_id = row["id"] if row else None
                    conn.close()

                if column_id:
                    stats["columns"] += 1

                    # Ajouter les synonymes
                    for synonym in synonyms:
                        with suppress(Exception):  # Ignorer les doublons
                            add_synonym(column_id, synonym)
                            stats["synonyms"] += 1

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
    with suppress(Exception):
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

    return "Période non déterminée"


def generate_kpis(catalog: ExtractedCatalog, db_connection: Any) -> KpisGenerationResult | None:
    """
    Génère les 4 KPIs via LLM.

    Utilise le prompt 'widgets_generation' de la base de données.
    """
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


def generate_suggested_questions(catalog: ExtractedCatalog) -> list[dict[str, str]]:
    """
    Génère des questions suggérées basées sur le catalogue enrichi.

    Utilise le LLM pour analyser le schéma et proposer des questions
    pertinentes que l'utilisateur métier pourrait poser.

    Args:
        catalog: Catalogue enrichi avec descriptions

    Returns:
        Liste de questions avec catégorie et icône
    """
    print("    Génération des questions suggérées...")

    # Récupérer le schéma formaté
    schema = get_schema_for_llm()

    # Récupérer le prompt depuis la DB
    prompt_data = get_active_prompt("catalog_questions")
    if not prompt_data or not prompt_data.get("content"):
        print("    [WARN] Prompt 'catalog_questions' non trouvé, skip")
        return []

    # Injecter le schéma dans le prompt
    prompt = prompt_data["content"].format(schema=schema)

    try:
        # Appeler le LLM
        response = call_llm(
            prompt=prompt,
            system_prompt="Tu es un expert en analyse de données.",
            source="catalog",
            temperature=0.7  # Un peu de créativité pour varier les questions
        )

        # Parser la réponse JSON
        content = response.content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines).strip()

        result = json.loads(content)
        questions = result.get("questions", [])

        print(f"    → {len(questions)} questions générées")
        return questions

    except Exception as e:
        print(f"    [ERROR] Génération questions: {e}")
        return []


def save_suggested_questions(questions: list[dict[str, str]]) -> dict[str, int]:
    """
    Sauvegarde les questions suggérées dans SQLite.

    Args:
        questions: Liste de questions avec category et icon

    Returns:
        Stats de sauvegarde
    """
    if not questions:
        return {"questions": 0}

    conn = get_connection()
    cursor = conn.cursor()

    stats = {"questions": 0}

    # Vider les anciennes questions
    cursor.execute("DELETE FROM suggested_questions")

    # Insérer les nouvelles
    for i, q in enumerate(questions):
        try:
            cursor.execute("""
                INSERT INTO suggested_questions (question, category, icon, display_order, is_enabled)
                VALUES (?, ?, ?, ?, 1)
            """, (q.get("question"), q.get("category"), q.get("icon"), i))
            stats["questions"] += 1
        except Exception as e:
            print(f"    [WARN] Erreur sauvegarde question: {e}")

    conn.commit()
    conn.close()
    return stats


# =============================================================================
# FONCTION EXTRACTION SEULE (ÉTAPE 1 - SANS LLM)
# =============================================================================

def extract_only(db_connection: Any, job_id: int | None = None) -> dict[str, Any]:
    """
    Extrait le schéma depuis DuckDB et sauvegarde dans SQLite SANS enrichissement LLM.

    Les tables sont créées avec is_enabled=1 par défaut.
    L'utilisateur peut ensuite désactiver les tables non souhaitées.

    Args:
        db_connection: Connexion DuckDB native
        job_id: ID du job pour le tracking (optionnel)

    Returns:
        Stats d'extraction (tables, colonnes)
    """
    print("EXTRACTION SEULE (sans LLM)...")

    # Initialiser le workflow si job_id fourni
    workflow = WorkflowManager(job_id, total_steps=2) if job_id else None

    # Step 1: Extraction métadonnées
    with workflow.step("extract_metadata") if workflow else _dummy_context():
        print("1/2 - Extraction des métadonnées depuis DuckDB...")
        catalog = extract_metadata_from_connection(db_connection)
        print(f"    → {len(catalog.tables)} tables, {sum(len(t.columns) for t in catalog.tables)} colonnes")

    # Step 2: Sauvegarde dans SQLite
    with workflow.step("save_to_catalog") if workflow else _dummy_context():
        print("2/2 - Sauvegarde dans SQLite (sans descriptions)...")

        # Créer la datasource
        datasource_id = add_datasource(
            name=catalog.datasource.replace(".duckdb", ""),
            ds_type="duckdb",
            path=get_duckdb_path(),
            description="Base analytique - En attente d'enrichissement"
        )

        if datasource_id is None:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM datasources WHERE name = ?",
                (catalog.datasource.replace(".duckdb", ""),)
            )
            row = cursor.fetchone()
            datasource_id = row["id"] if row else None
            conn.close()

        if datasource_id is None:
            raise ValueError("Impossible de créer la datasource")

        stats = {"tables": 0, "columns": 0}

        for table in catalog.tables:
            # Créer la table SANS description (sera enrichie plus tard)
            table_id = add_table(
                datasource_id=datasource_id,
                name=table.name,
                description=None,  # Pas de description pour l'instant
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
                table_id = row["id"] if row else None
                conn.close()

            if table_id:
                stats["tables"] += 1

                for col in table.columns:
                    # Construire le full_context pour cette colonne (stats complètes)
                    full_context = build_column_full_context(col)

                    # Créer la colonne SANS description mais AVEC full_context
                    column_id = add_column(
                        table_id=table_id,
                        name=col.name,
                        data_type=col.data_type,
                        description=None,  # Sera enrichi par LLM plus tard
                        sample_values=", ".join(col.sample_values) if col.sample_values else None,
                        value_range=col.value_range,
                        is_primary_key=col.is_primary_key,
                        full_context=full_context if full_context else None
                    )

                    if column_id:
                        stats["columns"] += 1

        print(f"    → {stats['tables']} tables, {stats['columns']} colonnes extraites")
    print("\n[INFO] Vous pouvez maintenant désactiver les tables non souhaitées,")
    print("       puis lancer l'enrichissement LLM sur les tables activées.")

    return {
        "status": "ok",
        "message": f"Extraction terminée: {stats['tables']} tables extraites",
        "stats": stats,
        "datasource": catalog.datasource.replace(".duckdb", ""),
        "tables": [t.name for t in catalog.tables]
    }


# =============================================================================
# FONCTION ENRICHISSEMENT (ÉTAPE 2 - LLM SUR TABLES ACTIVÉES)
# =============================================================================

def enrich_selected_tables(
    table_ids: list[int],
    db_connection: Any,
    job_id: int | None = None
) -> dict[str, Any]:
    """
    Enrichit les tables sélectionnées par l'utilisateur.

    1. Met à jour is_enabled dans SQLite (1 pour sélectionnées, 0 pour les autres)
    2. Lit le full_context depuis SQLite (calculé à l'extraction)
    3. Enrichit les tables sélectionnées avec LLM
    4. Génère les KPIs

    Args:
        table_ids: Liste des IDs des tables à enrichir
        db_connection: Connexion DuckDB native (pour KPIs uniquement)
        job_id: ID du job pour le tracking (optionnel)

    Returns:
        Stats d'enrichissement + validation
    """
    print("ENRICHISSEMENT LLM (tables sélectionnées)...")

    if not table_ids:
        return {
            "status": "error",
            "message": "Aucune table sélectionnée.",
            "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0}
        }

    # Calculer nombre de steps dynamiquement
    max_batch_setting = get_setting("max_tables_per_batch")
    max_tables_per_batch = int(max_batch_setting) if max_batch_setting else 4
    num_batches = (len(table_ids) + max_tables_per_batch - 1) // max_tables_per_batch
    # Steps: update_enabled + fetch_tables + N*llm_batch + save_descriptions + generate_kpis + generate_questions
    total_steps = 2 + num_batches + 3

    # Initialiser le workflow si job_id fourni
    workflow = WorkflowManager(job_id, total_steps=total_steps) if job_id else None

    # Step 1: Mettre à jour l'état is_enabled dans SQLite
    with workflow.step("update_enabled") if workflow else _dummy_context():
        print("1/N - Mise à jour des états is_enabled...")
        conn = get_connection()
        cursor = conn.cursor()

        # Désactiver toutes les tables
        cursor.execute("UPDATE tables SET is_enabled = 0")

        # Activer seulement les tables sélectionnées
        placeholders = ",".join("?" * len(table_ids))
        cursor.execute(
            f"UPDATE tables SET is_enabled = 1 WHERE id IN ({placeholders})",  # noqa: S608
            table_ids,
        )
        conn.commit()

        print(f"    → {len(table_ids)} tables activées")

    # Step 2: Récupérer les tables sélectionnées + nom datasource
    with workflow.step("fetch_tables") if workflow else _dummy_context():
        print("2/N - Récupération des tables sélectionnées...")
        cursor.execute(f"""
            SELECT t.id, t.name, t.row_count, d.id as datasource_id, d.name as datasource_name
            FROM tables t
            JOIN datasources d ON t.datasource_id = d.id
            WHERE t.id IN ({placeholders})
        """, table_ids)  # noqa: S608
        selected_tables = cursor.fetchall()

        # Récupérer le nom de la datasource (même pour toutes les tables)
        datasource_name = selected_tables[0]["datasource_name"] if selected_tables else "DuckDB"
        conn.close()

        if not selected_tables:
            return {
                "status": "error",
                "message": "Aucune table trouvée avec les IDs fournis.",
                "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0}
            }

        print(f"    → {len(selected_tables)} tables à enrichir")

    # Suite: construire le catalogue et enrichir
    return _enrich_tables(selected_tables, db_connection, workflow, datasource_name)


def enrich_enabled_tables(
    db_connection: Any
) -> dict[str, Any]:
    """
    [LEGACY] Enrichit SEULEMENT les tables avec is_enabled=1.

    Lit le full_context depuis SQLite (calculé à l'extraction).

    Génère:
    - Descriptions de tables et colonnes
    - Synonymes pour la recherche NLP
    - KPIs (basés sur les tables activées)

    Args:
        db_connection: Connexion DuckDB native (pour KPIs uniquement)

    Returns:
        Stats d'enrichissement + validation
    """
    print("ENRICHISSEMENT LLM (tables activées uniquement)...")

    # 1. Récupérer les tables activées depuis SQLite
    print("1/4 - Récupération des tables activées...")
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT t.id, t.name, t.row_count, d.id as datasource_id
        FROM tables t
        JOIN datasources d ON t.datasource_id = d.id
        WHERE t.is_enabled = 1
    """)
    enabled_tables = cursor.fetchall()
    conn.close()

    if not enabled_tables:
        return {
            "status": "error",
            "message": "Aucune table activée. Activez au moins une table avant l'enrichissement.",
            "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0}
        }

    return _enrich_tables(enabled_tables, db_connection)


def _enrich_tables(
    tables_rows: list,
    db_connection: Any,
    workflow: "WorkflowManager | None" = None,
    datasource_name: str = "DuckDB"
) -> dict[str, Any]:
    """
    Fonction interne d'enrichissement.

    Lit le full_context depuis SQLite (calculé à l'extraction) au lieu de
    recalculer les stats depuis DuckDB.

    Enrichit par lots de max_tables_per_batch tables pour éviter l'erreur
    "too many states" de Vertex AI avec les réponses structurées.

    Args:
        tables_rows: Résultat SQL des tables à enrichir
        db_connection: Connexion DuckDB (pour les KPIs uniquement)
        workflow: WorkflowManager pour tracking (optionnel)

    Returns:
        Stats d'enrichissement
    """
    # Limite de tables par batch pour éviter les erreurs Vertex AI
    # Lire depuis settings (défaut: 15)
    max_batch_setting = get_setting("max_tables_per_batch")
    max_tables_per_batch = int(max_batch_setting) if max_batch_setting else 15

    # Lire toutes les colonnes avec full_context depuis SQLite
    conn = get_connection()
    cursor = conn.cursor()

    all_tables_metadata = []
    all_tables_info = []  # (table_metadata, context_part)

    for table_row in tables_rows:
        table_id = table_row["id"]
        table_name = table_row["name"]
        row_count = table_row["row_count"] or 0

        # Récupérer les colonnes depuis SQLite (avec full_context)
        cursor.execute("""
            SELECT name, data_type, full_context, sample_values, value_range
            FROM columns
            WHERE table_id = ?
            ORDER BY id
        """, (table_id,))
        columns_rows = cursor.fetchall()

        print(f"    → Lecture depuis SQLite: {table_name} ({len(columns_rows)} colonnes)")

        # Construire le contexte pour cette table
        cols_desc = []
        columns_result = []

        for col_row in columns_rows:
            col_name = col_row["name"]
            col_type = col_row["data_type"]
            full_context = col_row["full_context"] or ""

            # Ligne de contexte pour le LLM
            col_line = f"  - {col_name} ({col_type})"
            if full_context:
                col_line += f" {full_context}"
            cols_desc.append(col_line)

            # Créer un ColumnMetadata minimal pour le modèle de réponse
            columns_result.append(ColumnMetadata(
                name=col_name,
                data_type=col_type,
                sample_values=col_row["sample_values"].split(", ") if col_row["sample_values"] else [],
                value_range=col_row["value_range"]
            ))

        context_part = f"""
Table: {table_name} ({row_count:,} lignes)
Colonnes:
{chr(10).join(cols_desc)}
"""

        table_metadata = TableMetadata(
            name=table_name,
            row_count=row_count,
            columns=columns_result
        )

        all_tables_metadata.append(table_metadata)
        all_tables_info.append((table_metadata, context_part))

    conn.close()

    # Diviser en batches
    batches = []
    for i in range(0, len(all_tables_info), max_tables_per_batch):
        batch = all_tables_info[i:i + max_tables_per_batch]
        batches.append(batch)

    print(f"Enrichissement avec LLM ({len(batches)} batch(es) de {max_tables_per_batch} tables max)...")

    # Enrichir par batch
    all_enrichments = {}
    all_validations = []

    for batch_idx, batch in enumerate(batches):
        batch_tables = [info[0] for info in batch]
        batch_context = chr(10).join([info[1] for info in batch])

        # Step N: LLM Batch N
        with workflow.step(f"llm_batch_{batch_idx + 1}") if workflow else _dummy_context():
            print(f"    → Batch {batch_idx + 1}/{len(batches)}: {[t.name for t in batch_tables]}")

            batch_catalog = ExtractedCatalog(
                datasource="g7_analytics.duckdb",
                tables=batch_tables
            )

            # Enrichissement LLM pour ce batch avec gestion d'erreur
            try:
                batch_enrichment = enrich_with_llm(batch_catalog, tables_context=batch_context)
            except Exception as e:
                error_msg = str(e).lower()
                # Détecter l'erreur Vertex AI "too many states"
                if "too many states" in error_msg or "constraint" in error_msg:
                    total_cols = sum(len(t.columns) for t in batch_tables)
                    return {
                        "status": "error",
                        "error_type": "vertex_ai_schema_too_complex",
                        "message": (
                            f"Erreur Vertex AI: schéma trop complexe ({len(batch_tables)} tables, {total_cols} colonnes). "
                            f"Réduisez 'Batch Size' dans Settings > Database (actuel: {max_tables_per_batch})."
                        ),
                        "suggestion": f"Essayez avec max_tables_per_batch = {max(1, max_tables_per_batch // 2)}",
                        "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0}
                    }
                # Autres erreurs LLM
                return {
                    "status": "error",
                    "error_type": "llm_error",
                    "message": f"Erreur LLM lors du batch {batch_idx + 1}: {e!s}",
                    "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0}
                }

            # Fusionner les enrichissements
            all_enrichments.update(batch_enrichment)

            # Validation du batch
            batch_validation = validate_catalog_enrichment(batch_catalog, batch_enrichment)
            all_validations.append(batch_validation)

    # Créer le catalogue complet pour les stats
    full_catalog = ExtractedCatalog(
        datasource="g7_analytics.duckdb",
        tables=all_tables_metadata
    )

    # Résumé des validations
    total_issues = sum(len(v.issues) for v in all_validations)
    if total_issues == 0:
        print("    → Validation: [OK]")
    else:
        print(f"    → Validation: [WARNING] {total_issues} problèmes")

    # Step: Mise à jour des descriptions dans SQLite
    with workflow.step("save_descriptions") if workflow else _dummy_context():
        print("Mise à jour des descriptions...")
        stats = update_descriptions(full_catalog, all_enrichments)
        print(f"    → {stats['tables']} tables, {stats['columns']} colonnes, {stats['synonyms']} synonymes")

    # Step: Génération des KPIs
    with workflow.step("generate_kpis") if workflow else _dummy_context():
        print("Génération des KPIs...")
        kpis_result = generate_kpis(full_catalog, db_connection)
        if kpis_result:
            kpis_stats = save_kpis(kpis_result)
            stats["kpis"] = kpis_stats["kpis"]
            print(f"    → {kpis_stats['kpis']} KPIs générés")
        else:
            stats["kpis"] = 0
            print("    → KPIs non générés")

    # Step: Génération des questions suggérées
    with workflow.step("generate_questions") if workflow else _dummy_context():
        print("Génération des questions suggérées...")
        questions = generate_suggested_questions(full_catalog)
        if questions:
            questions_stats = save_suggested_questions(questions)
            stats["questions"] = questions_stats["questions"]
            print(f"    → {questions_stats['questions']} questions générées")
        else:
            stats["questions"] = 0
            print("    → Questions non générées")

    # Fusionner les validations pour le retour
    combined_validation = CatalogValidationResult()
    combined_validation.tables_ok = sum(v.tables_ok for v in all_validations)
    combined_validation.tables_warning = sum(v.tables_warning for v in all_validations)
    combined_validation.columns_ok = sum(v.columns_ok for v in all_validations)
    combined_validation.columns_warning = sum(v.columns_warning for v in all_validations)
    combined_validation.synonyms_total = sum(v.synonyms_total for v in all_validations)
    combined_validation.issues = [issue for v in all_validations for issue in v.issues]

    return {
        "status": "ok",
        "message": f"Enrichissement terminé: {stats['tables']} tables enrichies",
        "stats": stats,
        "datasource": datasource_name,
        "validation": combined_validation.to_dict()
    }


def update_descriptions(catalog: ExtractedCatalog, enrichment: dict[str, Any]) -> dict[str, int]:
    """
    Met à jour les descriptions des tables et colonnes existantes.
    Utilise une seule connexion pour éviter les deadlocks SQLite.
    """
    conn = get_connection()
    cursor = conn.cursor()

    stats = {"tables": 0, "columns": 0, "synonyms": 0}

    for table in catalog.tables:
        table_enrichment = enrichment.get(table.name, {})
        table_description = table_enrichment.get("description")
        columns_enrichment = table_enrichment.get("columns", {})

        # Mettre à jour la description de la table
        if table_description:
            cursor.execute("""
                UPDATE tables SET description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE name = ?
            """, (table_description, table.name))
            if cursor.rowcount > 0:
                stats["tables"] += 1

        # Récupérer l'ID de la table
        cursor.execute("SELECT id FROM tables WHERE name = ?", (table.name,))
        table_row = cursor.fetchone()
        if not table_row:
            continue
        table_id = table_row["id"]

        # Mettre à jour les colonnes
        for col in table.columns:
            col_enrichment = columns_enrichment.get(col.name, {})
            col_description = col_enrichment.get("description")
            synonyms = col_enrichment.get("synonyms", [])

            if col_description:
                cursor.execute("""
                    UPDATE columns SET description = ?
                    WHERE table_id = ? AND name = ?
                """, (col_description, table_id, col.name))
                if cursor.rowcount > 0:
                    stats["columns"] += 1

            # Ajouter les synonymes (directement, sans ouvrir une nouvelle connexion)
            if synonyms:
                cursor.execute("""
                    SELECT id FROM columns WHERE table_id = ? AND name = ?
                """, (table_id, col.name))
                col_row = cursor.fetchone()
                if col_row:
                    column_id = col_row["id"]
                    for synonym in synonyms:
                        with suppress(Exception):
                            cursor.execute(
                                "INSERT INTO synonyms (column_id, term) VALUES (?, ?)",
                                (column_id, synonym)
                            )
                            stats["synonyms"] += 1

    conn.commit()
    conn.close()
    return stats


# =============================================================================
# FONCTION PRINCIPALE: GÉNÉRATION COMPLÈTE (LEGACY - GARDE POUR COMPAT)
# =============================================================================

def generate_catalog_from_connection(
    db_connection: Any,
    prompt_mode: PromptMode = "full"
) -> dict[str, Any]:
    """
    Génère le catalogue complet depuis une connexion DuckDB existante.

    Utilise le LLM configuré par défaut via llm_service.

    Args:
        db_connection: Connexion DuckDB native (duckdb.DuckDBPyConnection)
        prompt_mode: Mode de prompt ("compact" ou "full")

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
    enrichment = enrich_with_llm(catalog, prompt_mode=prompt_mode)

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
    stats = save_to_catalog(catalog, enrichment, get_duckdb_path())
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
