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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from catalog import get_schema_for_llm
from core.rate_limit import limiter
from core.state import app_state, get_duckdb_path
from llm_service import check_llm_status
from routes import (
    analytics_router,
    catalog_router,
    conversations_router,
    llm_router,
    reports_router,
    settings_router,
    v1_router,
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
    logger.info("Connexion à DuckDB: %s", app_state.current_db_path)
    app_state.db_connection = duckdb.connect(app_state.current_db_path, read_only=True)
    logger.info("DuckDB connecté")

    # Vérifier le statut LLM
    llm_status = check_llm_status()
    if llm_status["status"] == "ok":
        logger.info("LLM configuré: %s", llm_status.get("model"))
    else:
        logger.warning("LLM non configuré: %s", llm_status.get("message"))

    # Pré-charger le schéma du catalogue au démarrage
    app_state.db_schema_cache = get_schema_for_llm()
    logger.info("Schéma chargé (%d caractères)", len(app_state.db_schema_cache))

    yield

    # Shutdown: fermer la connexion
    if app_state.db_connection:
        app_state.db_connection.close()
        logger.info("DuckDB déconnecté")


app = FastAPI(
    title="G7 Analytics API",
    description="API pour l'analyse des évaluations clients G7",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter


async def rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle rate limit exceeded errors."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# CORS pour permettre les appels depuis Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclure le router versionné /api/v1/*
app.include_router(v1_router)

# Backward compatibility: garder les routes legacy sans préfixe (deprecated)
# TODO: supprimer après migration frontend vers /api/v1/
app.include_router(settings_router)
app.include_router(analytics_router)
app.include_router(conversations_router)
app.include_router(reports_router)
app.include_router(catalog_router)
app.include_router(llm_router)
app.include_router(widgets_router)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
