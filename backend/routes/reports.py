"""
Routes pour la gestion des rapports sauvegardés.

Endpoints:
- GET /reports - Lister les rapports
- POST /reports - Créer un rapport
- DELETE /reports/{id} - Supprimer un rapport
- PATCH /reports/{id}/pin - Toggle épinglé
- POST /reports/{id}/execute - Exécuter un rapport
- GET /reports/shared/{token} - Accès public via token
"""

import contextlib
import json
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import (
    delete_report,
    get_report_by_token,
    get_saved_reports,
    save_report,
    toggle_pin_report,
)
from core.query import execute_query
from i18n import t
from routes.dependencies import SaveReportRequest

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports() -> dict[str, list[dict[str, Any]]]:
    """Liste les rapports sauvegardés."""
    reports = get_saved_reports()
    return {"reports": reports}


@router.post("")
async def create_report(request: SaveReportRequest) -> dict[str, Any]:
    """Sauvegarde un nouveau rapport avec token de partage."""
    result = save_report(
        title=request.title,
        question=request.question,
        sql_query=request.sql_query,
        chart_config=request.chart_config,
        message_id=request.message_id,
    )
    return {"id": result["id"], "share_token": result["share_token"], "message": t("report.saved")}


@router.delete("/{report_id}")
async def remove_report(report_id: int) -> dict[str, str]:
    """Supprime un rapport."""
    deleted = delete_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=t("report.not_found"))
    return {"message": t("report.deleted")}


@router.patch("/{report_id}/pin")
async def pin_report(report_id: int) -> dict[str, str]:
    """Toggle l'état épinglé d'un rapport."""
    updated = toggle_pin_report(report_id)
    if not updated:
        raise HTTPException(status_code=404, detail=t("report.not_found"))
    return {"message": t("report.pin_toggled")}


@router.post("/{report_id}/execute")
async def execute_report(report_id: int) -> dict[str, Any]:
    """
    Exécute la requête SQL d'un rapport sauvegardé.
    Retourne les données fraîches + la config du graphique.
    """
    # Récupérer le rapport
    reports = get_saved_reports()
    report = next((r for r in reports if r["id"] == report_id), None)

    if not report:
        raise HTTPException(status_code=404, detail=t("report.not_found"))

    sql_query = report.get("sql_query")
    if not sql_query:
        raise HTTPException(status_code=400, detail=t("report.no_sql"))

    try:
        # Exécuter la requête SQL
        data = execute_query(sql_query)

        # Parser la config du graphique
        chart_config = {"type": "none", "x": "", "y": "", "title": ""}
        if report.get("chart_config"):
            with contextlib.suppress(json.JSONDecodeError):
                chart_config = json.loads(report["chart_config"])

        return {
            "report_id": report_id,
            "title": report.get("title", ""),
            "sql": sql_query,
            "chart": chart_config,
            "data": data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=t("db.query_error", error=str(e))) from e


@router.get("/shared/{share_token}")
async def get_shared_report(share_token: str) -> dict[str, Any]:
    """
    Accès public à un rapport partagé via son token.
    Exécute la requête SQL et retourne les données.
    """
    report = get_report_by_token(share_token)
    if not report:
        raise HTTPException(status_code=404, detail=t("report.not_found"))

    sql_query = report.get("sql_query")
    if not sql_query:
        raise HTTPException(status_code=400, detail=t("report.no_sql"))

    try:
        data = execute_query(sql_query)

        chart_config = {"type": "none", "x": "", "y": "", "title": ""}
        if report.get("chart_config"):
            with contextlib.suppress(json.JSONDecodeError):
                chart_config = json.loads(report["chart_config"])

        return {
            "title": report.get("title", ""),
            "question": report.get("question", ""),
            "sql": sql_query,
            "chart": chart_config,
            "data": data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=t("db.query_error", error=str(e))) from e
