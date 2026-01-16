"""
FastAPI Backend pour G7 Analytics
Gère les appels LLM + DuckDB dans un seul processus Python persistant
"""

import asyncio
import contextlib
import json
import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import pandas as pd
import uvicorn
from catalog import (
    WorkflowManager,
    add_message,
    create_catalog_job,
    create_conversation,
    delete_all_conversations,
    delete_conversation,
    delete_report,
    get_all_settings,
    get_catalog_job,
    get_catalog_jobs,
    get_conversations,
    get_latest_run_id,
    get_messages,
    get_report_by_token,
    get_run_jobs,
    get_saved_reports,
    get_schema_for_llm,
    get_setting,
    get_suggested_questions,
    get_table_by_id,
    save_report,
    set_setting,
    toggle_pin_report,
    toggle_table_enabled,
    update_job_result,
    update_job_status,
)
from catalog_engine import (
    enrich_selected_tables,
    extract_only,
    generate_catalog_from_connection,
)
from db import get_connection
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from i18n import t
from kpi_service import get_all_kpis_with_data
from llm_config import (
    check_local_provider_available,
    get_active_prompt,
    get_all_prompts,
    get_api_key_hint,
    get_costs_by_hour,
    get_costs_by_model,
    get_default_model,
    get_models,
    get_prompts,
    get_provider_by_name,
    get_providers,
    get_total_costs,
    set_active_prompt,
    set_api_key,
    set_default_model,
    update_prompt_content,
    update_provider_base_url,
)
from llm_service import LLMError, call_llm, check_llm_status
from pydantic import BaseModel, Field
from widget_service import (
    get_all_widgets_with_data,
    refresh_all_widgets_cache,
    refresh_single_widget_cache,
)

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Charger les variables d'environnement
load_dotenv()

# Configuration par défaut (fallback si settings non initialisé)
DEFAULT_DB_PATH = str(Path(__file__).parent / ".." / "data" / "g7_analytics.duckdb")
DEFAULT_MAX_CHART_ROWS = 5000  # Limite par défaut pour les graphiques


# Module-level state using a mutable container to avoid global statements
class _AppState:
    """Container for mutable application state."""

    db_connection: duckdb.DuckDBPyConnection | None = None
    current_db_path: str | None = None
    db_schema_cache: str | None = None


_app_state = _AppState()


def get_duckdb_path() -> str:
    """Récupère le chemin DuckDB depuis les settings ou utilise le défaut."""
    path = get_setting("duckdb_path")
    if path:
        # Si chemin relatif, le résoudre par rapport au dossier backend
        if not Path(path).is_absolute():
            path = str(Path(__file__).parent / ".." / path)
        return str(Path(path).resolve())
    return DEFAULT_DB_PATH


class PromptNotConfiguredError(Exception):
    """Erreur levée quand un prompt n'est pas configuré en base."""

    def __init__(self, prompt_key: str):
        self.prompt_key = prompt_key
        super().__init__(f"Prompt '{prompt_key}' non configuré. Exécutez: python seed_prompts.py")


def get_system_instruction() -> str:
    """Génère les instructions système pour le LLM.

    Charge le prompt depuis la base de données (llm_prompts).
    Lève PromptNotConfiguredError si non trouvé.
    """
    if _app_state.db_schema_cache is None:
        _app_state.db_schema_cache = get_schema_for_llm()

    # Récupérer le prompt actif depuis la DB
    prompt_data = get_active_prompt("analytics_system")

    if not prompt_data or not prompt_data.get("content"):
        raise PromptNotConfiguredError("analytics_system")

    # Injecter le schéma dans le template
    content: str = prompt_data["content"]
    return content.format(schema=_app_state.db_schema_cache)


# Modèles Pydantic
class AnalysisFilters(BaseModel):
    """Filtres structurés pour l'analyse."""

    date_start: str | None = Field(default=None, alias="dateStart")
    date_end: str | None = Field(default=None, alias="dateEnd")
    note_min: str | None = Field(default=None, alias="noteMin")
    note_max: str | None = Field(default=None, alias="noteMax")

    model_config = {"populate_by_name": True}


class QuestionRequest(BaseModel):
    question: str
    filters: AnalysisFilters | None = None
    use_context: bool = False  # Stateless par défaut


class ChartConfig(BaseModel):
    type: str
    x: str | None = None
    y: str | list[str] | None = None  # Une ou plusieurs séries Y
    title: str = ""
    color: str | None = None


class AnalysisResponse(BaseModel):
    message: str
    sql: str
    chart: ChartConfig
    data: list[dict[str, Any]]
    # Protection chart pour gros volumes
    chart_disabled: bool = False
    chart_disabled_reason: str | None = None
    # Métadonnées de performance
    model_name: str = "unknown"
    tokens_input: int | None = None
    tokens_output: int | None = None
    response_time_ms: int | None = None


class AnalyzeWithConversationRequest(BaseModel):
    question: str
    conversation_id: int | None = None  # Si None, crée une nouvelle conversation


class SaveReportRequest(BaseModel):
    title: str
    question: str
    sql_query: str
    chart_config: str | None = None
    message_id: int | None = None


class SettingsUpdateRequest(BaseModel):
    # API keys par provider
    api_key: str | None = None
    provider_name: str | None = None  # google, openai, anthropic, mistral
    # Modèle par défaut
    default_model_id: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gestion du cycle de vie de l'application"""
    # Startup: ouvrir la connexion DuckDB
    _app_state.current_db_path = get_duckdb_path()
    print(f"Connexion à DuckDB: {_app_state.current_db_path}")
    _app_state.db_connection = duckdb.connect(_app_state.current_db_path, read_only=True)
    print("DuckDB connecté")

    # Vérifier le statut LLM
    llm_status = check_llm_status()
    if llm_status["status"] == "ok":
        print(f"LLM configuré: {llm_status.get('model')}")
    else:
        print(f"ATTENTION: {llm_status.get('message')}")

    # Pré-charger le schéma du catalogue au démarrage
    _app_state.db_schema_cache = get_schema_for_llm()
    print(f"Schéma chargé ({len(_app_state.db_schema_cache)} caractères)")

    yield

    # Shutdown: fermer la connexion
    if _app_state.db_connection:
        _app_state.db_connection.close()
        print("DuckDB déconnecté")


