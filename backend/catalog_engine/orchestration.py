"""
Orchestration des workflows catalog_engine.

Contient:
- extract_only(): Extraction métadonnées depuis DuckDB sans LLM
- enrich_selected_tables(): Enrichissement LLM des tables sélectionnées
- _enrich_tables(): Moteur d'enrichissement interne par batch
"""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from catalog import WorkflowManager, add_column, add_datasource, add_table, get_setting
from db import get_connection
from llm_utils import KpiGenerationError, QuestionGenerationError
from type_defs import DuckDBConnection

from .enrichment import enrich_with_llm, validate_catalog_enrichment
from .extraction import build_column_full_context, extract_metadata_from_connection
from .kpis import generate_kpis, save_kpis
from .models import (
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    TableMetadata,
)
from .persistence import get_duckdb_path, update_descriptions
from .questions import generate_suggested_questions, save_suggested_questions

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# =============================================================================
# UTILITAIRES INTERNES
# =============================================================================


@contextmanager
def _dummy_context() -> Generator[None, None, None]:
    """Context manager vide pour compatibilité quand job_id est None."""
    yield


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
            f"UPDATE tables SET is_enabled = 1 WHERE id IN ({placeholders})",
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
        """,
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


def _load_tables_context(
    tables_rows: list[Any],
) -> list[tuple[TableMetadata, str]]:
    """
    Charge le contexte des tables depuis SQLite.

    Lit le full_context (calculé à l'extraction) au lieu de recalculer
    les statistiques depuis DuckDB.

    Args:
        tables_rows: Résultat SQL des tables à enrichir

    Returns:
        Liste de tuples (TableMetadata, context_string)
    """
    conn = get_connection()
    cursor = conn.cursor()
    tables_info: list[tuple[TableMetadata, str]] = []

    for table_row in tables_rows:
        table_id = table_row["id"]
        table_name = table_row["name"]
        row_count = table_row["row_count"] or 0

        # Récupérer les colonnes depuis SQLite (avec full_context)
        cursor.execute(
            """
            SELECT name, data_type, full_context, sample_values, value_range
            FROM columns WHERE table_id = ? ORDER BY id
            """,
            (table_id,),
        )
        columns_rows = cursor.fetchall()
        logger.info("  Lecture depuis SQLite: %s (%d colonnes)", table_name, len(columns_rows))

        # Construire le contexte et les métadonnées
        cols_desc = []
        columns_result = []

        for col_row in columns_rows:
            col_name = col_row["name"]
            col_type = col_row["data_type"]
            full_context = col_row["full_context"] or ""

            col_line = f"  - {col_name} ({col_type})"
            if full_context:
                col_line += f" {full_context}"
            cols_desc.append(col_line)

            columns_result.append(
                ColumnMetadata(
                    name=col_name,
                    data_type=col_type,
                    sample_values=col_row["sample_values"].split(", ") if col_row["sample_values"] else [],
                    value_range=col_row["value_range"],
                )
            )

        context_part = f"\nTable: {table_name} ({row_count:,} lignes)\nColonnes:\n{chr(10).join(cols_desc)}\n"
        table_metadata = TableMetadata(name=table_name, row_count=row_count, columns=columns_result)
        tables_info.append((table_metadata, context_part))

    conn.close()
    return tables_info


def _run_llm_batches(
    tables_info: list[tuple[TableMetadata, str]],
    workflow: "WorkflowManager | None",
    max_tables_per_batch: int,
) -> tuple[dict[str, Any], list[CatalogValidationResult]] | dict[str, Any]:
    """
    Enrichit les tables par batch avec gestion des erreurs Vertex AI.

    Args:
        tables_info: Liste de (TableMetadata, context_string)
        workflow: WorkflowManager pour tracking (optionnel)
        max_tables_per_batch: Nombre max de tables par batch

    Returns:
        Tuple (enrichments_dict, validations_list) ou dict erreur
    """
    # Diviser en batches
    batches = [
        tables_info[i : i + max_tables_per_batch]
        for i in range(0, len(tables_info), max_tables_per_batch)
    ]

    logger.info(
        "Enrichissement avec LLM (%d batch(es) de %d tables max)",
        len(batches),
        max_tables_per_batch,
    )

    all_enrichments: dict[str, Any] = {}
    all_validations: list[CatalogValidationResult] = []

    for batch_idx, batch in enumerate(batches):
        batch_tables = [info[0] for info in batch]
        batch_context = chr(10).join([info[1] for info in batch])

        with workflow.step(f"llm_batch_{batch_idx + 1}") if workflow else _dummy_context():
            logger.info("  Batch %d/%d: %s", batch_idx + 1, len(batches), [t.name for t in batch_tables])
            batch_catalog = ExtractedCatalog(datasource="g7_analytics.duckdb", tables=batch_tables)

            try:
                batch_enrichment = enrich_with_llm(batch_catalog, tables_context=batch_context)
            except Exception as e:
                error_msg = str(e).lower()
                if "too many states" in error_msg or "constraint" in error_msg:
                    total_cols = sum(len(t.columns) for t in batch_tables)
                    return {
                        "status": "error",
                        "error_type": "vertex_ai_schema_too_complex",
                        "message": (
                            f"Erreur Vertex AI: schéma trop complexe ({len(batch_tables)} tables, "
                            f"{total_cols} colonnes). Réduisez 'Batch Size' dans Settings > Database "
                            f"(actuel: {max_tables_per_batch})."
                        ),
                        "suggestion": f"Essayez avec max_tables_per_batch = {max(1, max_tables_per_batch // 2)}",
                        "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
                    }
                return {
                    "status": "error",
                    "error_type": "llm_error",
                    "message": f"Erreur LLM lors du batch {batch_idx + 1}: {e!s}",
                    "stats": {"tables": 0, "columns": 0, "synonyms": 0, "kpis": 0},
                }

            all_enrichments.update(batch_enrichment)
            batch_validation = validate_catalog_enrichment(batch_catalog, batch_enrichment)
            all_validations.append(batch_validation)

    return all_enrichments, all_validations


def _persist_enrichments(
    tables_info: list[tuple[TableMetadata, str]],
    enrichments: dict[str, Any],
    workflow: "WorkflowManager | None",
) -> dict[str, int | str]:
    """
    Sauvegarde les descriptions enrichies dans SQLite.

    Args:
        tables_info: Liste de (TableMetadata, context_string)
        enrichments: Dictionnaire des enrichissements LLM
        workflow: WorkflowManager pour tracking (optionnel)

    Returns:
        Stats dict avec tables, columns, synonyms
    """
    all_tables_metadata = [info[0] for info in tables_info]
    full_catalog = ExtractedCatalog(datasource="g7_analytics.duckdb", tables=all_tables_metadata)

    with workflow.step("save_descriptions") if workflow else _dummy_context():
        logger.info("Mise à jour des descriptions")
        desc_stats = update_descriptions(full_catalog, enrichments)
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

    return stats


def _generate_artifacts(
    tables_info: list[tuple[TableMetadata, str]],
    db_connection: DuckDBConnection,
    stats: dict[str, int | str],
    workflow: "WorkflowManager | None",
) -> dict[str, int | str]:
    """
    Génère les KPIs et questions suggérées.

    Args:
        tables_info: Liste de (TableMetadata, context_string)
        db_connection: Connexion DuckDB pour les KPIs
        stats: Stats existantes à enrichir
        workflow: WorkflowManager pour tracking (optionnel)

    Returns:
        Stats enrichies avec kpis et questions
    """
    all_tables_metadata = [info[0] for info in tables_info]
    full_catalog = ExtractedCatalog(datasource="g7_analytics.duckdb", tables=all_tables_metadata)

    # Génération des KPIs
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

    # Génération des questions suggérées
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

    return stats


def _build_enrichment_response(
    stats: dict[str, int | str],
    validations: list[CatalogValidationResult],
    datasource_name: str,
) -> dict[str, Any]:
    """
    Construit la réponse finale d'enrichissement.

    Args:
        stats: Statistiques d'enrichissement
        validations: Liste des résultats de validation par batch
        datasource_name: Nom de la datasource

    Returns:
        Réponse formatée pour l'API
    """
    # Log du résumé des validations
    total_issues = sum(len(v.issues) for v in validations)
    if total_issues == 0:
        logger.info("  Validation: [OK]")
    else:
        logger.warning("  Validation: %d problèmes", total_issues)

    # Fusionner les validations
    combined_validation = CatalogValidationResult()
    combined_validation.tables_ok = sum(v.tables_ok for v in validations)
    combined_validation.tables_warning = sum(v.tables_warning for v in validations)
    combined_validation.columns_ok = sum(v.columns_ok for v in validations)
    combined_validation.columns_warning = sum(v.columns_warning for v in validations)
    combined_validation.synonyms_total = sum(v.synonyms_total for v in validations)
    combined_validation.issues = [issue for v in validations for issue in v.issues]

    return {
        "status": "ok",
        "message": f"Enrichissement terminé: {stats['tables']} tables enrichies",
        "stats": stats,
        "datasource": datasource_name,
        "validation": combined_validation.to_dict(),
    }


def _enrich_tables(
    tables_rows: list[Any],
    db_connection: DuckDBConnection,
    workflow: "WorkflowManager | None" = None,
    datasource_name: str = "DuckDB",
) -> dict[str, Any]:
    """
    Fonction interne d'enrichissement (orchestration).

    Coordonne les 4 étapes:
    1. Chargement du contexte depuis SQLite
    2. Enrichissement LLM par batches
    3. Persistance des descriptions
    4. Génération des artefacts (KPIs, questions)

    Args:
        tables_rows: Résultat SQL des tables à enrichir
        db_connection: Connexion DuckDB (pour les KPIs uniquement)
        workflow: WorkflowManager pour tracking (optionnel)
        datasource_name: Nom de la datasource pour le retour

    Returns:
        Stats d'enrichissement
    """
    # Configuration batch
    max_batch_setting = get_setting("max_tables_per_batch")
    max_tables_per_batch = int(max_batch_setting) if max_batch_setting else 15

    # 1. Charger le contexte des tables
    tables_info = _load_tables_context(tables_rows)

    # 2. Enrichir par batches
    result = _run_llm_batches(tables_info, workflow, max_tables_per_batch)
    if isinstance(result, dict):
        # Erreur retournée
        return result
    enrichments, validations = result

    # 3. Persister les enrichissements
    stats = _persist_enrichments(tables_info, enrichments, workflow)

    # 4. Générer les artefacts
    stats = _generate_artifacts(tables_info, db_connection, stats, workflow)

    # 5. Construire la réponse
    return _build_enrichment_response(stats, validations, datasource_name)
