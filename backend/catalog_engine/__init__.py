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

import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from type_defs import DuckDBConnection

logger = logging.getLogger(__name__)

from catalog import WorkflowManager, add_column, add_datasource, add_table, get_setting
from db import get_connection
from llm_utils import KpiGenerationError, QuestionGenerationError

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


# =============================================================================
# UTILITAIRES INTERNES
# =============================================================================


@contextmanager
def _dummy_context() -> Generator[None, None, None]:
    """Context manager vide pour compatibilité quand job_id est None."""
    yield


# Type alias pour le mode de prompt
PromptMode = str  # "compact" ou "full"


# =============================================================================
# FONCTION EXTRACTION SEULE (ÉTAPE 1 - SANS LLM)
# =============================================================================


def extract_only(db_connection: DuckDBConnection, job_id: int | None = None) -> dict[str, Any]:
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
    logger.info("Extraction seule (sans LLM)")

    # Initialiser le workflow si job_id fourni
    workflow = WorkflowManager(job_id, total_steps=2) if job_id else None

    # Step 1: Extraction métadonnées
    with workflow.step("extract_metadata") if workflow else _dummy_context():
        logger.info("1/2 - Extraction des métadonnées depuis DuckDB")
        catalog = extract_metadata_from_connection(db_connection)
        logger.info(
            "  %d tables, %d colonnes",
            len(catalog.tables),
            sum(len(t.columns) for t in catalog.tables),
        )

    # Step 2: Sauvegarde dans SQLite
    with workflow.step("save_to_catalog") if workflow else _dummy_context():
        logger.info("2/2 - Sauvegarde dans SQLite (sans descriptions)")

        # Créer la datasource
        datasource_id = add_datasource(
            name=catalog.datasource.replace(".duckdb", ""),
            ds_type="duckdb",
            path=get_duckdb_path(),
            description="Base analytique - En attente d'enrichissement",
        )

        if datasource_id is None:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM datasources WHERE name = ?",
                (catalog.datasource.replace(".duckdb", ""),),
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
                row_count=table.row_count,
            )

            if table_id is None:
                conn = get_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id FROM tables WHERE datasource_id = ? AND name = ?",
                    (datasource_id, table.name),
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
                        full_context=full_context if full_context else None,
                    )

                    if column_id:
                        stats["columns"] += 1

        logger.info("  %d tables, %d colonnes extraites", stats["tables"], stats["columns"])
    logger.info("Vous pouvez maintenant désactiver les tables non souhaitées")
    logger.info("puis lancer l'enrichissement LLM sur les tables activées")

    return {
        "status": "ok",
        "message": f"Extraction terminée: {stats['tables']} tables extraites",
        "stats": stats,
        "datasource": catalog.datasource.replace(".duckdb", ""),
        "tables": [t.name for t in catalog.tables],
    }


# =============================================================================
# FONCTION ENRICHISSEMENT (ÉTAPE 2 - LLM SUR TABLES ACTIVÉES)
# =============================================================================