app = FastAPI(
    title="G7 Analytics API",
    description="API pour l'analyse des évaluations clients G7",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS pour permettre les appels depuis Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def execute_query(sql: str) -> list[dict[str, Any]]:
    """Exécute une requête SQL sur DuckDB"""
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    result = _app_state.db_connection.execute(sql).fetchdf()
    data: list[dict[str, Any]] = result.to_dict(orient="records")

    # Convertir les types non sérialisables en JSON
    for row in data:
        for key, value in row.items():
            # Pandas Timestamp
            if isinstance(value, pd.Timestamp):
                row[key] = value.isoformat() if not pd.isna(value) else None
            # Numpy datetime64
            elif isinstance(value, np.datetime64):
                row[key] = str(value) if not pd.isna(value) else None
            # Numpy types (int64, float64, etc.)
            elif hasattr(value, "item"):
                row[key] = value.item()
            # Python date/datetime/time
            elif str(type(value).__name__) in ("date", "datetime", "time"):
                row[key] = str(value)
            # NaN/NaT values
            elif pd.isna(value):
                row[key] = None

    return data


def build_filter_context(filters: AnalysisFilters | None) -> str:
    """Construit le contexte de filtre pour le LLM."""
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


def build_conversation_context(conversation_id: int | None, max_messages: int = 6) -> str:
    """Construit le contexte conversationnel à partir des messages précédents."""
    if not conversation_id:
        return ""

    messages = get_messages(conversation_id)
    if not messages:
        return ""

    # Limiter aux N derniers messages (paires question/réponse)
    recent_messages = messages[-max_messages:]
    if not recent_messages:
        return ""

    context_parts = ["HISTORIQUE DE LA CONVERSATION:"]
    for msg in recent_messages:
        role = "Utilisateur" if msg["role"] == "user" else "Assistant"
        content = msg["content"]
        # Pour les réponses assistant, inclure le SQL si présent (résumé)
        if msg["role"] == "assistant" and msg.get("sql_query"):
            sql_preview = (
                msg["sql_query"][:100] + "..." if len(msg["sql_query"]) > 100 else msg["sql_query"]
            )
            context_parts.append(f"{role}: {content}\n  SQL: {sql_preview}")
        else:
            context_parts.append(f"{role}: {content}")

    context_parts.append("")  # Ligne vide avant la nouvelle question
    return "\n".join(context_parts)


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


def call_llm_for_analytics(
    question: str,
    conversation_id: int | None = None,
    filters: AnalysisFilters | None = None,
    use_context: bool = False,
) -> dict[str, Any]:
    """Appelle le LLM pour générer SQL + message + config chart + métadonnées.

    Args:
        use_context: Si True, inclut l'historique de la conversation (stateful).
                    Par défaut False (stateless) pour économiser les tokens.
    """
    # Vérifier le statut LLM
    status = check_llm_status()
    if status["status"] != "ok":
        raise HTTPException(status_code=500, detail=status.get("message", t("llm.not_configured")))

    # Construire le contexte conversationnel (seulement si use_context=True)
    conversation_context = ""
    if use_context and conversation_id:
        conversation_context = build_conversation_context(conversation_id)

    # Construire le prompt avec les filtres
    filter_context = build_filter_context(filters)

    # Assembler le prompt complet
    prompt_parts = []
    if conversation_context:
        prompt_parts.append(conversation_context)
    prompt_parts.append(question)
    if filter_context:
        prompt_parts.append(filter_context)

    full_prompt = "\n".join(prompt_parts)

    # Appeler le LLM via llm_service
    try:
        response = call_llm(
            prompt=full_prompt,
            system_prompt=get_system_instruction(),
            source="analytics",
            conversation_id=conversation_id,
            temperature=0.1,
        )

        # Nettoyer le contenu (enlever les backticks markdown si présents)
        content = response.content.strip() if response.content else ""
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines).strip()

        # Parser la réponse JSON (avec extraction robuste)
        result: dict[str, Any]
        try:
            result = json.loads(content)
        except json.JSONDecodeError as e:
            logger.warning("JSON parse failed: %s", e)
            logger.warning("Raw LLM response (%d chars): %s...", len(content), content[:500])

            # Tenter d'extraire le JSON du contenu
            json_match = re.search(r'\{[^{}]*"sql"[^{}]*\}', content, re.DOTALL)
            if not json_match:
                # Essayer avec une regex plus permissive pour JSON imbriqué
                json_match = re.search(r'\{.*"sql"\s*:\s*".*?".*\}', content, re.DOTALL)
            if json_match:
                logger.info("Found JSON via regex: %s...", json_match.group()[:200])
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError as e2:
                    logger.error("Regex JSON also invalid: %s", e2)
                    # Retourner le texte brut comme message (pas d'erreur)
                    result = {
                        "sql": "",
                        "message": content,
                        "chart": {"type": "none", "x": None, "y": None, "title": ""},
                    }
            else:
                # Pas de JSON trouvé - retourner le texte brut comme message
                logger.info("No JSON found, returning raw text as message")
                result = {
                    "sql": "",
                    "message": content,
                    "chart": {"type": "none", "x": None, "y": None, "title": ""},
                }

        if isinstance(result, list):
            result = result[0] if result else {}
        result["_metadata"] = {
            "model_name": response.model_name,
            "tokens_input": response.tokens_input,
            "tokens_output": response.tokens_output,
            "response_time_ms": response.response_time_ms,
        }
        return result

    except PromptNotConfiguredError as e:
        # Prompt non configuré en base
        logger.error("Prompt non configuré: %s", e.prompt_key)
        raise HTTPException(
            status_code=503,
            detail=f"Prompt '{e.prompt_key}' non configuré. Exécutez: python seed_prompts.py",
        ) from e

    except LLMError as e:
        # Erreur typée du service LLM - mapper via i18n
        logger.error("LLM Error: %s - %s", e.code.value, e.details)
        detail = t(e.code.value, provider=e.provider, error=e.details)
        raise HTTPException(status_code=500, detail=detail) from e


