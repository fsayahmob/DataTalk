"""
Moteur de génération de catalogue.

Architecture:
1. extract_metadata_from_connection() - DuckDB native
2. build_response_model() - Pydantic create_model()
3. enrich_with_llm() - llm_service.call_llm_structured()
4. save_to_catalog() - SQLite update
5. generate_kpis() - Génération des 4 KPIs

Ce module réexporte toutes les fonctions et classes publiques
pour maintenir la compatibilité avec l'ancien catalog_engine.py.
"""

from typing import TYPE_CHECKING

# Réexports depuis les sous-modules
from .enrichment import (
    PromptNotConfiguredError,
    build_response_model,
    check_token_limit,
    enrich_with_llm,
    estimate_tokens,
    validate_catalog_enrichment,
)
from .extraction import (
    COMMON_PATTERNS,
    build_column_full_context,
    detect_pattern,
    extract_column_stats,
    extract_metadata_from_connection,
)
from .kpis import (
    generate_kpis,
    get_data_period,
    save_kpis,
    validate_all_kpis,
    validate_kpi,
)
from .models import (
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    KpiValidationResult,
    TableMetadata,
    ValueFrequency,
)
from .persistence import (
    DEFAULT_DB_PATH,
    get_duckdb_path,
    save_to_catalog,
    update_descriptions,
)
from .questions import generate_suggested_questions, save_suggested_questions

if TYPE_CHECKING:
    pass

# Type alias pour le mode de prompt
PromptMode = str  # "compact" ou "full"

# Réexports depuis orchestration (workflows complexes)
from .orchestration import enrich_selected_tables, extract_only


# =============================================================================
# EXPORTS PUBLICS
# =============================================================================

__all__ = [
    # Extraction
    "COMMON_PATTERNS",
    # Persistence
    "DEFAULT_DB_PATH",
    "CatalogValidationResult",
    "ColumnMetadata",
    "ExtractedCatalog",
    "KpiDefinition",
    "KpiValidationResult",
    "KpisGenerationResult",
    "PromptMode",
    "PromptNotConfiguredError",
    "TableMetadata",
    # Models
    "ValueFrequency",
    "build_column_full_context",
    "build_response_model",
    "check_token_limit",
    "detect_pattern",
    "enrich_selected_tables",
    "enrich_with_llm",
    # Enrichment
    "estimate_tokens",
    "extract_column_stats",
    "extract_metadata_from_connection",
    # Orchestration
    "extract_only",
    "generate_kpis",
    # Questions
    "generate_suggested_questions",
    "get_data_period",
    "get_duckdb_path",
    "save_kpis",
    "save_suggested_questions",
    "save_to_catalog",
    "update_descriptions",
    "validate_all_kpis",
    "validate_catalog_enrichment",
    # KPIs
    "validate_kpi",
]
