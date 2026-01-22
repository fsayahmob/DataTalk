"""
Persistence du catalogue dans SQLite.

Sauvegarde et mise à jour des descriptions, synonymes.
Chargement du contexte des tables pour enrichissement.
"""

import logging
from contextlib import suppress
from typing import Any

from catalog import add_column, add_datasource, add_synonym, add_table
from db import get_connection

from .models import ColumnMetadata, ExtractedCatalog, TableMetadata

logger = logging.getLogger(__name__)


def save_to_catalog(
    catalog: ExtractedCatalog, enrichment: dict[str, Any], db_path: str | None = None
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
        description="Base analytique générée automatiquement",
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
                    is_primary_key=col.is_primary_key,
                )

                if column_id is None:
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT id FROM columns WHERE table_id = ? AND name = ?",
                        (table_id, col.name),
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
            cursor.execute(
                """
                UPDATE tables SET description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE name = ?
            """,
                (table_description, table.name),
            )
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
                cursor.execute(
                    """
                    UPDATE columns SET description = ?
                    WHERE table_id = ? AND name = ?
                """,
                    (col_description, table_id, col.name),
                )
                if cursor.rowcount > 0:
                    stats["columns"] += 1

            # Ajouter les synonymes (directement, sans ouvrir une nouvelle connexion)
            if synonyms:
                cursor.execute(
                    """
                    SELECT id FROM columns WHERE table_id = ? AND name = ?
                """,
                    (table_id, col.name),
                )
                col_row = cursor.fetchone()
                if col_row:
                    column_id = col_row["id"]
                    for synonym in synonyms:
                        with suppress(Exception):
                            cursor.execute(
                                "INSERT INTO synonyms (column_id, term) VALUES (?, ?)",
                                (column_id, synonym),
                            )
                            stats["synonyms"] += 1

    conn.commit()
    conn.close()
    return stats


def load_tables_context(
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
                    sample_values=col_row["sample_values"].split(", ")
                    if col_row["sample_values"]
                    else [],
                    value_range=col_row["value_range"],
                )
            )

        context_part = (
            f"\nTable: {table_name} ({row_count:,} lignes)\nColonnes:\n{chr(10).join(cols_desc)}\n"
        )
        table_metadata = TableMetadata(name=table_name, row_count=row_count, columns=columns_result)
        tables_info.append((table_metadata, context_part))

    conn.close()
    return tables_info