@app.get("/health")
async def health_check() -> dict[str, Any]:
    """Vérifie que l'API est opérationnelle"""
    llm_status = check_llm_status()
    return {
        "status": "ok",
        "database": "connected" if _app_state.db_connection else "disconnected",
        "llm": llm_status,
    }


@app.get("/database/status")
async def get_database_status() -> dict[str, Any]:
    """Retourne le statut et la configuration de la base DuckDB."""
    return {
        "status": "connected" if _app_state.db_connection else "disconnected",
        "path": _app_state.current_db_path,
        "configured_path": get_setting("duckdb_path") or "data/g7_analytics.duckdb",
        "engine": "DuckDB",
    }


@app.post("/refresh-schema")
async def refresh_schema() -> dict[str, Any]:
    """Rafraîchit le cache du schéma depuis le catalogue SQLite."""
    _app_state.db_schema_cache = get_schema_for_llm()
    return {
        "status": "ok",
        "message": t("db.schema_refreshed"),
        "schema_preview": _app_state.db_schema_cache[:500] + "...",
    }


@app.get("/schema")
async def get_schema() -> dict[str, str]:
    """Retourne le schéma actuel utilisé par le LLM."""
    return {"schema": get_system_instruction()}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: QuestionRequest) -> AnalysisResponse:
    """
    Analyse une question en langage naturel:
    1. Appelle le LLM pour générer SQL + message + config chart
    2. Exécute le SQL sur DuckDB
    3. Vérifie si le chart doit être désactivé (trop de données)
    4. Retourne le tout au frontend
    """
    try:
        # 1. Appeler le LLM avec les filtres
        llm_response = call_llm_for_analytics(request.question, filters=request.filters)

        sql = llm_response.get("sql", "")
        message = llm_response.get("message", "")
        chart = llm_response.get("chart") or {"type": "none", "x": None, "y": None, "title": ""}
        metadata = llm_response.get("_metadata", {})

        if not sql:
            raise HTTPException(status_code=400, detail=t("llm.no_sql_generated"))

        # 2. Exécuter le SQL
        data = execute_query(sql)

        # 3. Vérifier si le chart doit être désactivé
        chart_disabled, chart_disabled_reason = should_disable_chart(len(data), chart.get("type"))

        # 4. Retourner la réponse complète avec métadonnées
        return AnalysisResponse(
            message=message,
            sql=sql,
            chart=ChartConfig(**chart),
            data=data,
            chart_disabled=chart_disabled,
            chart_disabled_reason=chart_disabled_reason,
            model_name=metadata.get("model_name", "unknown"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# ENDPOINTS CONVERSATIONS
# ========================================


@app.post("/conversations")
async def create_new_conversation() -> dict[str, Any]:
    """Crée une nouvelle conversation."""
    conversation_id = create_conversation()
    return {"id": conversation_id, "message": t("conversation.created")}


@app.get("/conversations")
async def list_conversations(limit: int = 20) -> dict[str, list[dict[str, Any]]]:
    """Liste les conversations récentes."""
    conversations = get_conversations(limit)
    return {"conversations": conversations}


@app.delete("/conversations/{conversation_id}")
async def remove_conversation(conversation_id: int) -> dict[str, str]:
    """Supprime une conversation et ses messages."""
    deleted = delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=t("conversation.not_found"))
    return {"message": t("conversation.deleted")}


@app.delete("/conversations")
async def remove_all_conversations() -> dict[str, Any]:
    """Supprime toutes les conversations et leurs messages."""
    deleted_count = delete_all_conversations()
    return {"message": f"{deleted_count} conversation(s) supprimée(s)", "count": deleted_count}


@app.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int) -> dict[str, list[dict[str, Any]]]:
    """Récupère les messages d'une conversation."""
    messages = get_messages(conversation_id)
    return {"messages": messages}


