"""
FastAPI Backend pour G7 Analytics
Gère les appels LLM + DuckDB dans un seul processus Python persistant

Structure modulaire:
- core/ : État applicatif et utilitaires
- routes/ : Routers FastAPI par domaine
"""

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

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


def _check_volume_writable(path: str) -> bool:
    """Vérifie qu'un répertoire est accessible en écriture."""
    try:
        dir_path = Path(path).parent
        dir_path.mkdir(parents=True, exist_ok=True)
        # Test d'écriture
        test_file = dir_path / ".write_test"
        test_file.write_text("test")
        test_file.unlink()
        return True
    except Exception as e:
        logger.error("Volume non accessible en écriture (%s): %s", path, e)
        return False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gestion du cycle de vie de l'application"""
    # Vérifier que les volumes sont montés et accessibles en écriture
    app_state.current_db_path = get_duckdb_path()
    logger.info("Chemin DuckDB configuré: %s", app_state.current_db_path)

    if app_state.current_db_path:
        if _check_volume_writable(app_state.current_db_path):
            logger.info("Volume DuckDB accessible en écriture")
        else:
            logger.error("Volume DuckDB NON accessible - les uploads échoueront")

    # Connexion DuckDB uniquement si le fichier existe
    if app_state.current_db_path and Path(app_state.current_db_path).exists():
        try:
            app_state.db_connection = duckdb.connect(app_state.current_db_path, read_only=True)
            logger.info("DuckDB connecté")
        except Exception as e:
            logger.warning("Impossible de se connecter à DuckDB: %s", e)
            app_state.db_connection = None
    else:
        logger.info("Fichier DuckDB non trouvé - sera créé lors du premier upload")
        app_state.db_connection = None

    # Vérifier le statut LLM
    llm_status = check_llm_status()
    if llm_status["status"] == "ok":
        logger.info("LLM configuré: %s", llm_status.get("model"))
    else:
        logger.warning("LLM non configuré: %s", llm_status.get("message"))

    # Pré-charger le schéma du catalogue au démarrage (si DuckDB connecté)
    if app_state.db_connection:
        app_state.db_schema_cache = get_schema_for_llm()
        logger.info("Schéma chargé (%d caractères)", len(app_state.db_schema_cache))
    else:
        app_state.db_schema_cache = None
        logger.info("Schéma non chargé (en attente d'un dataset)")

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
# En production: ALLOWED_ORIGINS=https://mondomaine.com,https://www.mondomaine.com
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
