"""
Module routes - Routers FastAPI organisés par domaine.

Fournit:
- Routers individuels pour chaque domaine
- v1_router: Router agrégé avec préfixe /api/v1
"""

from fastapi import APIRouter

from routes.analytics import router as analytics_router
from routes.catalog import router as catalog_router
from routes.conversations import router as conversations_router
from routes.llm import router as llm_router
from routes.reports import router as reports_router
from routes.settings import router as settings_router
from routes.widgets import router as widgets_router

# Router versionné /api/v1
v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(settings_router)
v1_router.include_router(analytics_router)
v1_router.include_router(conversations_router)
v1_router.include_router(reports_router)
v1_router.include_router(catalog_router)
v1_router.include_router(llm_router)
v1_router.include_router(widgets_router)

__all__ = [
    "analytics_router",
    "catalog_router",
    "conversations_router",
    "llm_router",
    "reports_router",
    "settings_router",
    "v1_router",
    "widgets_router",
]
