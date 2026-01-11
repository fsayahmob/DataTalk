"""
FastAPI Backend pour G7 Analytics
Gère les appels Gemini + DuckDB dans un seul processus Python persistant
"""
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import duckdb
import google.generativeai as genai
from catalog import (
    add_message,
    create_conversation,
    delete_conversation,
    delete_report,
    get_all_settings,
    get_conversations,
    get_messages,
    # Questions prédéfinies
    get_predefined_questions,
    get_saved_reports,
    get_schema_for_llm,
    # Settings
    get_setting,
    # Rapports
    save_report,
    set_setting,
    toggle_pin_report,
)
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Charger les variables d'environnement
load_dotenv()

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Connexion DuckDB persistante
db_connection: duckdb.DuckDBPyConnection | None = None

# Schéma chargé dynamiquement depuis le catalogue
db_schema_cache: str | None = None

# Modèle Gemini caché (évite de recréer à chaque requête)
gemini_model: genai.GenerativeModel | None = None


def get_system_instruction() -> str:
    """Génère les instructions système pour Gemini."""
    global db_schema_cache

    if db_schema_cache is None:
        db_schema_cache = get_schema_for_llm()

    return f"""Assistant analytique. Réponds en français.

{db_schema_cache}

GRAPHIQUES: bar, line, pie (≤10 items), area, scatter, none
RÈGLES: SQL DuckDB SELECT, alias français, ORDER BY pour évolutions/rankings
LIMIT: "top N"→N, "tous"→aucun, défaut→500, agrégations→pas de limit
MULTI-SÉRIES: PIVOT SQL + y:["col1","col2",...], max 5-6 séries
VUE evaluation_categories: pour sentiment par catégorie sémantique
DUCKDB TIME: EXTRACT(HOUR FROM col) ou HOUR(col), PAS strftime

JSON: {{"sql":"SELECT..."|null,"message":"...","chart":{{"type":"...","x":"col","y":"col|[cols]","title":"..."}}}}"""


# Modèles Pydantic
class QuestionRequest(BaseModel):
    question: str


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


def get_gemini_model() -> genai.GenerativeModel:
    """Retourne le modèle Gemini caché (créé une seule fois)."""
    global gemini_model

    if gemini_model is None:
        gemini_model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            generation_config={
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        )
    return gemini_model


