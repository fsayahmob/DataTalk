"""
Enrichissement LLM du catalogue.

Appels LLM pour descriptions, modèle de réponse dynamique, validation.
"""

from typing import Any

from pydantic import BaseModel, Field, create_model

from llm_config import get_active_prompt
from llm_service import call_llm_structured
from llm_utils import EnrichmentError, call_with_retry

from .models import CatalogValidationResult, ColumnMetadata, ExtractedCatalog


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
        return (
            False,
            token_count,
            f"Prompt trop long: {token_count:,} tokens (max: {max_input_tokens:,})",
        )
    if token_count > max_input_tokens * 0.8:
        return (True, token_count, f"Prompt volumineux: {token_count:,} tokens (80% de la limite)")
    return (True, token_count, f"OK: {token_count:,} tokens")


# =============================================================================
# EXCEPTIONS
# =============================================================================


class PromptNotConfiguredError(Exception):
    """Erreur levée quand un prompt n'est pas configuré en base."""

    def __init__(self, prompt_key: str):
        self.prompt_key = prompt_key
        super().__init__(f"Prompt '{prompt_key}' non configuré. Exécutez: python seed_prompts.py")


# =============================================================================
# CONSTRUCTION DU MODÈLE DE RÉPONSE DYNAMIQUE
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
                Field(description=f"Enrichissement pour la colonne {col.name}"),
            )

        ColumnsModel = create_model(  # type: ignore[call-overload] # noqa: N806
            f"{table.name}_Columns",
            **column_fields,
        )

        # Créer le modèle de la table
        TableModel = create_model(  # noqa: N806
            f"{table.name}_Enrichment",
            description=(str, Field(description=f"Description métier de la table {table.name}")),
            columns=(ColumnsModel, Field(description="Enrichissement des colonnes")),
        )

        table_models[table.name] = (
            TableModel,
            Field(description=f"Enrichissement de la table {table.name}"),
        )

    # Modèle global
    model: type[BaseModel] = create_model(  # type: ignore[call-overload]
        "CatalogEnrichment",
        **table_models,
    )
    return model


# =============================================================================
# CONSTRUCTION DU CONTEXTE POUR LE LLM
# =============================================================================


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
                stats_parts.append(f"{col.null_rate * 100:.1f}% NULL")
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
            if col.detected_pattern and col.pattern_match_rate is not None:
                col_info += f"\n      Pattern détecté: {col.detected_pattern} ({col.pattern_match_rate * 100:.0f}% match)"

            cols_desc.append(col_info)

        tables_context.append(f"""
Table: {table.name} ({table.row_count:,} lignes)
Colonnes:
{chr(10).join(cols_desc)}
""")

    return chr(10).join(tables_context)


# =============================================================================
# ENRICHISSEMENT LLM
# =============================================================================


def enrich_with_llm(
    catalog: ExtractedCatalog, tables_context: str | None = None, max_retries: int = 2
) -> dict[str, Any]:
    """
    Appelle le LLM via llm_service pour obtenir les descriptions avec retry.

    Args:
        catalog: Catalogue extrait à enrichir (pour construire le modèle de réponse)
        tables_context: Contexte pré-construit depuis SQLite (full_context).
                        Si None, utilise _build_full_context() (fallback).
        max_retries: Nombre de tentatives supplémentaires en cas d'échec

    Utilise call_llm_structured() qui gère:
    - Multi-provider (Gemini, OpenAI, Anthropic, etc.)
    - Instructor pour réponses structurées
    - Logging des coûts

    Raises:
        PromptNotConfiguredError: Si le prompt catalog_enrichment n'est pas en base.
        EnrichmentError: Si l'enrichissement échoue après tous les retries.
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
        raise EnrichmentError(f"Prompt trop volumineux pour le LLM: {token_count:,} tokens")

    def _call_enrichment_llm() -> dict[str, Any]:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=ResponseModel,
            source="catalog_engine",
            max_tokens=8192,
        )
        result_dict: dict[str, Any] = result.model_dump()
        # Vérifier qu'on a au moins une table avec des données
        if not result_dict or all(
            not table_data.get("description") and not table_data.get("columns")
            for table_data in result_dict.values()
        ):
            raise EnrichmentError("Enrichissement vide - aucune description générée")
        return result_dict

    return call_with_retry(
        _call_enrichment_llm,
        max_retries=max_retries,
        error_class=EnrichmentError,
        context="Enrichissement",
    )


# =============================================================================
# VALIDATION DE L'ENRICHISSEMENT
# =============================================================================


def validate_catalog_enrichment(
    catalog: ExtractedCatalog, enrichment: dict[str, Any]
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
