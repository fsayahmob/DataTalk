"""
FastAPI Backend pour G7 Analytics
Gère les appels LLM + DuckDB dans un seul processus Python persistant

Structure modulaire:
- core/ : État applicatif et utilitaires
- routes/ : Routers FastAPI par domaine
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import duckdb
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from catalog import get_schema_for_llm
from core.state import app_state, get_duckdb_path
from llm_service import check_llm_status
from routes import (
    analytics_router,
    catalog_router,
    conversations_router,
    llm_router,
    reports_router,
    settings_router,
    widgets_router,
)

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Charger les variables d'environnement
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gestion du cycle de vie de l'application"""
    # Startup: ouvrir la connexion DuckDB
    app_state.current_db_path = get_duckdb_path()
    print(f"Connexion à DuckDB: {app_state.current_db_path}")
    app_state.db_connection = duckdb.connect(app_state.current_db_path, read_only=True)
    print("DuckDB connecté")

    # Vérifier le statut LLM
    llm_status = check_llm_status()
    if llm_status["status"] == "ok":
        print(f"LLM configuré: {llm_status.get('model')}")
    else:
        print(f"ATTENTION: {llm_status.get('message')}")

    # Pré-charger le schéma du catalogue au démarrage
    app_state.db_schema_cache = get_schema_for_llm()
    print(f"Schéma chargé ({len(app_state.db_schema_cache)} caractères)")

    yield

    # Shutdown: fermer la connexion
    if app_state.db_connection:
        app_state.db_connection.close()
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

# Inclure les routers
app.include_router(settings_router)  # /health, /settings, /database/status, /schema
app.include_router(analytics_router)  # /analyze
app.include_router(conversations_router)  # /conversations
app.include_router(reports_router)  # /reports
app.include_router(catalog_router)  # /catalog
app.include_router(llm_router)  # /llm
app.include_router(widgets_router)  # /widgets, /kpis, /suggested-questions, /prompts


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