@app.post("/conversations/{conversation_id}/analyze")
async def analyze_in_conversation(conversation_id: int, request: QuestionRequest) -> dict[str, Any]:
    """
    Analyse une question dans le contexte d'une conversation.
    Sauvegarde le message user et la réponse assistant.
    """
    try:
        # Sauvegarder le message user
        add_message(conversation_id=conversation_id, role="user", content=request.question)

        # Appeler le LLM avec les filtres et le mode contexte
        llm_response = call_llm_for_analytics(
            request.question, conversation_id, request.filters, use_context=request.use_context
        )

        sql = llm_response.get("sql", "")
        message = llm_response.get("message", "")
        chart = llm_response.get("chart") or {"type": "none", "x": None, "y": None, "title": ""}
        metadata = llm_response.get("_metadata", {})

        if not sql:
            # Le LLM n'a pas généré de SQL - retourner quand même le message
            message_id = add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=message or "Je n'ai pas compris votre demande.",
                model_name=metadata.get("model_name"),
                tokens_input=metadata.get("tokens_input"),
                tokens_output=metadata.get("tokens_output"),
                response_time_ms=metadata.get("response_time_ms"),
            )
            return {
                "message_id": message_id,
                "message": message or "Je n'ai pas compris votre demande.",
                "sql": "",
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "chart_disabled": False,
                "chart_disabled_reason": None,
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms"),
            }

        # Exécuter le SQL
        try:
            data = execute_query(sql)
        except Exception as sql_exec_error:
            # Erreur SQL - retourner le message de Gemini + l'erreur séparément
            sql_error_str = str(sql_exec_error)
            message_id = add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=message,
                sql_query=sql,
                model_name=metadata.get("model_name"),
                tokens_input=metadata.get("tokens_input"),
                tokens_output=metadata.get("tokens_output"),
                response_time_ms=metadata.get("response_time_ms"),
            )
            return {
                "message_id": message_id,
                "message": message,
                "sql": sql,
                "sql_error": sql_error_str,
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "chart_disabled": False,
                "chart_disabled_reason": None,
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms"),
            }

        # Vérifier si le chart doit être désactivé
        chart_disabled, chart_disabled_reason = should_disable_chart(len(data), chart.get("type"))

        # Limiter les données pour le stockage (max 100 lignes)
        data_to_store = data[:100] if len(data) > 100 else data

        # Sauvegarder la réponse assistant
        message_id = add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=message,
            sql_query=sql,
            chart_config=json.dumps(chart),
            data_json=json.dumps(data_to_store),
            model_name=metadata.get("model_name"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms"),
        )

        return {
            "message_id": message_id,
            "message": message,
            "sql": sql,
            "chart": chart,
            "data": data,
            "chart_disabled": chart_disabled,
            "chart_disabled_reason": chart_disabled_reason,
            "model_name": metadata.get("model_name", "unknown"),
            "tokens_input": metadata.get("tokens_input"),
            "tokens_output": metadata.get("tokens_output"),
            "response_time_ms": metadata.get("response_time_ms"),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# ENDPOINTS RAPPORTS SAUVEGARDÉS
# ========================================


@app.get("/reports")
async def list_reports() -> dict[str, list[dict[str, Any]]]:
    """Liste les rapports sauvegardés."""
    reports = get_saved_reports()
    return {"reports": reports}


@app.post("/reports")
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


@app.delete("/reports/{report_id}")
async def remove_report(report_id: int) -> dict[str, str]:
    """Supprime un rapport."""
    deleted = delete_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=t("report.not_found"))
    return {"message": t("report.deleted")}


@app.patch("/reports/{report_id}/pin")
async def pin_report(report_id: int) -> dict[str, str]:
    """Toggle l'état épinglé d'un rapport."""
    updated = toggle_pin_report(report_id)
    if not updated:
        raise HTTPException(status_code=404, detail=t("report.not_found"))
    return {"message": t("report.pin_toggled")}


@app.post("/reports/{report_id}/execute")
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


@app.get("/reports/shared/{share_token}")
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


# ========================================
# ENDPOINTS SETTINGS
# ========================================


@app.get("/settings")
async def get_settings() -> dict[str, Any]:
    """Récupère toutes les configurations + statut LLM."""
    settings = get_all_settings()

    # Ajouter les infos LLM
    llm_status = check_llm_status()
    default_model = get_default_model()

    # Liste des providers avec statut des clés
    providers = get_providers()
    providers_status = []
    for p in providers:
        hint = get_api_key_hint(p["id"])
        providers_status.append(
            {
                "name": p["name"],
                "display_name": p["display_name"],
                "type": p["type"],
                "requires_api_key": p["requires_api_key"],
                "api_key_configured": hint is not None,
                "api_key_hint": hint,
            }
        )

    return {
        "settings": settings,
        "llm": {
            "status": llm_status["status"],
            "message": llm_status.get("message"),
            "current_model": default_model,
            "providers": providers_status,
        },
    }


@app.put("/settings")
async def update_settings(request: SettingsUpdateRequest) -> dict[str, str]:
    """Met à jour les configurations LLM."""
    messages = []

    # Mettre à jour une clé API
    if request.api_key is not None and request.provider_name is not None:
        provider = get_provider_by_name(request.provider_name)
        if not provider:
            raise HTTPException(
                status_code=404, detail=t("provider.not_found", name=request.provider_name)
            )
        set_api_key(provider["id"], request.api_key)
        messages.append(t("settings.api_key_saved", provider=request.provider_name))

    # Mettre à jour le modèle par défaut
    if request.default_model_id is not None:
        set_default_model(request.default_model_id)
        messages.append(t("settings.model_set", model=request.default_model_id))

    if not messages:
        return {"message": t("settings.no_change")}

    return {"message": "; ".join(messages)}


@app.get("/settings/{key}")
async def get_single_setting(key: str) -> dict[str, str]:
    """Récupère une configuration spécifique."""
    value = get_setting(key)
    if value is None:
        raise HTTPException(status_code=404, detail=t("settings.not_found", key=key))
    # Masquer les clés API
    if "api_key" in key.lower() and len(value) > 8:
        return {"key": key, "value": value[:4] + "..." + value[-4:]}
    return {"key": key, "value": value}


class UpdateSettingRequest(BaseModel):
    """Requête de mise à jour d'un setting."""

    value: str


