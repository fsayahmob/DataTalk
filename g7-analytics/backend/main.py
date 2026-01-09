"""
FastAPI Backend pour G7 Analytics
Gère les appels Gemini + DuckDB dans un seul processus Python persistant
"""
import os
import json
from contextlib import asynccontextmanager
from typing import Any

import duckdb
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import time
from catalog import (
    get_schema_for_llm,
    init_catalog,
    # Conversations
    create_conversation,
    get_conversations,
    delete_conversation,
    get_messages,
    add_message,
    # Rapports
    save_report,
    get_saved_reports,
    delete_report,
    toggle_pin_report,
    # Questions prédéfinies
    get_predefined_questions,
    # Settings
    get_setting,
    set_setting,
    get_all_settings,
)

# Charger les variables d'environnement
load_dotenv()

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Connexion DuckDB persistante
db_connection: duckdb.DuckDBPyConnection | None = None

# Schéma chargé dynamiquement depuis le catalogue
db_schema_cache: str | None = None


def get_system_prompt() -> str:
    """Génère le prompt système avec le schéma du catalogue."""
    global db_schema_cache

    if db_schema_cache is None:
        db_schema_cache = get_schema_for_llm()

    return f"""Tu es un assistant analytique pour G7 Taxis. Tu analyses les données d'évaluations clients.

{db_schema_cache}

TYPES DE GRAPHIQUES DISPONIBLES:
- bar: Barres verticales pour comparer des catégories
- line: Lignes pour montrer une évolution temporelle
- pie: Camembert pour montrer une répartition (utiliser uniquement si <= 10 valeurs)
- area: Aires pour montrer une évolution avec volume
- scatter: Nuage de points pour montrer une corrélation
- none: Pas de graphique, juste afficher les données en tableau

RÈGLES:
1. Génère du SQL DuckDB valide
2. Utilise des alias clairs en français pour les colonnes (ex: AS note_moyenne)
3. LIMITE des résultats:
   - Si l'utilisateur demande "tous", "toutes", "liste", "liste complète", "exhaustif" → LIMIT 5000 (ou pas de limit)
   - Si l'utilisateur demande un "top N" ou "les N premiers" → LIMIT N
   - Pour les agrégations (GROUP BY, COUNT, AVG, etc.) → pas de limite stricte
   - Sinon par défaut → LIMIT 500 (le frontend gère la pagination)
4. Pour les graphiques pie, limite à 10 catégories max
5. Choisis le type de graphique le plus adapté à la question
6. Réponds toujours en français
7. Pour les listes de texte (commentaires, etc.), utilise chart.type = "none"

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{{
  "sql": "SELECT ...",
  "message": "Explication en français des résultats...",
  "chart": {{
    "type": "bar|line|pie|area|scatter|none",
    "x": "nom_colonne_axe_x",
    "y": "nom_colonne_axe_y",
    "title": "Titre du graphique"
  }}
}}"""


# Modèles Pydantic
class QuestionRequest(BaseModel):
    question: str


class ChartConfig(BaseModel):
    type: str
    x: str | None = None
    y: str | None = None
    title: str = ""
    color: str | None = None


class AnalysisResponse(BaseModel):
    message: str
    sql: str
    chart: ChartConfig
    data: list[dict[str, Any]]
    # Métadonnées de performance
    model_name: str = "gemini-2.0-flash"
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
    gemini_api_key: str | None = None
    model_name: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application"""
    global db_connection

    # Startup: ouvrir la connexion DuckDB
    print(f"Connexion à DuckDB: {DB_PATH}")
    db_connection = duckdb.connect(DB_PATH, read_only=True)
    print("DuckDB connecté")

    # Configurer Gemini
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        print("Gemini configuré")
    else:
        print("ATTENTION: GEMINI_API_KEY non définie")

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
    import pandas as pd
    import numpy as np

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


def call_gemini(question: str) -> dict:
    """Appelle Gemini pour générer SQL + message + config chart + métadonnées"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurée")

    model_name = "gemini-2.0-flash"
    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config={
            "temperature": 0.1,
            "response_mime_type": "application/json"
        }
    )

    start_time = time.time()

    response = model.generate_content([
        {"role": "user", "parts": [get_system_prompt()]},
        {"role": "model", "parts": ['{"sql": "", "message": "", "chart": {"type": "none", "x": "", "y": "", "title": ""}}']},
        {"role": "user", "parts": [question]}
    ])

    response_time_ms = int((time.time() - start_time) * 1000)

    # Extraire les métadonnées de tokens
    tokens_input = None
    tokens_output = None
    if hasattr(response, 'usage_metadata'):
        usage = response.usage_metadata
        tokens_input = getattr(usage, 'prompt_token_count', None)
        tokens_output = getattr(usage, 'candidates_token_count', None)

    try:
        result = json.loads(response.text)
        result["_metadata"] = {
            "model_name": model_name,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "response_time_ms": response_time_ms
        }
        return result
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Réponse Gemini invalide: {e}")


