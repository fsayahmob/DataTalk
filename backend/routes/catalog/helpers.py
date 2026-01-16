"""
Helper functions shared across catalog route modules.
"""

import duckdb
from fastapi import HTTPException

from core.state import app_state
from i18n import t


def get_db_connection() -> duckdb.DuckDBPyConnection:
    """Get the active DB connection or raise 503 if not connected."""
    if app_state.db_connection is None:
        raise HTTPException(status_code=503, detail=t("db.not_connected"))
    return app_state.db_connection