@app.put("/settings/{key}")
async def update_single_setting(key: str, request: UpdateSettingRequest) -> dict[str, Any]:
    """Met à jour une configuration spécifique."""
    # Liste des clés autorisées
    allowed_keys = ["catalog_context_mode", "duckdb_path", "max_tables_per_batch", "max_chart_rows"]
    if key not in allowed_keys:
        raise HTTPException(status_code=400, detail=t("settings.not_editable", key=key))

    # Validation spécifique par clé
    if key == "catalog_context_mode" and request.value not in ("compact", "full"):
        raise HTTPException(
            status_code=400, detail=t("validation.allowed_values", values="'compact', 'full'")
        )

    if key == "max_tables_per_batch":
        try:
            val = int(request.value)
            if val < 1 or val > 50:
                raise HTTPException(
                    status_code=400, detail=t("validation.range_error", min=1, max=50)
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=t("validation.numeric_required")) from e

    if key == "max_chart_rows":
        try:
            val = int(request.value)
            if val < 100 or val > 100000:
                raise HTTPException(
                    status_code=400, detail=t("validation.range_error", min=100, max=100000)
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=t("validation.numeric_required")) from e

    if key == "duckdb_path":
        # Valider que le fichier existe
        new_path = request.value
        if not Path(new_path).is_absolute():
            new_path = str(Path(__file__).parent / ".." / new_path)
        new_path = str(Path(new_path).resolve())

        if not Path(new_path).exists():
            raise HTTPException(status_code=400, detail=t("db.file_not_found", path=new_path))

        # Sauvegarder le setting
        set_setting(key, request.value)

        # Reconnecter à la nouvelle base
        if _app_state.db_connection:
            _app_state.db_connection.close()
        _app_state.current_db_path = new_path
        _app_state.db_connection = duckdb.connect(new_path, read_only=True)

        # Invalider le cache du schéma
        _app_state.db_schema_cache = None

        logger.info("DuckDB reconnecté à: %s", new_path)
        return {"status": "ok", "key": key, "value": request.value, "resolved_path": new_path}

    set_setting(key, request.value)
    return {"status": "ok", "key": key, "value": request.value}


# ========================================
# ENDPOINTS CATALOGUE DE DONNÉES
# ========================================


@app.get("/catalog")
async def get_catalog() -> dict[str, list[dict[str, Any]]]:
    """
    Retourne le catalogue actuel depuis SQLite.
    Structure: datasources → tables → columns
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer les datasources
    cursor.execute("SELECT * FROM datasources")
    datasources = [dict(row) for row in cursor.fetchall()]

    result = []
    for ds in datasources:
        # Récupérer les tables de cette datasource
        cursor.execute(
            """
            SELECT * FROM tables WHERE datasource_id = ?
            ORDER BY name
        """,
            (ds["id"],),
        )
        tables = [dict(row) for row in cursor.fetchall()]

        tables_with_columns = []
        for table in tables:
            # Récupérer les colonnes de cette table
            cursor.execute(
                """
                SELECT * FROM columns WHERE table_id = ?
                ORDER BY name
            """,
                (table["id"],),
            )
            columns = [dict(row) for row in cursor.fetchall()]

            # Récupérer les synonymes de chaque colonne
            for col in columns:
                cursor.execute(
                    """
                    SELECT term FROM synonyms WHERE column_id = ?
                """,
                    (col["id"],),
                )
                col["synonyms"] = [row["term"] for row in cursor.fetchall()]

            table["columns"] = columns
            tables_with_columns.append(table)

        ds["tables"] = tables_with_columns
        result.append(ds)

    conn.close()
    return {"catalog": result}


@app.delete("/catalog")
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
    _app_state.db_schema_cache = None

    return {"status": "ok", "message": t("catalog.deleted")}


@app.patch("/catalog/tables/{table_id}/toggle")
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
    _app_state.db_schema_cache = get_schema_for_llm()

    # Récupérer le nouvel état
    table = get_table_by_id(table_id)
    return {
        "status": "ok",
        "table_id": table_id,
        "is_enabled": bool(table["is_enabled"]) if table else False,
        "message": f"Table {'activée' if table and table['is_enabled'] else 'désactivée'}",
    }


@app.post("/catalog/extract")
async def extract_catalog_endpoint() -> dict[str, Any]:
    """
    ÉTAPE 1: Extraction du schéma depuis DuckDB SANS enrichissement LLM.

    Les tables sont créées avec is_enabled=1 par défaut.
    L'utilisateur peut ensuite désactiver les tables non souhaitées
    avant de lancer l'enrichissement.
    """
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    # 0. Créer un nouveau run_id et un job d'extraction
    run_id = str(uuid.uuid4())
    # Extraction a 2 steps: extract_metadata, save_to_catalog (géré par WorkflowManager)
    job_id = create_catalog_job(
        job_type="extraction", run_id=run_id, total_steps=2, details={"mode": "extraction_only"}
    )

    # 1. Vider le catalogue existant
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM synonyms")
        cursor.execute("DELETE FROM columns")
        cursor.execute("DELETE FROM tables")
        cursor.execute("DELETE FROM datasources")
        # Vider aussi KPIs et questions
        with contextlib.suppress(Exception):
            cursor.execute("DELETE FROM kpis")
            cursor.execute("DELETE FROM suggested_questions")
        conn.commit()
    finally:
        conn.close()

    # 2. Extraction dans un thread séparé
    def run_extraction() -> dict[str, Any]:
        return extract_only(db_connection=_app_state.db_connection, job_id=job_id)

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_extraction)

        # Marquer le job comme complété (géré par WorkflowManager maintenant)
        update_job_status(job_id, status="completed")
        update_job_result(
            job_id,
            {
                "tables": result.get("stats", {}).get("tables", 0),
                "columns": result.get("stats", {}).get("columns", 0),
                "datasource": result.get("datasource", "DuckDB"),
            },
        )
    except Exception as e:
        # Erreur déjà marquée par WorkflowManager, juste propager
        raise HTTPException(
            status_code=500, detail=t("catalog.extraction_error", error=str(e))
        ) from e

    # 3. Rafraîchir le cache du schéma (vide car pas de descriptions)
    _app_state.db_schema_cache = None

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Extraction terminée"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "tables": result.get("tables", []),
        "run_id": run_id,
    }


class EnrichCatalogRequest(BaseModel):
    """Requête d'enrichissement avec les IDs des tables sélectionnées."""

    table_ids: list[int] = Field(description="IDs des tables à enrichir")


