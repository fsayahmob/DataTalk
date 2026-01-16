"""
Module routes - Routers FastAPI organisés par domaine.
"""

from routes.analytics import router as analytics_router
from routes.catalog import router as catalog_router
from routes.conversations import router as conversations_router
from routes.llm import router as llm_router
from routes.reports import router as reports_router
from routes.settings import router as settings_router
from routes.widgets import router as widgets_router

__all__ = [
    "analytics_router",
    "catalog_router",
    "conversations_router",
    "llm_router",
    "reports_router",
    "settings_router",
    "widgets_router",
]
