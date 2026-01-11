"""
FastAPI Backend pour G7 Analytics
Gère les appels LLM + DuckDB dans un seul processus Python persistant
"""
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Any

import duckdb
from catalog import (
    add_message,
    create_conversation,
    delete_all_conversations,
    delete_conversation,
    delete_report,
    get_all_settings,
    get_conversations,
    get_messages,
    get_saved_reports,
    get_schema_for_llm,
    get_setting,
    get_suggested_questions,
    save_report,
    toggle_pin_report,
)
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from i18n import t
from llm_config import (
    get_active_prompt,
    get_api_key_hint,
    get_costs_by_hour,
    get_costs_by_model,
    get_default_model,
    get_models,
    get_prompts,
    get_provider_by_name,
    get_providers,
    get_total_costs,
    init_llm_tables,
    set_active_prompt,
    set_api_key,
    set_default_model,
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

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")

# Connexion DuckDB persistante
db_connection: duckdb.DuckDBPyConnection | None = None

# Schéma chargé dynamiquement depuis le catalogue
db_schema_cache: str | None = None


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
    global db_schema_cache

    if db_schema_cache is None:
        db_schema_cache = get_schema_for_llm()

    # Récupérer le prompt actif depuis la DB
    prompt_data = get_active_prompt("analytics_system")

    if not prompt_data or not prompt_data.get("content"):
        raise PromptNotConfiguredError("analytics_system")

    # Injecter le schéma dans le template
    return prompt_data["content"].format(schema=db_schema_cache)


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
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application"""
    global db_connection

    # Startup: ouvrir la connexion DuckDB
    print(f"Connexion à DuckDB: {DB_PATH}")
    db_connection = duckdb.connect(DB_PATH, read_only=True)
    print("DuckDB connecté")

    # Initialiser les tables LLM
    init_llm_tables()
    print("Tables LLM initialisées")

    # Vérifier le statut LLM
    llm_status = check_llm_status()
    if llm_status["status"] == "ok":
        print(f"LLM configuré: {llm_status.get('model')}")
    else:
        print(f"ATTENTION: {llm_status.get('message')}")

    # Pré-charger le schéma du catalogue au démarrage
    global db_schema_cache
    db_schema_cache = get_schema_for_llm()
    print(f"Schéma chargé ({len(db_schema_cache)} caractères)")

    yield

    # Shutdown: fermer la connexion
    if db_connection:
        db_connection.close()
        print("DuckDB déconnecté")


app = FastAPI(
    title="G7 Analytics API",
    description="API pour l'analyse des évaluations clients G7",
    version="1.0.0",
    lifespan=lifespan
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
    import numpy as np
    import pandas as pd

    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    result = db_connection.execute(sql).fetchdf()
    data = result.to_dict(orient="records")

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
            elif hasattr(value, 'item'):
                row[key] = value.item()
            # Python date/datetime/time
            elif str(type(value).__name__) in ('date', 'datetime', 'time'):
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
{' AND '.join(constraints)}
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
            sql_preview = msg["sql_query"][:100] + "..." if len(msg["sql_query"]) > 100 else msg["sql_query"]
            context_parts.append(f"{role}: {content}\n  SQL: {sql_preview}")
        else:
            context_parts.append(f"{role}: {content}")

    context_parts.append("")  # Ligne vide avant la nouvelle question
    return "\n".join(context_parts)


def call_llm_for_analytics(
    question: str,
    conversation_id: int | None = None,
    filters: AnalysisFilters | None = None,
    use_context: bool = False
) -> dict:
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
        try:
            result = json.loads(content)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse failed: {e}")
            logger.warning(f"Raw LLM response ({len(content)} chars): {content[:500]}...")

            # Tenter d'extraire le JSON du contenu
            json_match = re.search(r'\{[^{}]*"sql"[^{}]*\}', content, re.DOTALL)
            if not json_match:
                # Essayer avec une regex plus permissive pour JSON imbriqué
                json_match = re.search(r'\{.*"sql"\s*:\s*".*?".*\}', content, re.DOTALL)
            if json_match:
                logger.info(f"Found JSON via regex: {json_match.group()[:200]}...")
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError as e2:
                    logger.error(f"Regex JSON also invalid: {e2}")
                    # Retourner le texte brut comme message (pas d'erreur)
                    result = {
                        "sql": "",
                        "message": content,
                        "chart": {"type": "none", "x": None, "y": None, "title": ""}
                    }
            else:
                # Pas de JSON trouvé - retourner le texte brut comme message
                logger.info("No JSON found, returning raw text as message")
                result = {
                    "sql": "",
                    "message": content,
                    "chart": {"type": "none", "x": None, "y": None, "title": ""}
                }

        if isinstance(result, list):
            result = result[0] if result else {}
        result["_metadata"] = {
            "model_name": response.model_name,
            "tokens_input": response.tokens_input,
            "tokens_output": response.tokens_output,
            "response_time_ms": response.response_time_ms
        }
        return result

    except PromptNotConfiguredError as e:
        # Prompt non configuré en base
        logger.error(f"Prompt non configuré: {e.prompt_key}")
        raise HTTPException(
            status_code=503,
            detail=f"Prompt '{e.prompt_key}' non configuré. Exécutez: python seed_prompts.py"
        ) from e

    except LLMError as e:
        # Erreur typée du service LLM - mapper via i18n
        logger.error(f"LLM Error: {e.code.value} - {e.details}")
        detail = t(e.code.value, provider=e.provider, error=e.details)
        raise HTTPException(status_code=500, detail=detail) from e


@app.get("/health")
async def health_check():
    """Vérifie que l'API est opérationnelle"""
    llm_status = check_llm_status()
    return {
        "status": "ok",
        "database": "connected" if db_connection else "disconnected",
        "llm": llm_status
    }


@app.post("/refresh-schema")
async def refresh_schema():
    """Rafraîchit le cache du schéma depuis le catalogue SQLite."""
    global db_schema_cache
    db_schema_cache = None  # Force le rechargement
    db_schema_cache = get_schema_for_llm()
    return {"status": "ok", "message": "Schéma rafraîchi", "schema_preview": db_schema_cache[:500] + "..."}


@app.get("/schema")
async def get_schema():
    """Retourne le schéma actuel utilisé par le LLM."""
    return {"schema": get_system_instruction()}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: QuestionRequest):
    """
    Analyse une question en langage naturel:
    1. Appelle le LLM pour générer SQL + message + config chart
    2. Exécute le SQL sur DuckDB
    3. Retourne le tout au frontend
    """
    try:
        # 1. Appeler le LLM avec les filtres
        llm_response = call_llm_for_analytics(request.question, filters=request.filters)

        sql = llm_response.get("sql", "")
        message = llm_response.get("message", "")
        chart = llm_response.get("chart") or {"type": "none", "x": None, "y": None, "title": ""}
        metadata = llm_response.get("_metadata", {})

        if not sql:
            raise HTTPException(status_code=400, detail="Le LLM n'a pas généré de requête SQL")

        # 2. Exécuter le SQL
        data = execute_query(sql)

        # 3. Retourner la réponse complète avec métadonnées
        return AnalysisResponse(
            message=message,
            sql=sql,
            chart=ChartConfig(**chart),
            data=data,
            model_name=metadata.get("model_name", "unknown"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# ENDPOINTS CONVERSATIONS
# ========================================

@app.post("/conversations")
async def create_new_conversation():
    """Crée une nouvelle conversation."""
    conversation_id = create_conversation()
    return {"id": conversation_id, "message": "Conversation créée"}


@app.get("/conversations")
async def list_conversations(limit: int = 20):
    """Liste les conversations récentes."""
    conversations = get_conversations(limit)
    return {"conversations": conversations}


@app.delete("/conversations/{conversation_id}")
async def remove_conversation(conversation_id: int):
    """Supprime une conversation et ses messages."""
    deleted = delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")
    return {"message": "Conversation supprimée"}


@app.delete("/conversations")
async def remove_all_conversations():
    """Supprime toutes les conversations et leurs messages."""
    deleted_count = delete_all_conversations()
    return {"message": f"{deleted_count} conversation(s) supprimée(s)", "count": deleted_count}


@app.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int):
    """Récupère les messages d'une conversation."""
    messages = get_messages(conversation_id)
    return {"messages": messages}


@app.post("/conversations/{conversation_id}/analyze")
async def analyze_in_conversation(conversation_id: int, request: QuestionRequest):
    """
    Analyse une question dans le contexte d'une conversation.
    Sauvegarde le message user et la réponse assistant.
    """
    try:
        # Sauvegarder le message user
        add_message(
            conversation_id=conversation_id,
            role="user",
            content=request.question
        )

        # Appeler le LLM avec les filtres et le mode contexte
        llm_response = call_llm_for_analytics(
            request.question,
            conversation_id,
            request.filters,
            use_context=request.use_context
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
                response_time_ms=metadata.get("response_time_ms")
            )
            return {
                "message_id": message_id,
                "message": message or "Je n'ai pas compris votre demande.",
                "sql": "",
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms")
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
                response_time_ms=metadata.get("response_time_ms")
            )
            return {
                "message_id": message_id,
                "message": message,
                "sql": sql,
                "sql_error": sql_error_str,
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms")
            }

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
            response_time_ms=metadata.get("response_time_ms")
        )

        return {
            "message_id": message_id,
            "message": message,
            "sql": sql,
            "chart": chart,
            "data": data,
            "model_name": metadata.get("model_name", "unknown"),
            "tokens_input": metadata.get("tokens_input"),
            "tokens_output": metadata.get("tokens_output"),
            "response_time_ms": metadata.get("response_time_ms")
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========================================
# ENDPOINTS RAPPORTS SAUVEGARDÉS
# ========================================

@app.get("/reports")
async def list_reports():
    """Liste les rapports sauvegardés."""
    reports = get_saved_reports()
    return {"reports": reports}


@app.post("/reports")
async def create_report(request: SaveReportRequest):
    """Sauvegarde un nouveau rapport."""
    report_id = save_report(
        title=request.title,
        question=request.question,
        sql_query=request.sql_query,
        chart_config=request.chart_config,
        message_id=request.message_id
    )
    return {"id": report_id, "message": "Rapport sauvegardé"}


@app.delete("/reports/{report_id}")
async def remove_report(report_id: int):
    """Supprime un rapport."""
    deleted = delete_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")
    return {"message": "Rapport supprimé"}


@app.patch("/reports/{report_id}/pin")
async def pin_report(report_id: int):
    """Toggle l'état épinglé d'un rapport."""
    updated = toggle_pin_report(report_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")
    return {"message": "État épinglé modifié"}


@app.post("/reports/{report_id}/execute")
async def execute_report(report_id: int):
    """
    Exécute la requête SQL d'un rapport sauvegardé.
    Retourne les données fraîches + la config du graphique.
    """
    # Récupérer le rapport
    reports = get_saved_reports()
    report = next((r for r in reports if r["id"] == report_id), None)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    sql_query = report.get("sql_query")
    if not sql_query:
        raise HTTPException(status_code=400, detail="Ce rapport n'a pas de requête SQL")

    try:
        # Exécuter la requête SQL
        data = execute_query(sql_query)

        # Parser la config du graphique
        chart_config = {"type": "none", "x": "", "y": "", "title": ""}
        if report.get("chart_config"):
            try:
                chart_config = json.loads(report["chart_config"])
            except json.JSONDecodeError:
                pass

        return {
            "report_id": report_id,
            "title": report.get("title", ""),
            "sql": sql_query,
            "chart": chart_config,
            "data": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur exécution SQL: {str(e)}") from e


# ========================================
# ENDPOINTS SETTINGS
# ========================================

@app.get("/settings")
async def get_settings():
    """Récupère toutes les configurations + statut LLM."""
    settings = get_all_settings()

    # Ajouter les infos LLM
    llm_status = check_llm_status()
    default_model = get_default_model()

    # Liste des providers avec statut des clés
    providers = get_providers()
    providers_status = []
    for p in providers:
        hint = get_api_key_hint(p["name"])
        providers_status.append({
            "name": p["name"],
            "display_name": p["display_name"],
            "type": p["type"],
            "requires_api_key": p["requires_api_key"],
            "api_key_configured": hint is not None,
            "api_key_hint": hint
        })

    return {
        "settings": settings,
        "llm": {
            "status": llm_status["status"],
            "message": llm_status.get("message"),
            "current_model": default_model,
            "providers": providers_status
        }
    }


@app.put("/settings")
async def update_settings(request: SettingsUpdateRequest):
    """Met à jour les configurations LLM."""
    messages = []

    # Mettre à jour une clé API
    if request.api_key is not None and request.provider_name is not None:
        provider = get_provider_by_name(request.provider_name)
        if not provider:
            raise HTTPException(status_code=404, detail=f"Provider '{request.provider_name}' non trouvé")
        set_api_key(provider["id"], request.api_key)
        messages.append(f"Clé API {request.provider_name} mise à jour")

    # Mettre à jour le modèle par défaut
    if request.default_model_id is not None:
        set_default_model(request.default_model_id)
        messages.append(f"Modèle par défaut: {request.default_model_id}")

    if not messages:
        return {"message": "Aucune modification"}

    return {"message": "; ".join(messages)}


@app.get("/settings/{key}")
async def get_single_setting(key: str):
    """Récupère une configuration spécifique."""
    value = get_setting(key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Configuration '{key}' non trouvée")
    # Masquer les clés API
    if "api_key" in key.lower() and len(value) > 8:
        return {"key": key, "value": value[:4] + "..." + value[-4:]}
    return {"key": key, "value": value}


# ========================================
# ENDPOINTS CATALOGUE DE DONNÉES
# ========================================

@app.get("/catalog")
async def get_catalog():
    """
    Retourne le catalogue actuel depuis SQLite.
    Structure: datasources → tables → columns
    """
    from catalog import get_connection

    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer les datasources
    cursor.execute("SELECT * FROM datasources")
    datasources = [dict(row) for row in cursor.fetchall()]

    result = []
    for ds in datasources:
        # Récupérer les tables de cette datasource
        cursor.execute("""
            SELECT * FROM tables WHERE datasource_id = ?
            ORDER BY name
        """, (ds['id'],))
        tables = [dict(row) for row in cursor.fetchall()]

        tables_with_columns = []
        for table in tables:
            # Récupérer les colonnes de cette table
            cursor.execute("""
                SELECT * FROM columns WHERE table_id = ?
                ORDER BY name
            """, (table['id'],))
            columns = [dict(row) for row in cursor.fetchall()]

            # Récupérer les synonymes de chaque colonne
            for col in columns:
                cursor.execute("""
                    SELECT term FROM synonyms WHERE column_id = ?
                """, (col['id'],))
                col['synonyms'] = [row['term'] for row in cursor.fetchall()]

            table['columns'] = columns
            tables_with_columns.append(table)

        ds['tables'] = tables_with_columns
        result.append(ds)

    conn.close()
    return {"catalog": result}


@app.delete("/catalog")
async def delete_catalog():
    """
    Supprime tout le catalogue (pour permettre de retester la génération).
    Supprime aussi les widgets et questions suggérées associées.
    """
    from catalog import get_connection

    conn = get_connection()
    cursor = conn.cursor()

    # Supprimer le catalogue sémantique
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")

    # Supprimer les widgets, questions et KPIs générés
    try:
        cursor.execute("DELETE FROM widget_cache")
        cursor.execute("DELETE FROM widgets")
        cursor.execute("DELETE FROM suggested_questions")
        cursor.execute("DELETE FROM kpis")
    except Exception:
        pass  # Tables n'existent peut-être pas encore

    conn.commit()
    conn.close()

    # Rafraîchir le cache du schéma
    global db_schema_cache
    db_schema_cache = None

    return {"status": "ok", "message": "Catalogue supprimé"}


@app.post("/catalog/generate")
async def generate_catalog_endpoint():
    """
    Génère le catalogue complet avec le nouveau moteur:
    1. Extraction des métadonnées depuis connexion DuckDB existante
    2. Pydantic pour les modèles dynamiques (JSON Schema)
    3. Instructor pour les appels LLM structurés
    4. Sauvegarde dans SQLite
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    from catalog import get_connection
    from catalog_engine import generate_catalog_from_connection

    # Vérifier que le LLM est configuré
    llm_status = check_llm_status()
    if llm_status["status"] != "ok":
        raise HTTPException(status_code=500, detail=llm_status.get("message", "LLM non configuré"))

    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

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
    def run_generation():
        return generate_catalog_from_connection(db_connection=db_connection)

    try:
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, run_generation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération catalogue: {e}") from e

    # 3. Rafraîchir le cache du schéma
    global db_schema_cache
    db_schema_cache = None
    db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Catalogue généré"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0)
    }


# ========================================
# ENDPOINTS LLM
# ========================================

@app.get("/llm/providers")
async def list_llm_providers():
    """Liste tous les providers LLM disponibles."""
    from llm_config import check_local_provider_available

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
async def list_llm_models(provider_name: str | None = None):
    """Liste les modèles LLM disponibles (optionnellement filtrés par provider)."""
    if provider_name:
        provider = get_provider_by_name(provider_name)
        if not provider:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' non trouvé")
        models = get_models(provider["id"])
    else:
        models = get_models()
    return {"models": models}


@app.get("/llm/models/default")
async def get_llm_default_model():
    """Récupère le modèle LLM par défaut."""
    model = get_default_model()
    if not model:
        raise HTTPException(status_code=404, detail="Aucun modèle par défaut configuré")
    return {"model": model}


@app.put("/llm/models/default/{model_id}")
async def set_llm_default_model(model_id: str):
    """Définit le modèle LLM par défaut."""
    # Chercher le modèle par model_id
    models = get_models()
    model = next((m for m in models if m["model_id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail=f"Modèle '{model_id}' non trouvé")

    # set_default_model attend le model_id string (pas l'id interne)
    set_default_model(model_id)
    return {"message": f"Modèle par défaut: {model_id}"}


class ProviderConfigRequest(BaseModel):
    base_url: str | None = None


@app.put("/llm/providers/{provider_name}/config")
async def update_provider_config(provider_name: str, config: ProviderConfigRequest):
    """Met à jour la configuration d'un provider (base_url pour self-hosted)."""
    from llm_config import update_provider_base_url

    provider = get_provider_by_name(provider_name)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' non trouvé")

    if provider.get("requires_api_key"):
        raise HTTPException(status_code=400, detail="Ce provider n'accepte pas de base_url")

    if config.base_url:
        update_provider_base_url(provider["id"], config.base_url)
        return {"message": f"Configuration mise à jour pour {provider_name}"}
    else:
        update_provider_base_url(provider["id"], None)
        return {"message": f"Configuration supprimée pour {provider_name}"}


@app.get("/llm/costs")
async def get_llm_costs(days: int = 30):
    """Récupère les coûts LLM des N derniers jours."""
    total = get_total_costs(days)
    by_hour = get_costs_by_hour(days)
    by_model = get_costs_by_model(days)

    return {
        "period_days": days,
        "total": total,
        "by_hour": by_hour,
        "by_model": by_model
    }


@app.get("/llm/status")
async def get_llm_status_endpoint():
    """Vérifie le statut du LLM."""
    return check_llm_status()


# ========================================
# ENDPOINTS PROMPTS LLM
# ========================================

@app.get("/llm/prompts")
async def list_llm_prompts(category: str | None = None):
    """Liste tous les prompts LLM."""
    prompts = get_prompts(category=category)
    return {"prompts": prompts}


@app.get("/llm/prompts/{key}")
async def get_llm_prompt(key: str):
    """Récupère le prompt actif pour une clé."""
    prompt = get_active_prompt(key)
    if not prompt:
        raise HTTPException(status_code=404, detail=f"Prompt '{key}' non trouvé")
    return {"prompt": prompt}


class SetActivePromptRequest(BaseModel):
    version: str


@app.put("/llm/prompts/{key}/active")
async def set_llm_active_prompt(key: str, request: SetActivePromptRequest):
    """Active une version spécifique d'un prompt."""
    success = set_active_prompt(key, request.version)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Prompt '{key}' version '{request.version}' non trouvé"
        )
    return {"message": f"Prompt '{key}' version '{request.version}' activé"}


# ========================================
# ENDPOINTS WIDGETS DYNAMIQUES
# ========================================

@app.get("/widgets")
async def list_widgets(use_cache: bool = True):
    """
    Récupère tous les widgets actifs avec leurs données.
    Les données sont cachées pour éviter 100 clients = 100 requêtes identiques.

    Query params:
        use_cache: Si False, force le recalcul (défaut: True)
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    try:
        widgets = get_all_widgets_with_data(db_connection, use_cache=use_cache)
        return {"widgets": widgets}
    except Exception as e:
        # Table n'existe pas encore ou autre erreur -> retourner liste vide
        logging.warning(f"Erreur chargement widgets: {e}")
        return {"widgets": []}


@app.post("/widgets/refresh")
async def refresh_widgets():
    """
    Force le recalcul du cache de tous les widgets.
    Utile après une mise à jour des données ou du catalogue.
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    result = refresh_all_widgets_cache(db_connection)
    return result


@app.post("/widgets/{widget_id}/refresh")
async def refresh_widget(widget_id: str):
    """
    Force le recalcul du cache d'un widget spécifique.
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    result = refresh_single_widget_cache(widget_id, db_connection)
    if "error" in result and not result.get("success", True):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ========================================
# ENDPOINTS KPIs
# ========================================

@app.get("/kpis")
async def list_kpis():
    """
    Récupère les 4 KPIs avec leurs données calculées.
    Exécute les 3 requêtes SQL par KPI (value, trend, sparkline).
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    try:
        from kpi_service import get_all_kpis_with_data
        kpis = get_all_kpis_with_data(db_connection)
        return {"kpis": kpis}
    except Exception as e:
        logging.warning(f"Erreur chargement KPIs: {e}")
        return {"kpis": []}


# ========================================
# ENDPOINTS QUESTIONS SUGGÉRÉES
# ========================================

@app.get("/suggested-questions")
async def list_suggested_questions():
    """
    Récupère les questions suggérées générées par le LLM.
    Ces questions sont générées lors de la création du catalogue.
    """
    try:
        questions = get_suggested_questions(enabled_only=True)
        return {"questions": questions}
    except Exception as e:
        # Table n'existe pas encore -> retourner liste vide
        logging.warning(f"Erreur chargement questions suggérées: {e}")
        return {"questions": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)  # noqa: S104
