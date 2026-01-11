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

class CatalogColumn(BaseModel):
    name: str
    data_type: str
    description: str | None = None
    sample_values: str | None = None
    value_range: str | None = None


class CatalogTable(BaseModel):
    name: str
    description: str | None = None
    row_count: int | None = None
    columns: list[CatalogColumn] = []


class CatalogRelationship(BaseModel):
    """Relation entre deux tables (FK)"""
    source_table: str
    source_column: str
    target_table: str
    target_column: str
    constraint_name: str | None = None


class CatalogExtractResponse(BaseModel):
    datasource: str
    tables: list[CatalogTable]
    relationships: list[CatalogRelationship] = []


class CatalogEnrichRequest(BaseModel):
    tables: list[CatalogTable]


class CatalogApplyRequest(BaseModel):
    tables: list[CatalogTable]


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


@app.post("/catalog/extract")
async def extract_catalog_from_duckdb():
    """
    Extrait la structure depuis DuckDB avec des exemples de valeurs.
    Phase 1 du workflow (style Alation/DataHub).
    """
    if not db_connection:
        raise HTTPException(status_code=500, detail="Base de données non connectée")

    tables_result = []

    # Lister les tables DuckDB
    tables = db_connection.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
    """).fetchall()

    for (table_name,) in tables:
        # Compter les lignes
        row_count = db_connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

        # Récupérer les colonnes avec leurs types
        columns_info = db_connection.execute(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """).fetchall()

        columns_result = []
        for col_name, col_type in columns_info:
            # Récupérer 5 exemples de valeurs distinctes
            try:
                samples = db_connection.execute(f"""
                    SELECT DISTINCT "{col_name}"::VARCHAR
                    FROM {table_name}
                    WHERE "{col_name}" IS NOT NULL
                    LIMIT 5
                """).fetchall()
                sample_values = ", ".join([str(s[0])[:50] for s in samples if s[0]])
            except Exception:
                sample_values = ""

            # Calculer le range pour les numériques
            value_range = None
            if 'int' in col_type.lower() or 'float' in col_type.lower() or 'decimal' in col_type.lower() or 'double' in col_type.lower():
                try:
                    min_max = db_connection.execute(f"""
                        SELECT MIN("{col_name}"), MAX("{col_name}")
                        FROM {table_name}
                        WHERE "{col_name}" IS NOT NULL
                    """).fetchone()
                    if min_max[0] is not None and min_max[1] is not None:
                        value_range = f"{min_max[0]} - {min_max[1]}"
                except Exception:
                    pass

            columns_result.append(CatalogColumn(
                name=col_name,
                data_type=col_type,
                description=None,  # Sera enrichi par LLM
                sample_values=sample_values[:200] if sample_values else None,
                value_range=value_range
            ))

        tables_result.append(CatalogTable(
            name=table_name,
            description=None,  # Sera enrichi par LLM
            row_count=row_count,
            columns=columns_result
        ))

    # Détecter les relations entre tables
    # Stratégie: chercher les colonnes communes entre tables (clés naturelles)
    relationships = []

    # Créer un index des colonnes par table
    table_columns: dict[str, set[str]] = {}
    for table in tables_result:
        table_columns[table.name.lower()] = {col.name.lower() for col in table.columns}

    # Colonnes candidates pour les relations (clés naturelles communes)
    key_columns = {'num_course', 'cod_taxi', 'cod_client', 'dat_course', 'id'}

    # Pour chaque paire de tables, chercher les colonnes communes
    table_list = list(tables_result)
    for i, table1 in enumerate(table_list):
        for table2 in table_list[i + 1:]:
            # Trouver les colonnes communes
            common_cols = table_columns[table1.name.lower()] & table_columns[table2.name.lower()]
            # Filtrer sur les colonnes de type "clé"
            key_common = common_cols & key_columns

            if key_common:
                # Créer une relation pour la première clé commune trouvée
                key_col = sorted(key_common)[0]  # Prendre la première par ordre alpha
                # Déterminer la direction (table avec plus de lignes = table principale)
                t1_rows = table1.row_count or 0
                t2_rows = table2.row_count or 0

                if t1_rows >= t2_rows:
                    # table2 référence table1
                    relationships.append(CatalogRelationship(
                        source_table=table2.name,
                        source_column=key_col,
                        target_table=table1.name,
                        target_column=key_col,
                        constraint_name=f"fk_{table2.name}_{key_col}"
                    ))
                else:
                    # table1 référence table2
                    relationships.append(CatalogRelationship(
                        source_table=table1.name,
                        source_column=key_col,
                        target_table=table2.name,
                        target_column=key_col,
                        constraint_name=f"fk_{table1.name}_{key_col}"
                    ))

    return CatalogExtractResponse(
        datasource="g7_analytics.duckdb",
        tables=tables_result,
        relationships=relationships
    )


@app.post("/catalog/enrich")
async def enrich_catalog_with_llm(request: CatalogEnrichRequest):
    """
    Enrichit le catalogue avec le LLM.
    Phase 2 du workflow - génère descriptions sémantiques.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurée")

    model = get_gemini_model()

    # Préparer le contexte pour le LLM
    tables_context = []
    for table in request.tables:
        cols_desc = []
        for col in table.columns:
            col_info = f"- {col.name} ({col.data_type})"
            if col.sample_values:
                col_info += f" [Exemples: {col.sample_values}]"
            if col.value_range:
                col_info += f" [Range: {col.value_range}]"
            cols_desc.append(col_info)

        tables_context.append(f"""
