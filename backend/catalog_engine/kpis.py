"""
Génération et validation des KPIs.

Appels LLM pour génération, validation, persistence.
"""

import logging
from contextlib import suppress
from typing import Any

logger = logging.getLogger(__name__)

from type_defs import DuckDBConnection

from db import get_connection
from llm_config import get_active_prompt
from llm_service import call_llm_structured
from llm_utils import KpiGenerationError, call_with_retry

from .enrichment import check_token_limit
from .models import ExtractedCatalog, KpiDefinition, KpisGenerationResult, KpiValidationResult


def validate_kpi(kpi: KpiDefinition) -> KpiValidationResult:
    """
    Valide qu'un KPI a tous ses champs requis correctement remplis.

    Returns:
        KpiValidationResult avec status OK ou WARNING et liste des problèmes
    """
    issues = []

    # Vérifier les champs obligatoires
    if not kpi.id or len(kpi.id) < 2:
        issues.append("id manquant ou trop court")

    if not kpi.title or len(kpi.title) < 2:
        issues.append("title manquant ou trop court")

    if not kpi.sql_value or "SELECT" not in kpi.sql_value.upper():
        issues.append("sql_value invalide (pas de SELECT)")

    if not kpi.sql_trend or "SELECT" not in kpi.sql_trend.upper():
        issues.append("sql_trend invalide (pas de SELECT)")

    if not kpi.sql_sparkline or "SELECT" not in kpi.sql_sparkline.upper():
        issues.append("sql_sparkline invalide (pas de SELECT)")

    if kpi.sparkline_type not in ("area", "bar"):
        issues.append(f"sparkline_type invalide: {kpi.sparkline_type}")

    if not kpi.footer:
        issues.append("footer manquant")

    return KpiValidationResult(
        kpi_id=kpi.id, status="OK" if not issues else "WARNING", issues=issues
    )


def validate_all_kpis(result: KpisGenerationResult) -> dict[str, Any]:
    """
    Valide tous les KPIs générés.

    Returns:
        {
            "total": 4,
            "ok": 3,
            "warnings": 1,
            "details": [KpiValidationResult, ...]
        }
    """
    details = [validate_kpi(kpi) for kpi in result.kpis]
    ok_count = sum(1 for d in details if d.status == "OK")
    warning_count = sum(1 for d in details if d.status == "WARNING")

    return {
        "total": len(result.kpis),
        "ok": ok_count,
        "warnings": warning_count,
        "details": details,
    }


def get_data_period(conn: DuckDBConnection) -> str:
    """
    Récupère la période des données depuis la colonne de date principale.
    """
    with suppress(Exception):
        # Essayer avec dat_course (table evaluations)
        result = conn.execute("""
            SELECT
                MIN(dat_course)::DATE as min_date,
                MAX(dat_course)::DATE as max_date,
                COUNT(DISTINCT dat_course::DATE) as nb_jours
            FROM evaluations
        """).fetchone()

        if result and result[0]:
            min_date = result[0]
            max_date = result[1]
            nb_jours = result[2]
            return f"Du {min_date} au {max_date} ({nb_jours} jours de données)"

    return "Période non déterminée"


def generate_kpis(
    catalog: ExtractedCatalog, db_connection: DuckDBConnection, max_retries: int = 2
) -> KpisGenerationResult:
    """
    Génère les 4 KPIs via LLM avec retry.

    Utilise le prompt 'widgets_generation' de la base de données.

    Raises:
        KpiGenerationError: Si la génération échoue après tous les retries
    """
    # Récupérer le prompt depuis la DB
    prompt_data = get_active_prompt("widgets_generation")
    if not prompt_data or not prompt_data.get("content"):
        raise KpiGenerationError(
            "Prompt 'widgets_generation' non configuré. Exécutez: python seed_prompts.py --force"
        )

    # Construire le schéma pour le prompt
    schema_lines = []
    for table in catalog.tables:
        schema_lines.append(f"Table: {table.name} ({table.row_count:,} lignes)")
        for col in table.columns:
            col_line = f"  - {col.name} ({col.data_type})"
            if col.sample_values:
                col_line += f" [Exemples: {', '.join(col.sample_values[:3])}]"
            if col.value_range:
                col_line += f" [Range: {col.value_range}]"
            schema_lines.append(col_line)
        schema_lines.append("")

    # Récupérer la période des données
    data_period = get_data_period(db_connection)

    # Générer la description des champs KPI depuis le modèle Pydantic
    kpi_fields = KpiDefinition.get_fields_description()

    prompt = prompt_data["content"].format(
        schema="\n".join(schema_lines), data_period=data_period, kpi_fields=kpi_fields
    )

    # Vérifier la taille du prompt avant l'appel
    is_ok, token_count, token_msg = check_token_limit(prompt)
    logger.info("  Tokens input: %s", token_msg)
    if not is_ok:
        raise KpiGenerationError(f"Prompt trop volumineux: {token_count:,} tokens")

    def _call_kpi_llm() -> KpisGenerationResult:
        result, _metadata = call_llm_structured(
            prompt=prompt,
            response_model=KpisGenerationResult,
            source="kpi_generation",
            max_tokens=8192,
        )
        if not result.kpis:
            raise KpiGenerationError("Aucun KPI généré dans la réponse")
        return result

    kpis_result: KpisGenerationResult = call_with_retry(
        _call_kpi_llm,
        max_retries=max_retries,
        error_class=KpiGenerationError,
        context="KPIs",
    )
    return kpis_result


def save_kpis(result: KpisGenerationResult) -> dict[str, int]:
    """
    Sauvegarde les KPIs générés dans SQLite.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Vider les anciens KPIs
    cursor.execute("DELETE FROM kpis")

    stats = {"kpis": 0}

    for i, kpi in enumerate(result.kpis):
        try:
            cursor.execute(
                """
                INSERT INTO kpis (
                    kpi_id, title, sql_value, sql_trend, sql_sparkline,
                    sparkline_type, footer, trend_label, invert_trend, display_order, is_enabled
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            """,
                (
                    kpi.id,
                    kpi.title,
                    kpi.sql_value,
                    kpi.sql_trend,
                    kpi.sql_sparkline,
                    kpi.sparkline_type,
                    kpi.footer,
                    kpi.trend_label,
                    kpi.invert_trend,
                    i,
                ),
            )
            stats["kpis"] += 1
        except Exception as e:
            logger.warning("Erreur KPI %s: %s", kpi.id, e)

    conn.commit()
    conn.close()
    return stats
