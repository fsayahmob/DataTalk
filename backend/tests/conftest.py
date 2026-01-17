"""
Fixtures partagées pour tous les tests.

Ces fixtures fournissent des mocks et données de test réutilisables.
"""

from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest


# =============================================================================
# FIXTURES DB
# =============================================================================


@pytest.fixture
def mock_duckdb_connection() -> MagicMock:
    """Mock d'une connexion DuckDB."""
    conn = MagicMock()

    # Mock pour fetchone retournant un tuple
    conn.execute.return_value.fetchone.return_value = (100,)

    # Mock pour fetchall retournant une liste de tuples
    conn.execute.return_value.fetchall.return_value = [
        ("table1",),
        ("table2",),
    ]

    # Mock pour fetchdf retournant un DataFrame
    conn.execute.return_value.fetchdf.return_value = pd.DataFrame(
        {"col1": [1, 2, 3], "col2": ["a", "b", "c"]}
    )

    return conn


@pytest.fixture
def mock_sqlite_connection() -> Generator[MagicMock, None, None]:
    """Mock d'une connexion SQLite avec context manager."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = {"id": 1, "name": "test"}
    cursor.fetchall.return_value = [{"id": 1}, {"id": 2}]
    cursor.rowcount = 1
    cursor.lastrowid = 1
    conn.cursor.return_value = cursor
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)

    with patch("db.get_connection", return_value=conn):
        yield conn


@pytest.fixture
def mock_sqlite_cursor() -> MagicMock:
    """Mock d'un curseur SQLite."""
    cursor = MagicMock()
    cursor.fetchone.return_value = {"id": 1, "name": "test"}
    cursor.fetchall.return_value = [{"id": 1}, {"id": 2}]
    cursor.rowcount = 1
    return cursor


# =============================================================================
# FIXTURES APP STATE
# =============================================================================


@pytest.fixture
def mock_app_state() -> Generator[MagicMock, None, None]:
    """Mock de l'état applicatif global."""
    with patch("core.state.app_state") as mock:
        mock.db_connection = MagicMock()
        mock.db_schema_cache = "schema_cache"
        mock.current_db_path = "/path/to/db.duckdb"
        yield mock


@pytest.fixture
def fresh_app_state() -> Any:
    """Crée une nouvelle instance de _AppState pour les tests isolés."""
    from core.state import _AppState

    return _AppState()


# =============================================================================
# FIXTURES LLM
# =============================================================================


@pytest.fixture
def mock_llm_response() -> dict[str, Any]:
    """Réponse LLM type pour les tests."""
    return {
        "sql": "SELECT COUNT(*) FROM evaluations",
        "explanation": "Compte le nombre total d'évaluations",
        "chart_type": "number",
        "chart_options": {},
    }


@pytest.fixture
def mock_llm_call() -> Generator[MagicMock, None, None]:
    """Mock du service LLM."""
    with patch("llm_service.call_llm") as mock:
        mock.return_value = {
            "content": '{"sql": "SELECT 1", "explanation": "Test"}',
            "usage": {"input_tokens": 100, "output_tokens": 50},
            "model": "gemini-2.0-flash",
        }
        yield mock


# =============================================================================
# FIXTURES CATALOG
# =============================================================================


@pytest.fixture
def sample_column_data() -> dict[str, Any]:
    """Données d'exemple pour une colonne."""
    return {
        "name": "email",
        "data_type": "VARCHAR",
        "null_rate": 0.05,
        "distinct_count": 1000,
        "sample_values": ["user@example.com", "test@domain.fr"],
        "is_categorical": False,
        "detected_pattern": "email",
        "pattern_match_rate": 0.95,
    }


@pytest.fixture
def sample_table_data() -> dict[str, Any]:
    """Données d'exemple pour une table."""
    return {
        "name": "users",
        "row_count": 10000,
        "columns": [
            {"name": "id", "data_type": "INTEGER"},
            {"name": "email", "data_type": "VARCHAR"},
            {"name": "created_at", "data_type": "TIMESTAMP"},
        ],
    }


@pytest.fixture
def sample_enrichment() -> dict[str, Any]:
    """Enrichissement LLM d'exemple."""
    return {
        "users": {
            "description": "Table des utilisateurs enregistrés",
            "columns": {
                "id": {
                    "description": "Identifiant unique de l'utilisateur",
                    "synonyms": ["ID", "identifiant", "user_id"],
                },
                "email": {
                    "description": "Adresse email de l'utilisateur",
                    "synonyms": ["mail", "courriel", "adresse email"],
                },
                "created_at": {
                    "description": "Date de création du compte",
                    "synonyms": ["date inscription", "creation date"],
                },
            },
        }
    }


@pytest.fixture
def sample_catalog_data() -> dict[str, Any]:
    """Données complètes d'un catalogue."""
    return {
        "datasource": "test_db",
        "tables": [
            {
                "name": "evaluations",
                "row_count": 64383,
                "columns": [
                    {"name": "id", "data_type": "INTEGER"},
                    {"name": "note_eval", "data_type": "FLOAT"},
                    {"name": "commentaire", "data_type": "VARCHAR"},
                    {"name": "dat_course", "data_type": "TIMESTAMP"},
                ],
            }
        ],
    }


# =============================================================================
# FIXTURES KPI & WIDGET
# =============================================================================


@pytest.fixture
def sample_kpi_data() -> dict[str, Any]:
    """Données d'exemple pour un KPI."""
    return {
        "id": "total-users",
        "title": "Utilisateurs",
        "sql_value": "SELECT COUNT(*) FROM users",
        "sql_trend": "SELECT COUNT(*) FROM users WHERE created_at < date_trunc('month', current_date)",
        "sql_sparkline": "SELECT date_trunc('day', created_at) as d, COUNT(*) FROM users GROUP BY 1 ORDER BY 1",
        "sparkline_type": "area",
        "footer": "Total des utilisateurs",
        "trend_label": "vs mois dernier",
        "invert_trend": False,
    }


@pytest.fixture
def sample_widget_data() -> dict[str, Any]:
    """Données d'exemple pour un widget."""
    return {
        "id": "widget-1",
        "title": "Note moyenne",
        "widget_type": "kpi",
        "sql_query": "SELECT AVG(note_eval) FROM evaluations",
        "chart_config": {"type": "number"},
        "position": 0,
    }


# =============================================================================
# FIXTURES SETTINGS
# =============================================================================


@pytest.fixture
def mock_get_setting() -> Generator[MagicMock, None, None]:
    """Mock de get_setting."""
    settings = {
        "duckdb_path": "/path/to/db.duckdb",
        "query_timeout_ms": "30000",
        "max_chart_rows": "5000",
        "max_tables_per_batch": "4",
    }
    with patch("catalog.get_setting", side_effect=lambda k: settings.get(k)):
        yield settings