@app.post("/catalog/enrich")
async def enrich_catalog_endpoint(request: EnrichCatalogRequest) -> dict[str, Any]:
    """
    ÉTAPE 2: Enrichissement LLM des tables sélectionnées.

    Reçoit les IDs des tables sélectionnées par l'utilisateur,
    met à jour leur état is_enabled, puis enrichit.

    Le full_context est lu depuis SQLite (calculé à l'extraction).
    L'enrichissement utilise toujours le mode "full".

    Génère:
    - Descriptions de tables et colonnes
    - Synonymes pour la recherche NLP
    - KPIs (basés sur les tables sélectionnées)

    Prérequis: avoir fait /catalog/extract d'abord.
    """
    # Vérifier que le LLM est configuré
    llm_status = check_llm_status()
    if llm_status["status"] != "ok":
        raise HTTPException(
            status_code=500, detail=llm_status.get("message", t("llm.not_configured"))
        )

    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    if not request.table_ids:
        raise HTTPException(status_code=400, detail=t("catalog.no_tables_selected"))

    # Créer un nouveau run_id pour l'enrichissement (séparé de l'extraction)
    run_id = str(uuid.uuid4())

    # Calculer le nombre total de steps (dynamique selon batch size)
    max_tables_per_batch = int(get_setting("max_tables_per_batch") or "15")
    num_batches = (len(request.table_ids) + max_tables_per_batch - 1) // max_tables_per_batch
    # total_steps = save_descriptions + llm_batch_1..N + generate_kpis + generate_questions
    total_steps = 1 + num_batches + 2

    # Créer le job d'enrichissement
    job_id = create_catalog_job(
        job_type="enrichment",
        run_id=run_id,
        total_steps=total_steps,
        details={
            "table_ids": request.table_ids,
            "batch_size": max_tables_per_batch,
            "num_batches": num_batches,
        },
    )

    # Enrichissement dans un thread séparé (full_context lu depuis SQLite)
    def run_enrichment() -> dict[str, Any]:
        return enrich_selected_tables(
            table_ids=request.table_ids, db_connection=_app_state.db_connection, job_id=job_id
        )

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_enrichment)

        # Retourner l'erreur structurée au lieu de lever une exception
        if result.get("status") == "error":
            update_job_status(job_id, status="failed", error_message=result.get("message"))
            return {
                "status": "error",
                "message": result.get("message", "Erreur inconnue"),
                "error_type": result.get("error_type"),
                "suggestion": result.get("suggestion"),
                "tables_count": 0,
                "columns_count": 0,
                "synonyms_count": 0,
                "kpis_count": 0,
                "run_id": run_id,
            }

        # Marquer le job comme complété (géré par WorkflowManager maintenant)
        update_job_status(job_id, status="completed")
        update_job_result(
            job_id,
            {
                "tables": result.get("stats", {}).get("tables", 0),
                "columns": result.get("stats", {}).get("columns", 0),
                "synonyms": result.get("stats", {}).get("synonyms", 0),
                "kpis": result.get("stats", {}).get("kpis", 0),
                "questions": result.get("stats", {}).get("questions", 0),
                "datasource": result.get("datasource", "DuckDB"),
            },
        )
    except Exception as e:
        # Erreur déjà marquée par WorkflowManager, juste propager
        raise HTTPException(
            status_code=500, detail=t("catalog.enrichment_error", error=str(e))
        ) from e

    # Rafraîchir le cache du schéma
    _app_state.db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Enrichissement terminé"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0),
        "kpis_count": result.get("stats", {}).get("kpis", 0),
        "run_id": run_id,
    }


@app.post("/catalog/generate")
async def generate_catalog_endpoint() -> dict[str, Any]:
    """
    [LEGACY] Génère le catalogue complet en une seule étape.

    Pour le nouveau workflow en 2 étapes, utilisez:
    1. POST /catalog/extract - Extraction sans LLM
    2. (Sélection des tables via UI)
    3. POST /catalog/enrich - Enrichissement LLM
    """
    # Vérifier que le LLM est configuré
    llm_status = check_llm_status()
    if llm_status["status"] != "ok":
        raise HTTPException(
            status_code=500, detail=llm_status.get("message", t("llm.not_configured"))
        )

    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    # 1. Vider le catalogue existant
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")
    conn.commit()
    conn.close()

    # 2. Générer le catalogue dans un thread séparé pour ne pas bloquer les autres requêtes
    def run_generation() -> dict[str, Any]:
        return generate_catalog_from_connection(db_connection=_app_state.db_connection)

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_generation)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=t("catalog.generation_error", error=str(e))
        ) from e

    # 3. Rafraîchir le cache du schéma
    _app_state.db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Catalogue généré"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0),
    }


# ========================================
# ENDPOINTS LLM
# ========================================


@app.get("/llm/providers")
async def list_llm_providers() -> dict[str, list[dict[str, Any]]]:
    """Liste tous les providers LLM disponibles."""
    providers = get_providers()
    result = []
    for p in providers:
        hint = get_api_key_hint(p["id"])

        # Déterminer si le provider est prêt à être utilisé
        if p.get("requires_api_key"):
            is_available = hint is not None
        else:
            # Provider local - vérifier s'il est accessible
            is_available = check_local_provider_available(p["name"])

        # Convertir les booléens SQLite (0/1) en vrais booléens
        provider_data = {
            "id": p["id"],
            "name": p["name"],
            "display_name": p["display_name"],
            "type": p["type"],
            "base_url": p.get("base_url"),
            "requires_api_key": bool(p.get("requires_api_key")),
            "is_enabled": bool(p.get("is_enabled")),
            "api_key_configured": hint is not None,
            "api_key_hint": hint,
            "is_available": is_available,
        }
        result.append(provider_data)
    return {"providers": result}