def enrich_selected_tables(
    table_ids: list[int], db_connection: DuckDBConnection, job_id: int | None = None
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
    logger.info("Enrichissement LLM (tables sélectionnées)")

    if not table_ids:
        return {
            "status": "error",
            "message": "Aucune table sélectionnée.",
            "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
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
        logger.info("1/N - Mise à jour des états is_enabled")
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

        logger.info("  %d tables activées", len(table_ids))

    # Step 2: Récupérer les tables sélectionnées + nom datasource
    with workflow.step("fetch_tables") if workflow else _dummy_context():
        logger.info("2/N - Récupération des tables sélectionnées")
        cursor.execute(
            f"""
            SELECT t.id, t.name, t.row_count, d.id as datasource_id, d.name as datasource_name
            FROM tables t
            JOIN datasources d ON t.datasource_id = d.id
            WHERE t.id IN ({placeholders})
        """,  # noqa: S608 - placeholders are sanitized integers from table_ids
            table_ids,
        )
        selected_tables = cursor.fetchall()

        # Récupérer le nom de la datasource (même pour toutes les tables)
        datasource_name = selected_tables[0]["datasource_name"] if selected_tables else "DuckDB"
        conn.close()

        if not selected_tables:
            return {
                "status": "error",
                "message": "Aucune table trouvée avec les IDs fournis.",
                "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
            }

        logger.info("  %d tables à enrichir", len(selected_tables))

    # Suite: construire le catalogue et enrichir
    return _enrich_tables(selected_tables, db_connection, workflow, datasource_name)


def _enrich_tables(
    tables_rows: list[Any],
    db_connection: DuckDBConnection,
    workflow: "WorkflowManager | None" = None,
    datasource_name: str = "DuckDB",
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
        cursor.execute(
            """
            SELECT name, data_type, full_context, sample_values, value_range
            FROM columns
            WHERE table_id = ?
            ORDER BY id
        """,
            (table_id,),
        )
        columns_rows = cursor.fetchall()

        logger.info("  Lecture depuis SQLite: %s (%d colonnes)", table_name, len(columns_rows))

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
            columns_result.append(
                ColumnMetadata(
                    name=col_name,
                    data_type=col_type,
                    sample_values=col_row["sample_values"].split(", ")
                    if col_row["sample_values"]
                    else [],
                    value_range=col_row["value_range"],
                )
            )

        context_part = f"""
Table: {table_name} ({row_count:,} lignes)
Colonnes:
{chr(10).join(cols_desc)}
"""

        table_metadata = TableMetadata(name=table_name, row_count=row_count, columns=columns_result)

        all_tables_metadata.append(table_metadata)
        all_tables_info.append((table_metadata, context_part))

    conn.close()

    # Diviser en batches
    batches = []
    for i in range(0, len(all_tables_info), max_tables_per_batch):
        batch = all_tables_info[i : i + max_tables_per_batch]
        batches.append(batch)

    logger.info(
        "Enrichissement avec LLM (%d batch(es) de %d tables max)",
        len(batches),
        max_tables_per_batch,
    )

    # Enrichir par batch
    all_enrichments = {}
    all_validations = []

    for batch_idx, batch in enumerate(batches):
        batch_tables = [info[0] for info in batch]
        batch_context = chr(10).join([info[1] for info in batch])

        # Step N: LLM Batch N
        with workflow.step(f"llm_batch_{batch_idx + 1}") if workflow else _dummy_context():
            logger.info("  Batch %d/%d: %s", batch_idx + 1, len(batches), [t.name for t in batch_tables])

            batch_catalog = ExtractedCatalog(datasource="g7_analytics.duckdb", tables=batch_tables)

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
                        "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
                    }
                # Autres erreurs LLM
                return {
                    "status": "error",
                    "error_type": "llm_error",
                    "message": f"Erreur LLM lors du batch {batch_idx + 1}: {e!s}",
                    "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
                }

            # Fusionner les enrichissements
            all_enrichments.update(batch_enrichment)

            # Validation du batch
            batch_validation = validate_catalog_enrichment(batch_catalog, batch_enrichment)
            all_validations.append(batch_validation)

    # Créer le catalogue complet pour les stats
    full_catalog = ExtractedCatalog(datasource="g7_analytics.duckdb", tables=all_tables_metadata)

    # Résumé des validations
    total_issues = sum(len(v.issues) for v in all_validations)
    if total_issues == 0:
        logger.info("  Validation: [OK]")
    else:
        logger.warning("  Validation: %d problèmes", total_issues)

    # Step: Mise à jour des descriptions dans SQLite
    with workflow.step("save_descriptions") if workflow else _dummy_context():
        logger.info("Mise à jour des descriptions")
        desc_stats = update_descriptions(full_catalog, all_enrichments)
        # Créer un dict flexible pour inclure potentiellement les erreurs
        stats: dict[str, int | str] = {
            "tables": desc_stats["tables"],
            "columns": desc_stats["columns"],
            "synonyms": desc_stats["synonyms"],
        }
        logger.info(
            "  %d tables, %d colonnes, %d synonymes",
            stats["tables"],
            stats["columns"],
            stats["synonyms"],
        )

    # Step: Génération des KPIs
    with workflow.step("generate_kpis") if workflow else _dummy_context():
        logger.info("Génération des KPIs")
        try:
            kpis_result = generate_kpis(full_catalog, db_connection)
            kpis_stats = save_kpis(kpis_result)
            stats["kpis"] = kpis_stats["kpis"]
            logger.info("  %d KPIs générés", kpis_stats["kpis"])
        except KpiGenerationError as e:
            stats["kpis"] = 0
            stats["kpis_error"] = str(e)
            logger.error("  KPIs non générés: %s", e)

    # Step: Génération des questions suggérées
    with workflow.step("generate_questions") if workflow else _dummy_context():
        logger.info("Génération des questions suggérées")
        try:
            questions = generate_suggested_questions(full_catalog)
            questions_stats = save_suggested_questions(questions)
            stats["questions"] = questions_stats["questions"]
            logger.info("  %d questions générées", questions_stats["questions"])
        except QuestionGenerationError as e:
            stats["questions"] = 0
            stats["questions_error"] = str(e)
            logger.error("  Questions non générées: %s", e)

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
        "validation": combined_validation.to_dict(),
    }


# =============================================================================
# FONCTION PRINCIPALE: GÉNÉRATION COMPLÈTE (LEGACY - GARDE POUR COMPAT)
# =============================================================================


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
