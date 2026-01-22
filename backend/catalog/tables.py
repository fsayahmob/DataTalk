"""
CRUD operations for tables, columns, and synonyms.
"""

from typing import Any

from db import get_connection


def add_table(
    datasource_id: int, name: str, description: str | None = None, row_count: int | None = None
) -> int | None:
    """Ajoute une table au catalogue."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO tables (datasource_id, name, description, row_count, updated_at)
        VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (datasource_id, name) DO UPDATE SET
            description = EXCLUDED.description,
            row_count = EXCLUDED.row_count,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    """,
        (datasource_id, name, description, row_count),
    )
    table_id = cursor.fetchone()["id"]
    conn.commit()
    conn.close()
    return table_id


def add_column(
    table_id: int,
    name: str,
    data_type: str,
    description: str | None = None,
    sample_values: str | None = None,
    value_range: str | None = None,
    is_primary_key: bool = False,
    full_context: str | None = None,
) -> int | None:
    """Ajoute une colonne au catalogue."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO columns
        (table_id, name, data_type, description, sample_values, value_range, is_primary_key, full_context, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (table_id, name) DO UPDATE SET
            data_type = EXCLUDED.data_type,
            description = EXCLUDED.description,
            sample_values = EXCLUDED.sample_values,
            value_range = EXCLUDED.value_range,
            is_primary_key = EXCLUDED.is_primary_key,
            full_context = EXCLUDED.full_context,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    """,
        (
            table_id,
            name,
            data_type,
            description,
            sample_values,
            value_range,
            is_primary_key,
            full_context,
        ),
    )
    column_id = cursor.fetchone()["id"]
    conn.commit()
    conn.close()
    return column_id


def add_synonym(column_id: int, term: str) -> None:
    """Ajoute un synonyme pour une colonne."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO synonyms (column_id, term) VALUES (%s, %s)", (column_id, term))
    conn.commit()
    conn.close()


def get_schema_for_llm(datasource_name: str | None = None) -> str:
    """
    Génère le schéma formaté pour le contexte LLM (text-to-SQL).

    Lit le setting 'catalog_context_mode' pour déterminer le format:
    - "compact": schéma simple (nom, type, description)
    - "full": schéma enrichi avec full_context (stats, ENUM, distribution)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Lire le mode de contexte depuis les settings
    cursor.execute("SELECT value FROM settings WHERE key = 'catalog_context_mode'")
    mode_row = cursor.fetchone()
    use_full = mode_row and mode_row["value"] == "full"

    # Récupérer les datasources
    if datasource_name:
        cursor.execute("SELECT * FROM datasources WHERE name = %s", (datasource_name,))
    else:
        cursor.execute("SELECT * FROM datasources")

    datasources = cursor.fetchall()

    schema_parts = []

    for ds in datasources:
        # Récupérer les tables activées uniquement
        cursor.execute(
            """
            SELECT * FROM tables WHERE datasource_id = %s AND is_enabled = TRUE
        """,
            (ds["id"],),
        )
        tables = cursor.fetchall()

        for table in tables:
            table_desc = f"Table: {table['name']}"
            if table["row_count"]:
                table_desc += f" ({table['row_count']:,} lignes)"

            schema_parts.append(table_desc)

            # Récupérer les colonnes
            cursor.execute(
                """
                SELECT * FROM columns WHERE table_id = %s
            """,
                (table["id"],),
            )
            columns = cursor.fetchall()

            for col in columns:
                col_line = f"- {col['name']} ({col['data_type']})"

                if col["description"]:
                    # Tronquer description longue
                    desc = (
                        col["description"][:80] + "..."
                        if len(col["description"] or "") > 80
                        else col["description"]
                    )
                    col_line += f": {desc}"

                if use_full and col["full_context"]:
                    # Mode FULL: ajouter le full_context (stats calculées à l'extraction)
                    col_line += f" | {col['full_context']}"
                elif col["value_range"]:
                    # Mode COMPACT ou pas de full_context: juste le range
                    col_line += f" [{col['value_range']}]"

                schema_parts.append(col_line)

            schema_parts.append("")  # Ligne vide entre tables

    conn.close()
    return "\n".join(schema_parts)


def get_table_info(table_name: str) -> dict[str, Any] | None:
    """Récupère les infos d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT t.*, d.name as datasource_name
        FROM tables t
        JOIN datasources d ON t.datasource_id = d.id
        WHERE t.name = %s
    """,
        (table_name,),
    )
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None


def toggle_table_enabled(table_id: int) -> bool:
    """Inverse l'état is_enabled d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE tables
        SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
    """,
        (table_id,),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def set_table_enabled(table_id: int, enabled: bool) -> bool:
    """Définit l'état is_enabled d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE tables
        SET is_enabled = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
    """,
        (enabled, table_id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def get_table_by_id(table_id: int) -> dict[str, Any] | None:
    """Récupère une table par son ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tables WHERE id = %s", (table_id,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None