@app.get("/health")
async def health_check():
    """Vérifie que l'API est opérationnelle"""
    return {
        "status": "ok",
        "database": "connected" if db_connection else "disconnected",
        "gemini": "configured" if GEMINI_API_KEY else "not configured"
    }


@app.post("/refresh-schema")
async def refresh_schema():
    """Rafraîchit le cache du schéma depuis le catalogue SQLite."""
    global db_schema_cache
    db_schema_cache = None  # Force le rechargement
    new_schema = get_schema_for_llm()
    db_schema_cache = new_schema
    return {"status": "ok", "message": "Schéma rafraîchi", "schema_preview": new_schema[:500] + "..."}


@app.get("/schema")
async def get_schema():
    """Retourne le schéma actuel utilisé par le LLM."""
    return {"schema": get_system_prompt()}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: QuestionRequest):
    """
    Analyse une question en langage naturel:
    1. Appelle Gemini pour générer SQL + message + config chart
    2. Exécute le SQL sur DuckDB
    3. Retourne le tout au frontend
    """
    try:
        # 1. Appeler Gemini
        gemini_response = call_gemini(request.question)

        sql = gemini_response.get("sql", "")
        message = gemini_response.get("message", "")
        chart = gemini_response.get("chart", {"type": "none", "x": "", "y": "", "title": ""})
        metadata = gemini_response.get("_metadata", {})

        if not sql:
            raise HTTPException(status_code=400, detail="Gemini n'a pas généré de requête SQL")

        # 2. Exécuter le SQL
        data = execute_query(sql)

        # 3. Retourner la réponse complète avec métadonnées
        return AnalysisResponse(
            message=message,
            sql=sql,
            chart=ChartConfig(**chart),
            data=data,
            model_name=metadata.get("model_name", "gemini-2.0-flash"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

        # Appeler Gemini
        gemini_response = call_gemini(request.question)

        sql = gemini_response.get("sql", "")
        message = gemini_response.get("message", "")
        chart = gemini_response.get("chart", {"type": "none", "x": "", "y": "", "title": ""})
        metadata = gemini_response.get("_metadata", {})

        if not sql:
            raise HTTPException(status_code=400, detail="Gemini n'a pas généré de requête SQL")

        # Exécuter le SQL
        data = execute_query(sql)

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
            "model_name": metadata.get("model_name", "gemini-2.0-flash"),
            "tokens_input": metadata.get("tokens_input"),
            "tokens_output": metadata.get("tokens_output"),
            "response_time_ms": metadata.get("response_time_ms")
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


# ========================================
# ENDPOINTS QUESTIONS PRÉDÉFINIES
# ========================================

@app.get("/questions/predefined")
async def list_predefined_questions():
    """Récupère les questions prédéfinies."""
    questions = get_predefined_questions()
    return {"questions": questions}


# ========================================
# ENDPOINTS SETTINGS
# ========================================

@app.get("/settings")
async def get_settings():
    """Récupère toutes les configurations."""
    settings = get_all_settings()
    # Masquer partiellement la clé API si elle existe
    if "gemini_api_key" in settings:
        key = settings["gemini_api_key"]
        if key and len(key) > 8:
            settings["gemini_api_key_masked"] = key[:4] + "..." + key[-4:]
            del settings["gemini_api_key"]
    return {"settings": settings}


@app.put("/settings")
async def update_settings(request: SettingsUpdateRequest):
    """Met à jour les configurations."""
    if request.gemini_api_key is not None:
        set_setting("gemini_api_key", request.gemini_api_key)
        # Reconfigurer Gemini avec la nouvelle clé
        global GEMINI_API_KEY
        GEMINI_API_KEY = request.gemini_api_key
        genai.configure(api_key=GEMINI_API_KEY)

    if request.model_name is not None:
        set_setting("model_name", request.model_name)

    return {"message": "Configuration mise à jour"}


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
