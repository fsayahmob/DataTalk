"""
Extraction des métadonnées depuis DuckDB.

Lecture du schéma, statistiques des colonnes, détection de patterns.
"""

import logging
import re
from contextlib import suppress
from typing import Any

logger = logging.getLogger(__name__)

from type_defs import DuckDBConnection

from .filters import is_internal_column, is_internal_table
from .models import ColumnMetadata, ExtractedCatalog, TableMetadata, ValueFrequency

# =============================================================================
# PATTERNS COMMUNS POUR DÉTECTION AUTOMATIQUE
# =============================================================================

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
        except (re.error, TypeError):
            # Regex invalide ou type non compatible
            continue

    return (best_pattern, best_rate) if best_pattern else (None, None)


def extract_column_stats(
    conn: DuckDBConnection, table_name: str, col_name: str, col_type: str, row_count: int
) -> ColumnMetadata:
    """
    Extrait les statistiques complètes d'une colonne.

    Inspiré des data catalogs professionnels (dbt, DataHub, Amundsen, Great Expectations).
    """
    categorical_threshold = 50
    col_type_lower = col_type.lower()
    is_numeric = any(
        t in col_type_lower for t in ["int", "float", "decimal", "double", "numeric", "real"]
    )
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
        """).fetchone()

        if base_stats is None:
            return ColumnMetadata(**stats)
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
            """).fetchall()
            stats["sample_values"] = [str(s[0])[:100] for s in samples if s[0]]
        else:
            # Échantillon de 5 valeurs
            samples = conn.execute(f"""
                SELECT DISTINCT CAST("{col_name}" AS VARCHAR) as val
                FROM "{table_name}"
                WHERE "{col_name}" IS NOT NULL
                LIMIT 5
            """).fetchall()
            stats["sample_values"] = [str(s[0])[:50] for s in samples if s[0]]

        # 3. Top 10 valeurs avec fréquences (distribution)
        top_values_result = conn.execute(f"""
            SELECT CAST("{col_name}" AS VARCHAR) as val, COUNT(*) as cnt
            FROM "{table_name}"
            WHERE "{col_name}" IS NOT NULL
            GROUP BY "{col_name}"
            ORDER BY cnt DESC
            LIMIT 10
        """).fetchall()

        stats["top_values"] = [
            ValueFrequency(
                value=str(v[0])[:50] if v[0] else "NULL",
                count=v[1],
                percentage=round(v[1] / row_count * 100, 2) if row_count > 0 else 0.0,
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
                """).fetchone()

                if num_stats is not None and num_stats[0] is not None:
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
                """).fetchone()

                if text_stats is not None and text_stats[0] is not None:
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
                """).fetchall()
                sample_values_for_pattern = [str(s[0]) for s in pattern_samples if s[0]]

                pattern, rate = detect_pattern(sample_values_for_pattern)
                if pattern:
                    stats["detected_pattern"] = pattern
                    stats["pattern_match_rate"] = round(rate, 4) if rate else None

    except Exception as e:
        logger.warning("Erreur extraction stats %s.%s: %s", table_name, col_name, e)

    return ColumnMetadata(**stats)


def extract_metadata_from_connection(conn: DuckDBConnection) -> ExtractedCatalog:
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

    # Récupérer les tables (exclure les tables internes)
    tables = conn.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
    """).fetchall()

    # Filtrer les tables internes (Airbyte, DLT, système)
    tables = [t for t in tables if not is_internal_table(t[0])]

    logger.info("Extraction avancée de %d tables (après exclusion tables internes)", len(tables))

    for (table_name,) in tables:
        # Nombre de lignes
        row_result = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
        row_count = row_result[0] if row_result else 0

        # Colonnes via information_schema
        columns_info = conn.execute(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """).fetchall()

        logger.info("  %s: %d colonnes, %d lignes", table_name, len(columns_info), row_count)

        columns_result: list[ColumnMetadata] = []

        for col_name, col_type in columns_info:
            # Exclure les colonnes internes (Airbyte, DLT, etc.)
            if is_internal_column(col_name):
                continue
            col_metadata = extract_column_stats(conn, table_name, col_name, col_type, row_count)
            columns_result.append(col_metadata)

        tables_result.append(
            TableMetadata(name=table_name, row_count=row_count, columns=columns_result)
        )

    return ExtractedCatalog(datasource="g7_analytics.duckdb", tables=tables_result)


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
        stats_parts.append(f"{col.null_rate * 100:.1f}% NULL")
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
        parts.append(
            f"Longueur: {col.min_length}-{col.max_length} chars (avg: {col.avg_length:.0f})"
        )

    # Pattern détecté
    if col.detected_pattern and col.pattern_match_rate is not None:
        parts.append(f"Pattern: {col.detected_pattern} ({col.pattern_match_rate * 100:.0f}% match)")

    return " | ".join(parts) if parts else ""
