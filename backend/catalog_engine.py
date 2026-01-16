"""
Alias de compatibilité pour catalog_engine.

Ce fichier réexporte tout depuis le package catalog_engine/ pour maintenir
la compatibilité avec les imports existants:

    from catalog_engine import extract_metadata_from_connection
    # équivalent à:
    from catalog_engine import extract_metadata_from_connection

À terme, les imports directs depuis catalog_engine/ sont préférables:

    from catalog_engine.extraction import extract_metadata_from_connection
    from catalog_engine.models import ExtractedCatalog
"""

# Réexporter tout depuis le package
# Le package a priorité sur ce fichier grâce à Python import resolution
# Mais si ce fichier est importé directement, il délègue au package
from catalog_engine import (
    COMMON_PATTERNS,
    DEFAULT_DB_PATH,
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    KpiValidationResult,
    PromptMode,
    PromptNotConfiguredError,
    TableMetadata,
    ValueFrequency,
    build_column_full_context,
    build_response_model,
    check_token_limit,
    detect_pattern,
    enrich_enabled_tables,
    enrich_selected_tables,
    enrich_with_llm,
    estimate_tokens,
    extract_column_stats,
    extract_metadata_from_connection,
    extract_only,
    generate_catalog_from_connection,
    generate_kpis,
    generate_suggested_questions,
    get_data_period,
    get_duckdb_path,
    save_kpis,
    save_suggested_questions,
    save_to_catalog,
    update_descriptions,
    validate_all_kpis,
    validate_catalog_enrichment,
    validate_kpi,
)
