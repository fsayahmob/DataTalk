"""
Utilitaires d'exécution de requêtes SQL pour G7 Analytics.

Contient:
- execute_query: Exécution SQL sur DuckDB avec conversion JSON
- build_filter_context: Construction du contexte de filtres pour le LLM
- should_disable_chart: Protection contre les gros volumes de données
"""

from typing import Any

from fastapi import HTTPException

from catalog import get_setting
from core.state import app_state
from i18n import t
from type_defs import convert_df_to_json

# Configuration par défaut
DEFAULT_MAX_CHART_ROWS = 5000


def execute_query(sql: str) -> list[dict[str, Any]]:
    """Exécute une requête SQL sur DuckDB."""
    if not app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    result = app_state.db_connection.execute(sql).fetchdf()
    return convert_df_to_json(result)


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
