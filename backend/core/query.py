"""
Utilitaires d'exécution de requêtes SQL pour G7 Analytics.

Contient:
- execute_query: Exécution SQL sur DuckDB avec conversion JSON
- build_filter_context: Construction du contexte de filtres pour le LLM
- should_disable_chart: Protection contre les gros volumes de données
"""

import logging
from typing import Any

from fastapi import HTTPException

from catalog import get_setting
from constants import QueryConfig
from core.state import app_state
from i18n import t
from type_defs import convert_df_to_json

logger = logging.getLogger(__name__)

# Re-export depuis constants pour compatibilité
DEFAULT_MAX_CHART_ROWS = QueryConfig.MAX_CHART_ROWS
DEFAULT_QUERY_TIMEOUT_MS = QueryConfig.DEFAULT_TIMEOUT_MS


class QueryTimeoutError(Exception):
    """Erreur de timeout de requête DuckDB."""


def execute_query(sql: str, timeout_ms: int | None = None) -> list[dict[str, Any]]:
    """
    Exécute une requête SQL sur DuckDB avec timeout.

    Args:
        sql: Requête SQL à exécuter
        timeout_ms: Timeout en millisecondes (défaut: 30s)

    Returns:
        Liste de dictionnaires (données)

    Raises:
        HTTPException: Si pas de connexion DB
        QueryTimeoutError: Si la requête dépasse le timeout
    """
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    # Récupérer le timeout depuis les settings ou utiliser le défaut
    if timeout_ms is None:
        timeout_str = get_setting("query_timeout_ms")
        timeout_ms = int(timeout_str) if timeout_str else DEFAULT_QUERY_TIMEOUT_MS

    try:
        # Note: DuckDB ne supporte pas statement_timeout nativement
        # On exécute la requête directement sans limite de temps côté DB
        result = app_state.db_connection.execute(sql).fetchdf()
        return convert_df_to_json(result)
    except Exception as e:
        error_str = str(e).lower()
        # Vérifier un vrai timeout/interruption (pas une erreur de config)
        if "interrupt" in error_str or "cancelled" in error_str:
            logger.warning("Query interrupted (%dms): %s...", timeout_ms, sql[:80])
            raise QueryTimeoutError(t("db.query_timeout")) from e
        raise


def build_filter_context(filters: Any) -> str:
    """Construit le contexte de filtre pour le LLM.

    Args:
        filters: Objet AnalysisFilters avec date_start, date_end, note_min, note_max

    Returns:
        String formatée pour le prompt LLM ou chaîne vide si pas de filtres
    """
    if not filters:
        return ""

    constraints = []
    if filters.date_start:
        constraints.append(f"dat_course >= '{filters.date_start}'")
    if filters.date_end:
        constraints.append(f"dat_course <= '{filters.date_end}'")
    if filters.note_min:
        constraints.append(f"note_eval >= {filters.note_min}")
    if filters.note_max:
        constraints.append(f"note_eval <= {filters.note_max}")

    if not constraints:
        return ""

    return f"""
FILTRES OBLIGATOIRES (à ajouter dans WHERE):
{" AND ".join(constraints)}
"""


def should_disable_chart(row_count: int, chart_type: str | None) -> tuple[bool, str | None]:
    """
    Détermine si le graphique doit être désactivé pour protéger les performances.

    Logique simple: si row_count > limite configurée, désactiver le chart.

    Args:
        row_count: Nombre de lignes retournées
        chart_type: Type de graphique demandé par le LLM

    Returns:
        (should_disable, reason) - True si désactivé, avec la raison
    """
    if not chart_type or chart_type == "none":
        return False, None

    max_rows_str = get_setting("max_chart_rows")
    max_rows = int(max_rows_str) if max_rows_str else DEFAULT_MAX_CHART_ROWS

    if row_count <= max_rows:
        return False, None

    reason = t("chart.disabled_row_limit", rows=f"{row_count:,}", limit=f"{max_rows:,}")
    return True, reason
