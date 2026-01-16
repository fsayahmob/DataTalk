"""
CRUD endpoints for catalog management.

Endpoints:
- GET /catalog - Get catalog
- DELETE /catalog - Delete catalog
- PATCH /catalog/tables/{id}/toggle - Toggle table enabled
- PATCH /catalog/columns/{id}/description - Update column description
"""

import contextlib
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import get_schema_for_llm, get_table_by_id, toggle_table_enabled
from core.state import app_state
from db import get_connection
from i18n import t

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def get_catalog() -> dict[str, list[dict[str, Any]]]:
    """
    Retourne le catalogue actuel depuis SQLite.
    Structure: datasources → tables → columns
    Optimisé: 4 requêtes au lieu de O(N*M*K) requêtes.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Récupérer toutes les datasources
    cursor.execute("SELECT * FROM datasources")
    datasources = {row["id"]: dict(row) for row in cursor.fetchall()}
    for ds in datasources.values():
        ds["tables"] = []

    # 2. Récupérer toutes les tables en une requête
    cursor.execute("SELECT * FROM tables ORDER BY name")
    tables = {row["id"]: dict(row) for row in cursor.fetchall()}
    for table in tables.values():
        table["columns"] = []
        ds_id = table["datasource_id"]
        if ds_id in datasources:
            datasources[ds_id]["tables"].append(table)

    # 3. Récupérer toutes les colonnes en une requête
    cursor.execute("SELECT * FROM columns ORDER BY name")
    columns = {row["id"]: dict(row) for row in cursor.fetchall()}
    for col in columns.values():
        col["synonyms"] = []
        table_id = col["table_id"]
        if table_id in tables:
            tables[table_id]["columns"].append(col)

    # 4. Récupérer tous les synonymes en une requête
    cursor.execute("SELECT column_id, term FROM synonyms")
    for row in cursor.fetchall():
        col_id = row["column_id"]
        if col_id in columns:
            columns[col_id]["synonyms"].append(row["term"])

    conn.close()
    return {"catalog": list(datasources.values())}


@router.delete("")
async def delete_catalog() -> dict[str, str]:
    """
    Supprime tout le catalogue (pour permettre de retester la génération).
    Supprime aussi les widgets et questions suggérées associées.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Supprimer le catalogue sémantique
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")

    # Supprimer les widgets, questions et KPIs générés
    with contextlib.suppress(Exception):
        cursor.execute("DELETE FROM widget_cache")
        cursor.execute("DELETE FROM widgets")
        cursor.execute("DELETE FROM suggested_questions")
        cursor.execute("DELETE FROM kpis")

    conn.commit()
    conn.close()

    # Rafraîchir le cache du schéma
    app_state.db_schema_cache = None

    return {"status": "ok", "message": t("catalog.deleted")}


@router.patch("/tables/{table_id}/toggle")
async def toggle_table_enabled_endpoint(table_id: int) -> dict[str, Any]:
    """
    Toggle l'état is_enabled d'une table.
    Une table désactivée n'apparaîtra plus dans le prompt LLM.
    """
    # Vérifier que la table existe
    table = get_table_by_id(table_id)
    if not table:
        raise HTTPException(status_code=404, detail=t("catalog.table_not_found"))

    # Toggle l'état
    updated = toggle_table_enabled(table_id)
    if not updated:
        raise HTTPException(status_code=500, detail=t("catalog.update_error"))

    # Rafraîchir le cache du schéma
    app_state.db_schema_cache = get_schema_for_llm()

    # Récupérer le nouvel état
    table = get_table_by_id(table_id)
    return {
        "status": "ok",
        "table_id": table_id,
        "is_enabled": bool(table["is_enabled"]) if table else False,
        "message": f"Table {'activée' if table and table['is_enabled'] else 'désactivée'}",
    }


@router.patch("/columns/{column_id}/description")
async def update_column_description(column_id: int, request: dict[str, Any]) -> dict[str, Any]:
    """
    Met à jour la description d'une colonne du catalogue.

    Body:
        {"description": "Nouvelle description"}
    """
    description = request.get("description", "").strip()

    if not description:
        raise HTTPException(status_code=400, detail=t("validation.empty_description"))

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Vérifier que la colonne existe
        cursor.execute("SELECT id, name FROM columns WHERE id = ?", (column_id,))
        column = cursor.fetchone()

        if not column:
            raise HTTPException(status_code=404, detail=t("catalog.column_not_found", id=column_id))

        # Mettre à jour la description
        cursor.execute("UPDATE columns SET description = ? WHERE id = ?", (description, column_id))
        conn.commit()
        conn.close()

        return {
            "status": "ok",
            "column_id": column_id,
            "column_name": column["name"],
            "description": description,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur update description colonne %s: %s", column_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e