@app.get("/llm/models")
async def list_llm_models(provider_name: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Liste les modèles LLM disponibles (optionnellement filtrés par provider)."""
    if provider_name:
        provider = get_provider_by_name(provider_name)
        if not provider:
            raise HTTPException(status_code=404, detail=t("provider.not_found", name=provider_name))
        models = get_models(provider["id"])
    else:
        models = get_models()
    return {"models": models}


@app.get("/llm/models/default")
async def get_llm_default_model() -> dict[str, Any]:
    """Récupère le modèle LLM par défaut."""
    model = get_default_model()
    if not model:
        raise HTTPException(status_code=404, detail=t("llm.no_default_model"))
    return {"model": model}


@app.put("/llm/models/default/{model_id}")
async def set_llm_default_model(model_id: str) -> dict[str, str]:
    """Définit le modèle LLM par défaut."""
    # Chercher le modèle par model_id
    models = get_models()
    model = next((m for m in models if m["model_id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail=t("model.not_found", id=model_id))

    # set_default_model attend le model_id string (pas l'id interne)
    set_default_model(model_id)
    return {"message": f"Modèle par défaut: {model_id}"}


class ProviderConfigRequest(BaseModel):
    base_url: str | None = None


@app.put("/llm/providers/{provider_name}/config")
async def update_provider_config(
    provider_name: str, config: ProviderConfigRequest
) -> dict[str, str]:
    """Met à jour la configuration d'un provider (base_url pour self-hosted)."""
    provider = get_provider_by_name(provider_name)
    if not provider:
        raise HTTPException(status_code=404, detail=t("provider.not_found", name=provider_name))

    if provider.get("requires_api_key"):
        raise HTTPException(status_code=400, detail=t("provider.no_base_url"))

    if config.base_url:
        update_provider_base_url(provider["id"], config.base_url)
        return {"message": f"Configuration mise à jour pour {provider_name}"}
    update_provider_base_url(provider["id"], None)
    return {"message": f"Configuration supprimée pour {provider_name}"}


@app.get("/llm/costs")
async def get_llm_costs(days: int = 30) -> dict[str, Any]:
    """Récupère les coûts LLM des N derniers jours."""
    total = get_total_costs(days)
    by_hour = get_costs_by_hour(days)
    by_model = get_costs_by_model(days)

    return {"period_days": days, "total": total, "by_hour": by_hour, "by_model": by_model}


@app.get("/llm/status")
async def get_llm_status_endpoint() -> dict[str, Any]:
    """Vérifie le statut du LLM."""
    return check_llm_status()


# ========================================
# ENDPOINTS PROMPTS LLM
# ========================================


@app.get("/llm/prompts")
async def list_llm_prompts(category: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Liste tous les prompts LLM."""
    prompts = get_prompts(category=category)
    return {"prompts": prompts}


@app.get("/llm/prompts/{key}")
async def get_llm_prompt(key: str) -> dict[str, dict[str, Any]]:
    """Récupère le prompt actif pour une clé."""
    prompt = get_active_prompt(key)
    if not prompt:
        raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
    return {"prompt": prompt}


class SetActivePromptRequest(BaseModel):
    version: str


@app.put("/llm/prompts/{key}/active")
async def set_llm_active_prompt(key: str, request: SetActivePromptRequest) -> dict[str, str]:
    """Active une version spécifique d'un prompt."""
    success = set_active_prompt(key, request.version)
    if not success:
        raise HTTPException(
            status_code=404, detail=f"Prompt '{key}' version '{request.version}' non trouvé"
        )
    return {"message": f"Prompt '{key}' version '{request.version}' activé"}


# ========================================
# ENDPOINTS WIDGETS DYNAMIQUES
# ========================================


@app.get("/widgets")
async def list_widgets(use_cache: bool = True) -> dict[str, list[dict[str, Any]]]:
    """
    Récupère tous les widgets actifs avec leurs données.
    Les données sont cachées pour éviter 100 clients = 100 requêtes identiques.

    Query params:
        use_cache: Si False, force le recalcul (défaut: True)
    """
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    try:
        widgets = get_all_widgets_with_data(_app_state.db_connection, use_cache=use_cache)
        return {"widgets": widgets}
    except Exception as e:
        # Table n'existe pas encore ou autre erreur -> retourner liste vide
        logger.warning("Erreur chargement widgets: %s", e)
        return {"widgets": []}


@app.post("/widgets/refresh")
async def refresh_widgets() -> dict[str, Any]:
    """
    Force le recalcul du cache de tous les widgets.
    Utile après une mise à jour des données ou du catalogue.
    """
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    return refresh_all_widgets_cache(_app_state.db_connection)


@app.post("/widgets/{widget_id}/refresh")
async def refresh_widget(widget_id: str) -> dict[str, Any]:
    """
    Force le recalcul du cache d'un widget spécifique.
    """
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    result = refresh_single_widget_cache(widget_id, _app_state.db_connection)
    if "error" in result and not result.get("success", True):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ========================================
# ENDPOINTS KPIs
# ========================================


@app.get("/kpis")
async def list_kpis() -> dict[str, list[dict[str, Any]]]:
    """
    Récupère les 4 KPIs avec leurs données calculées.
    Exécute les 3 requêtes SQL par KPI (value, trend, sparkline).
    """
    if not _app_state.db_connection:
        raise HTTPException(status_code=500, detail=t("db.not_connected"))

    try:
        kpis = get_all_kpis_with_data(_app_state.db_connection)
        return {"kpis": kpis}
    except Exception as e:
        logger.warning("Erreur chargement KPIs: %s", e)
        return {"kpis": []}


# ========================================
# ENDPOINTS QUESTIONS SUGGÉRÉES
# ========================================


@app.get("/suggested-questions")
async def list_suggested_questions() -> dict[str, list[dict[str, Any]]]:
    """
    Récupère les questions suggérées (générées par LLM lors de l'enrichissement).
    Retourne une liste vide si le catalogue est vide ou si aucune question n'a été générée.
    """
    try:
        conn = get_connection()
        # Vérifier si le catalogue existe (au moins une table)
        table_count = conn.execute("SELECT COUNT(*) FROM tables").fetchone()[0]
        conn.close()

        if table_count == 0:
            return {"questions": []}

        # Questions générées par LLM (table suggested_questions)
        questions = get_suggested_questions(enabled_only=True)
        return {"questions": questions}
    except Exception as e:
        logger.warning("Erreur chargement questions suggérées: %s", e)
        return {"questions": []}


# ========================================
# ENDPOINTS PROMPTS
# ========================================


@app.get("/prompts")
async def list_prompts() -> dict[str, list[dict[str, Any]]]:
    """Liste tous les prompts avec leur version active."""
    try:
        prompts = get_all_prompts()
        return {"prompts": prompts}
    except Exception as e:
        logger.error("Erreur récupération prompts: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/prompts/{key}")
async def get_prompt(key: str) -> dict[str, Any]:
    """Récupère un prompt spécifique par sa clé."""
    try:
        prompt = get_active_prompt(key)
        if not prompt:
            raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
        return prompt
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération prompt %s: %s", key, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


class PromptUpdateRequest(BaseModel):
    """Requête de mise à jour d'un prompt."""

    content: str = Field(description="Contenu du prompt")


@app.put("/prompts/{key}")
async def update_prompt(key: str, request: PromptUpdateRequest) -> dict[str, str]:
    """Met à jour le contenu d'un prompt actif."""
    try:
        success = update_prompt_content(key, request.content)
        if not success:
            raise HTTPException(status_code=404, detail=t("prompt.not_found", key=key))
        return {"status": "ok", "message": t("prompt.updated")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur mise à jour prompt %s: %s", key, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# ENDPOINTS CATALOG JOBS
# ========================================


@app.get("/catalog/jobs")
async def list_catalog_jobs(limit: int = 50) -> dict[str, list[dict[str, Any]]]:
    """Récupère l'historique des jobs (extraction + enrichment)."""
    try:
        jobs = get_catalog_jobs(limit=limit)
        return {"jobs": jobs}
    except Exception as e:
        logger.error("Erreur récupération jobs: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/catalog/jobs/{job_id}")
async def get_catalog_job_by_id(job_id: int) -> dict[str, Any]:
    """Récupère un job spécifique par son ID."""
    try:
        job = get_catalog_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=t("job.not_found"))
        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/catalog/run/{run_id}")
async def get_run(run_id: str) -> dict[str, list[dict[str, Any]]]:
    """Récupère tous les jobs d'une run (extraction + enrichments)."""
    try:
        jobs = get_run_jobs(run_id)
        if not jobs:
            raise HTTPException(status_code=404, detail=t("run.not_found"))
        return {"run": jobs}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur récupération run %s: %s", run_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/catalog/latest-run")
async def get_latest_run() -> dict[str, list[dict[str, Any]]]:
    """Récupère la dernière run complète (extraction + enrichments)."""
    try:
        run_id = get_latest_run_id()

        if not run_id:
            return {"run": []}

        jobs = get_run_jobs(run_id)
        return {"run": jobs}
    except Exception as e:
        logger.error("Erreur récupération dernière run: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# SSE ENDPOINTS - TEMPS RÉEL
# ========================================


@app.get("/catalog/job-stream/{run_id}")
async def stream_run_jobs(run_id: str) -> StreamingResponse:
    """
    Stream SSE des jobs d'un run spécifique (extraction + enrichissement).
    Se ferme automatiquement quand tous les jobs sont terminés.
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                # Récupérer les jobs du run
                jobs = get_run_jobs(run_id)
                jobs_data = [dict(job) for job in jobs]

                # Envoyer les données
                yield f"data: {json.dumps(jobs_data)}\n\n"

                # Arrêter si tous jobs sont terminés
                if jobs_data and all(j["status"] in ["completed", "failed"] for j in jobs_data):
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break

                # Update toutes les 500ms
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error("Erreur SSE job-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@app.get("/catalog/status-stream")
async def stream_catalog_status() -> StreamingResponse:
    """
    Stream SSE de l'état global du catalogue (running ou pas).
    Permet de bloquer les boutons Extract/Enrich pendant un run.
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        previous_status: dict[str, Any] | None = None

        try:
            while True:
                # Vérifier si un job tourne
                recent_jobs = get_catalog_jobs(limit=5)
                is_running = any(j["status"] == "running" for j in recent_jobs)
                current_run_id = get_latest_run_id() if is_running else None

                status: dict[str, Any] = {
                    "is_running": is_running,
                    "current_run_id": current_run_id,
                }

                # Envoyer seulement si changement (éviter spam)
                if status != previous_status:
                    yield f"data: {json.dumps(status)}\n\n"
                    previous_status = status

                await asyncio.sleep(1)

        except Exception as e:
            logger.error("Erreur SSE status-stream: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/catalog/runs")
async def list_all_runs() -> dict[str, list[dict[str, Any]]]:
    """
    Liste tous les jobs individuellement (extraction ET enrichissement séparés).
    Chaque job = 1 run dans l'historique.
    """
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()

            # Récupérer chaque job individuellement
            cursor.execute("""
                SELECT
                    id,
                    run_id,
                    job_type,
                    status,
                    started_at,
                    completed_at,
                    current_step,
                    progress,
                    result
                FROM catalog_jobs
                ORDER BY started_at DESC
                LIMIT 100
            """)

            runs = []
            for row in cursor.fetchall():
                # Parser le result JSON si présent
                result = row["result"]
                if result and isinstance(result, str):
                    try:
                        result = json.loads(result)
                    except (json.JSONDecodeError, TypeError):
                        result = None

                runs.append(
                    {
                        "id": row["id"],
                        "run_id": row["run_id"],
                        "job_type": row["job_type"],
                        "status": row["status"],
                        "started_at": row["started_at"],
                        "completed_at": row["completed_at"],
                        "current_step": row["current_step"],
                        "progress": row["progress"],
                        "result": result,
                    }
                )

            return {"runs": runs}

        finally:
            conn.close()

    except Exception as e:
        logger.error("Erreur list runs: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.patch("/catalog/columns/{column_id}/description")
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


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