Table: {table.name} ({table.row_count} lignes)
Colonnes:
{chr(10).join(cols_desc)}
""")

    prompt = f"""Tu es un expert en data catalog. Analyse cette structure de base de données et génère des descriptions sémantiques.

INSTRUCTIONS:
- Déduis le contexte métier à partir des noms de tables et colonnes
- Génère des descriptions claires et pertinentes pour chaque élément

STRUCTURE À DOCUMENTER:
{chr(10).join(tables_context)}

GÉNÈRE un JSON avec cette structure:
{{
  "tables": [
    {{
      "name": "nom_table",
      "description": "Description métier claire de la table",
      "columns": [
        {{
          "name": "nom_colonne",
          "description": "Description métier de la colonne",
          "synonyms": ["terme1", "terme2"]  // Termes alternatifs pour recherche NLP
        }}
      ]
    }}
  ]
}}

RÈGLES:
- Descriptions en français, concises mais complètes
- Synonymes = termes que l'utilisateur pourrait utiliser (ex: "note" → ["étoiles", "score", "notation"])
- Garde les sample_values et value_range existants
"""

    try:
        response = model.generate_content(prompt)
        enriched = json.loads(response.text)

        # Fusionner avec les données d'origine (garder sample_values, value_range)
        result_tables = []
        for orig_table in request.tables:
            enriched_table = next(
                (t for t in enriched.get("tables", []) if t["name"] == orig_table.name),
                None
            )

            if enriched_table:
                # Fusionner les colonnes
                result_columns = []
                for orig_col in orig_table.columns:
                    enriched_col = next(
                        (c for c in enriched_table.get("columns", []) if c["name"] == orig_col.name),
                        None
                    )
                    result_columns.append({
                        "name": orig_col.name,
                        "data_type": orig_col.data_type,
                        "description": enriched_col.get("description") if enriched_col else None,
                        "sample_values": orig_col.sample_values,
                        "value_range": orig_col.value_range,
                        "synonyms": enriched_col.get("synonyms", []) if enriched_col else []
                    })

                result_tables.append({
                    "name": orig_table.name,
                    "description": enriched_table.get("description"),
                    "row_count": orig_table.row_count,
                    "columns": result_columns
                })
            else:
                # Table non enrichie, garder l'original
                result_tables.append(orig_table.model_dump())

        return {"tables": result_tables}

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Réponse LLM invalide: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur enrichissement: {e}") from e


@app.post("/catalog/apply")
async def apply_catalog(request: CatalogApplyRequest):
    """
    Sauvegarde le catalogue enrichi dans SQLite.
    Phase 3 du workflow - validation utilisateur puis insertion.
    """
    from catalog import (
        add_column,
        add_datasource,
        add_synonym,
        add_table,
        get_connection,
    )

    # Créer/mettre à jour la datasource
    datasource_id = add_datasource(
        name="g7_analytics",
        type="duckdb",
        path=DB_PATH,
        description="Base analytique G7 Taxis - Évaluations clients mai 2024"
    )

    if datasource_id is None:
        # Récupérer l'ID existant
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM datasources WHERE name = 'g7_analytics'")
        row = cursor.fetchone()
        datasource_id = row['id'] if row else None
        conn.close()

    if datasource_id is None:
        raise HTTPException(status_code=500, detail="Impossible de créer/trouver la datasource")

    tables_created = 0
    columns_created = 0
    synonyms_created = 0

    for table_data in request.tables:
        # Ajouter la table
        table_id = add_table(
            datasource_id=datasource_id,
            name=table_data.name,
            description=table_data.description,
            row_count=table_data.row_count
        )

        if table_id is None:
            # Récupérer l'ID existant
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM tables WHERE datasource_id = ? AND name = ?",
                (datasource_id, table_data.name)
            )
            row = cursor.fetchone()
            table_id = row['id'] if row else None
            conn.close()

        if table_id:
            tables_created += 1

            for col_data in table_data.columns:
                col_dict = col_data if isinstance(col_data, dict) else col_data.model_dump()

                column_id = add_column(
                    table_id=table_id,
                    name=col_dict["name"],
                    data_type=col_dict["data_type"],
                    description=col_dict.get("description"),
                    sample_values=col_dict.get("sample_values"),
                    value_range=col_dict.get("value_range")
                )

                if column_id is None:
                    # Récupérer l'ID existant
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT id FROM columns WHERE table_id = ? AND name = ?",
                        (table_id, col_dict["name"])
                    )
                    row = cursor.fetchone()
                    column_id = row['id'] if row else None
                    conn.close()

                if column_id:
                    columns_created += 1

                    # Ajouter les synonymes
                    synonyms = col_dict.get("synonyms", [])
                    for synonym in synonyms:
                        try:
                            add_synonym(column_id, synonym)
                            synonyms_created += 1
                        except Exception:
                            pass  # Ignorer les doublons

    # Rafraîchir le cache du schéma
    global db_schema_cache, gemini_model
    db_schema_cache = None
    gemini_model = None
    db_schema_cache = get_schema_for_llm()

    return {
        "status": "ok",
        "message": "Catalogue mis à jour",
        "stats": {
            "tables": tables_created,
            "columns": columns_created,
            "synonyms": synonyms_created
        }
    }


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
