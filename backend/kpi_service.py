"""
Service pour les KPIs dynamiques.
Gère l'exécution des 3 requêtes SQL par KPI et la construction des données.
"""

import logging
from typing import Any

import duckdb
import numpy as np
import pandas as pd

from db import get_connection
from type_defs import convert_pandas_value

logger = logging.getLogger(__name__)


def execute_kpi_sql(
    db_connection: duckdb.DuckDBPyConnection, sql_query: str
) -> Any:  # Returns KpiValue | SparklineData | None
    """
    Exécute une requête SQL de KPI sur DuckDB.
    Retourne la valeur brute (scalar ou liste).
    """
    result = db_connection.execute(sql_query).fetchdf()

    if result.empty:
        return None

    # Pour les requêtes sparkline (plusieurs lignes)
    if len(result) > 1:
        values = []
        for _, row in result.iterrows():
            val = row.iloc[0]  # Première colonne
            if isinstance(val, (pd.Timestamp, np.datetime64)):
                continue  # Skip dates
            converted = convert_pandas_value(val)
            values.append(converted if converted is not None else 0)
        return values

    # Pour les requêtes valeur unique
    val = result.iloc[0, 0]
    return convert_pandas_value(val)


def get_kpi_with_data(
    kpi: dict[str, Any], db_connection: duckdb.DuckDBPyConnection
) -> dict[str, Any]:
    """
    Exécute les 3 requêtes SQL d'un KPI et construit le KpiCompactData.

    Args:
        kpi: dict avec id, title, sql_value, sql_trend, sql_sparkline, etc.
        db_connection: connexion DuckDB

    Returns:
        KpiCompactData: {id, title, value, trend?, sparkline?, footer?}
    """
    kpi_id = kpi.get("kpi_id") or kpi.get("id")
    result = {
        "id": kpi_id,
        "title": kpi["title"],
        "value": "—",
    }

    # 1. Exécuter sql_value
    try:
        value = execute_kpi_sql(db_connection, kpi["sql_value"])
        if value is not None:
            if isinstance(value, float):
                result["value"] = round(value, 2)
            else:
                result["value"] = value
    except Exception as e:
        logger.error("Erreur sql_value KPI %s: %s", kpi_id, e)

    # 2. Exécuter sql_trend (pour calculer le %)
    try:
        trend_value = execute_kpi_sql(db_connection, kpi["sql_trend"])
        if trend_value is not None and result["value"] != "—":
            current = (
                float(result["value"]) if isinstance(result["value"], (int, float, str)) else 0
            )
            previous = float(trend_value) if trend_value else 0

            if previous != 0:
                pct_change = ((current - previous) / abs(previous)) * 100

                # Déterminer la direction visuelle (pour les couleurs)
                # Si invert_trend=true, on inverse: baisse=positif, hausse=négatif
                invert = kpi.get("invert_trend", False)
                raw_direction = "up" if pct_change >= 0 else "down"

                result["trend"] = {
                    "value": round(abs(pct_change), 1),
                    "direction": raw_direction,
                    "invert": invert,  # Le frontend utilisera ça pour inverser les couleurs
                }
                if kpi.get("trend_label"):
                    result["trend"]["label"] = kpi["trend_label"]
    except Exception as e:
        logger.error("Erreur sql_trend KPI %s: %s", kpi_id, e)

    # 3. Exécuter sql_sparkline
    try:
        sparkline_data = execute_kpi_sql(db_connection, kpi["sql_sparkline"])
        if sparkline_data and isinstance(sparkline_data, list) and len(sparkline_data) > 2:
            result["sparkline"] = {
                "data": sparkline_data,
                "type": kpi.get("sparkline_type", "area"),
            }
    except Exception as e:
        logger.error("Erreur sql_sparkline KPI %s: %s", kpi_id, e)

    # 4. Footer
    if kpi.get("footer"):
        result["footer"] = kpi["footer"]

    return result


def get_all_kpis_with_data(db_connection: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    """
    Récupère tous les KPIs depuis PostgreSQL et exécute leurs requêtes.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer les KPIs depuis la table kpis
    cursor.execute("""
        SELECT * FROM kpis
        WHERE is_enabled = TRUE
        ORDER BY display_order ASC
    """)
    kpis = [dict(row) for row in cursor.fetchall()]
    conn.close()

    result = []
    for kpi in kpis:
        kpi_data = get_kpi_with_data(kpi, db_connection)
        result.append(kpi_data)

    return result


def save_kpis(kpis: list[dict[str, Any]]) -> int:
    """
    Sauvegarde les KPIs générés par le LLM dans PostgreSQL.

    Args:
        kpis: Liste de dicts avec id, title, sql_value, sql_trend, sql_sparkline, etc.

    Returns:
        Nombre de KPIs sauvegardés.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Vider les anciens KPIs
    cursor.execute("DELETE FROM kpis")

    count = 0
    for i, kpi in enumerate(kpis):
        cursor.execute(
            """
            INSERT INTO kpis (
                kpi_id, title, sql_value, sql_trend, sql_sparkline,
                sparkline_type, footer, trend_label, display_order, is_enabled
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        """,
            (
                kpi.get("id"),
                kpi.get("title"),
                kpi.get("sql_value"),
                kpi.get("sql_trend"),
                kpi.get("sql_sparkline"),
                kpi.get("sparkline_type", "area"),
                kpi.get("footer"),
                kpi.get("trend_label"),
                i,
            ),
        )
        count += 1

    conn.commit()
    conn.close()
    return count