def call_gemini(question: str) -> dict:
    """Appelle Gemini pour générer SQL + message + config chart + métadonnées."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurée")

    model = get_gemini_model()
    model_name = "gemini-2.0-flash"

    start_time = time.time()

    # Format multi-turn comme avant (plus rapide que system_instruction)
    response = model.generate_content([
        {"role": "user", "parts": [get_system_instruction()]},
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
        raise HTTPException(status_code=500, detail=f"Réponse Gemini invalide: {e}") from e


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
    global db_schema_cache, gemini_model
    db_schema_cache = None  # Force le rechargement
    gemini_model = None  # Force la recréation du modèle avec le nouveau schéma
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
            # Gemini n'a pas généré de SQL - retourner quand même le message
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
                "model_name": metadata.get("model_name", "gemini-2.0-flash"),
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
                "model_name": metadata.get("model_name", "gemini-2.0-flash"),
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
            "model_name": metadata.get("model_name", "gemini-2.0-flash"),
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


# ========================================
# ENDPOINTS STATISTIQUES SÉMANTIQUES
# ========================================

@app.get("/semantic-stats")
async def get_semantic_stats():
    """
    Retourne les statistiques sémantiques des commentaires enrichis.
    Utilisé pour les KPIs et graphiques de la zone 3.
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    # Statistiques globales
    global_stats = db_connection.execute("""
        SELECT
            COUNT(*) as total_evaluations,
            COUNT(CASE WHEN commentaire IS NOT NULL AND commentaire != '' THEN 1 END) as total_commentaires,
            COUNT(CASE WHEN categories IS NOT NULL AND categories != '[]' THEN 1 END) as commentaires_enrichis,
            ROUND(AVG(CASE WHEN sentiment_global IS NOT NULL THEN sentiment_global END), 2) as sentiment_moyen
        FROM evaluations
    """).fetchone()

    # Distribution des sentiments
    sentiment_distribution = db_connection.execute("""
        SELECT
            CASE
                WHEN sentiment_global >= 0.5 THEN 'Très positif'
                WHEN sentiment_global >= 0.1 THEN 'Positif'
                WHEN sentiment_global >= -0.1 THEN 'Neutre'
                WHEN sentiment_global >= -0.5 THEN 'Négatif'
                ELSE 'Très négatif'
            END as sentiment_label,
            COUNT(*) as count
        FROM evaluations
        WHERE sentiment_global IS NOT NULL
        GROUP BY sentiment_label
        ORDER BY
            CASE sentiment_label
                WHEN 'Très positif' THEN 1
                WHEN 'Positif' THEN 2
                WHEN 'Neutre' THEN 3
                WHEN 'Négatif' THEN 4
                WHEN 'Très négatif' THEN 5
            END
    """).fetchall()

    # Distribution des catégories avec sentiment moyen
    # On parse le JSON des catégories et sentiment_par_categorie
    categories_raw = db_connection.execute("""
        SELECT categories, sentiment_par_categorie, sentiment_global
        FROM evaluations
        WHERE categories IS NOT NULL AND categories != '[]'
    """).fetchall()

    # Calculer le sentiment moyen par catégorie
    from collections import defaultdict
    category_sentiments = defaultdict(list)

    for row in categories_raw:
        try:
            cats = json.loads(row[0])
            sent_par_cat = json.loads(row[1]) if row[1] else {}
            sent_global = row[2]

            for cat in cats:
                # Utiliser le sentiment par catégorie si disponible, sinon le global
                if cat in sent_par_cat:
                    category_sentiments[cat].append(sent_par_cat[cat])
                elif sent_global is not None:
                    category_sentiments[cat].append(sent_global)
        except Exception:
            continue  # Skip malformed rows silently

    # Calculer les moyennes et trier
    category_stats = []
    for cat, sentiments in category_sentiments.items():
        if sentiments:
            avg_sentiment = sum(sentiments) / len(sentiments)
            category_stats.append({
                "category": cat,
                "count": len(sentiments),
                "sentiment": round(avg_sentiment, 2)
            })

    # Trier par sentiment pour identifier alertes et points forts
    category_stats_sorted = sorted(category_stats, key=lambda x: x["sentiment"])

    # Top 5 alertes (sentiment le plus négatif)
    alerts = [c for c in category_stats_sorted if c["sentiment"] < 0][:5]

    # Top 5 points forts (sentiment le plus positif)
    strengths = [c for c in reversed(category_stats_sorted) if c["sentiment"] > 0][:5]

    return {
        "global": {
            "total_evaluations": global_stats[0],
            "total_commentaires": global_stats[1],
            "commentaires_enrichis": global_stats[2],
            "sentiment_moyen": global_stats[3] or 0,
            "taux_enrichissement": round((global_stats[2] / global_stats[1] * 100) if global_stats[1] > 0 else 0, 1)
        },
        "sentiment_distribution": [
            {"label": row[0], "count": row[1]}
            for row in sentiment_distribution
        ],
        "alerts": alerts,
        "strengths": strengths,
        "categories_by_sentiment": category_stats_sorted
    }


# ========================================
# ENDPOINT STATISTIQUES GLOBALES (KPIs)
# ========================================

@app.get("/stats/global")
async def get_global_stats():
    """
    Retourne les statistiques globales pour les KPIs du dashboard.
    Utilisé par VisualizationZone pour afficher les 4 KPIs principaux.
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    stats = db_connection.execute("""
        SELECT
            COUNT(*) as total_evaluations,
            ROUND(AVG(note_eval), 2) as note_moyenne,
            COUNT(CASE WHEN commentaire IS NOT NULL AND commentaire != '' THEN 1 END) as total_commentaires,
            COUNT(DISTINCT cod_taxi) as total_chauffeurs
        FROM evaluations
    """).fetchone()

    return {
        "total_evaluations": stats[0],
        "note_moyenne": stats[1],
        "total_commentaires": stats[2],
        "total_chauffeurs": stats[3]
    }


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
    """
    from catalog import get_connection

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM synonyms")
    cursor.execute("DELETE FROM columns")
    cursor.execute("DELETE FROM tables")
    cursor.execute("DELETE FROM datasources")
    conn.commit()
    conn.close()

    # Rafraîchir le cache du schéma
    global db_schema_cache, gemini_model
    db_schema_cache = None
    gemini_model = None

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
    from catalog import get_connection
    from catalog_engine import generate_catalog_from_connection

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurée")

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

    # 2. Générer le catalogue avec la connexion DuckDB existante
    try:
        result = generate_catalog_from_connection(
            db_connection=db_connection,
            api_key=GEMINI_API_KEY,
            model_name="gemini-2.0-flash"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération catalogue: {e}") from e

    # 3. Rafraîchir le cache du schéma
    global db_schema_cache, gemini_model
    db_schema_cache = None
    gemini_model = None
    db_schema_cache = get_schema_for_llm()

    return {
        "status": result.get("status", "ok"),
        "message": result.get("message", "Catalogue généré"),
        "tables_count": result.get("stats", {}).get("tables", 0),
        "columns_count": result.get("stats", {}).get("columns", 0),
        "synonyms_count": result.get("stats", {}).get("synonyms", 0)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)  # noqa: S104
