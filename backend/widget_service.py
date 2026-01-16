"""
Service pour les widgets dynamiques.
Gère l'exécution SQL sur DuckDB et le cache des résultats.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

import duckdb

from catalog import (
    clear_widget_cache,
    get_widget_cache,
    get_widgets,
    set_widget_cache,
)
from type_defs import convert_df_to_json

logger = logging.getLogger(__name__)

# TTL par défaut du cache (en minutes)
DEFAULT_CACHE_TTL_MINUTES = 60


def execute_widget_sql(
    db_connection: duckdb.DuckDBPyConnection, sql_query: str
) -> list[dict[str, Any]]:
    """
    Exécute une requête SQL de widget sur DuckDB.
    Convertit les types non sérialisables en JSON.
    """
    result = db_connection.execute(sql_query).fetchdf()
    return convert_df_to_json(result)


def get_widget_with_data(
    widget: dict[str, Any],
    db_connection: duckdb.DuckDBPyConnection,
    use_cache: bool = True,
    cache_ttl_minutes: int = DEFAULT_CACHE_TTL_MINUTES,
) -> dict[str, Any]:
    """
    Récupère un widget avec ses données.
    Utilise le cache si disponible et valide.

    Returns:
        Widget enrichi avec 'data' et 'cached_at' si depuis cache
    """
    widget_id = widget["widget_id"]

    # Vérifier le cache
    if use_cache:
        cached = get_widget_cache(widget_id)
        if cached:
            try:
                data = json.loads(cached["data"])
                return {
                    **widget,
                    "data": data,
                    "cached_at": cached["computed_at"],
                    "from_cache": True,
                }
            except json.JSONDecodeError:
                logger.warning("Cache invalide pour widget %s", widget_id)

    # Exécuter la requête SQL
    try:
        data = execute_widget_sql(db_connection, widget["sql_query"])

        # Mettre en cache
        set_widget_cache(widget_id=widget_id, data=json.dumps(data), ttl_minutes=cache_ttl_minutes)

        return {
            **widget,
            "data": data,
            "cached_at": datetime.now(tz=UTC).isoformat(),
            "from_cache": False,
        }
    except Exception as e:
        logger.error("Erreur SQL widget %s: %s", widget_id, e)
        return {**widget, "data": [], "error": str(e), "from_cache": False}


def get_all_widgets_with_data(
    db_connection: duckdb.DuckDBPyConnection,
    use_cache: bool = True,
    cache_ttl_minutes: int = DEFAULT_CACHE_TTL_MINUTES,
) -> list[dict[str, Any]]:
    """
    Récupère tous les widgets actifs avec leurs données.
    Triés par priority (high en premier) puis display_order.
    """
    widgets = get_widgets(enabled_only=True)

    result = []
    for widget in widgets:
        widget_with_data = get_widget_with_data(
            widget, db_connection, use_cache=use_cache, cache_ttl_minutes=cache_ttl_minutes
        )
        result.append(widget_with_data)

    return result


def refresh_all_widgets_cache(
    db_connection: duckdb.DuckDBPyConnection, cache_ttl_minutes: int = DEFAULT_CACHE_TTL_MINUTES
) -> dict[str, Any]:
    """
    Force le recalcul du cache de tous les widgets.

    Returns:
        Statistiques du refresh (success, errors)
    """
    # Vider le cache existant
    clear_widget_cache()

    widgets = get_widgets(enabled_only=True)

    success = 0
    errors = []

    for widget in widgets:
        try:
            data = execute_widget_sql(db_connection, widget["sql_query"])
            set_widget_cache(
                widget_id=widget["widget_id"], data=json.dumps(data), ttl_minutes=cache_ttl_minutes
            )
            success += 1
        except Exception as e:
            errors.append({"widget_id": widget["widget_id"], "error": str(e)})
            logger.error("Erreur refresh widget %s: %s", widget["widget_id"], e)

    return {
        "total": len(widgets),
        "success": success,
        "errors": errors,
        "refreshed_at": datetime.now(tz=UTC).isoformat(),
    }


def refresh_single_widget_cache(
    widget_id: str,
    db_connection: duckdb.DuckDBPyConnection,
    cache_ttl_minutes: int = DEFAULT_CACHE_TTL_MINUTES,
) -> dict[str, Any]:
    """
    Force le recalcul du cache d'un seul widget.
    """
    widgets = get_widgets(enabled_only=False)
    widget = next((w for w in widgets if w["widget_id"] == widget_id), None)

    if not widget:
        return {"error": f"Widget '{widget_id}' non trouvé"}

    try:
        data = execute_widget_sql(db_connection, widget["sql_query"])
        set_widget_cache(widget_id=widget_id, data=json.dumps(data), ttl_minutes=cache_ttl_minutes)
        return {
            "widget_id": widget_id,
            "success": True,
            "rows": len(data),
            "refreshed_at": datetime.now(tz=UTC).isoformat(),
        }
    except Exception as e:
        return {"widget_id": widget_id, "success": False, "error": str(e)}
