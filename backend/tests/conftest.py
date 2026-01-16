"""
Fixtures partagées pour tous les tests.

Ces fixtures fournissent des mocks et données de test réutilisables.
"""

import pytest
from unittest.mock import MagicMock


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

    return conn


@pytest.fixture
def mock_sqlite_cursor() -> MagicMock:
    """Mock d'un curseur SQLite."""
    cursor = MagicMock()
    cursor.fetchone.return_value = {"id": 1, "name": "test"}
    cursor.fetchall.return_value = [{"id": 1}, {"id": 2}]
    cursor.rowcount = 1
    return cursor


@pytest.fixture
def sample_column_data() -> dict:
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
def sample_table_data() -> dict:
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
def sample_enrichment() -> dict:
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
def sample_kpi_data() -> dict:
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
