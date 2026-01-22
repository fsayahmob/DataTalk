"""Tests pour routes/connectors.py - API connecteurs dynamique."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from services.connector_service import (
    ConnectionTestResult,
    DiscoverResult,
    DiscoveredStream,
)

client = TestClient(app)


class TestListConnectors:
    """Tests GET /connectors."""

    def test_returns_connectors_list(self) -> None:
        """Retourne la liste des connecteurs."""
        mock_connectors = [
            {
                "id": "postgres",
                "name": "PostgreSQL",
                "category": "database",
                "pypi_package": "airbyte-source-postgres",
                "latest_version": "1.0.0",
                "language": "python",
            }
        ]
        with (
            patch("routes.connectors.list_available_connectors", return_value=mock_connectors),
            patch("routes.connectors.is_airbyte_available", return_value=True),
        ):
            response = client.get("/api/v1/connectors")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["airbyte_available"] is True
        assert data["connectors"][0]["id"] == "postgres"

    def test_filters_by_category(self) -> None:
        """Filtre par catégorie."""
        mock_connectors = [
            {"id": "postgres", "name": "PostgreSQL", "category": "database"},
            {"id": "stripe", "name": "Stripe", "category": "ecommerce"},
        ]
        with (
            patch("routes.connectors.list_available_connectors", return_value=mock_connectors),
            patch("routes.connectors.is_airbyte_available", return_value=True),
        ):
            response = client.get("/api/v1/connectors?category=database")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["connectors"][0]["id"] == "postgres"

    def test_returns_empty_list_when_airbyte_unavailable(self) -> None:
        """Retourne liste vide si PyAirbyte non disponible."""
        with (
            patch("routes.connectors.list_available_connectors", return_value=[]),
            patch("routes.connectors.is_airbyte_available", return_value=False),
        ):
            response = client.get("/api/v1/connectors")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["airbyte_available"] is False


class TestListCategories:
    """Tests GET /connectors/categories."""

    def test_returns_categories_with_counts(self) -> None:
        """Retourne les catégories avec compteurs."""
        mock_connectors = [
            {"id": "postgres", "category": "database"},
            {"id": "mysql", "category": "database"},
            {"id": "stripe", "category": "ecommerce"},
        ]
        with patch("routes.connectors.list_available_connectors", return_value=mock_connectors):
            response = client.get("/api/v1/connectors/categories")

        assert response.status_code == 200
        data = response.json()
        assert data["total_connectors"] == 3
        # Categories sorted by count descending
        assert data["categories"][0]["id"] == "database"
        assert data["categories"][0]["count"] == 2


class TestGetConnectorSpec:
    """Tests GET /connectors/{id}/spec."""

    def test_returns_config_schema(self) -> None:
        """Retourne le JSON Schema de configuration."""
        mock_spec = {
            "type": "object",
            "properties": {"host": {"type": "string"}},
            "required": ["host"],
        }
        with patch("routes.connectors.get_connector_spec", return_value=mock_spec):
            response = client.get("/api/v1/connectors/postgres/spec")

        assert response.status_code == 200
        data = response.json()
        assert data["connector_id"] == "postgres"
        assert data["config_schema"]["properties"]["host"]["type"] == "string"

    def test_returns_404_when_spec_unavailable(self) -> None:
        """Retourne 404 si spec non disponible."""
        with patch("routes.connectors.get_connector_spec", return_value=None):
            response = client.get("/api/v1/connectors/unknown/spec")

        assert response.status_code == 404


class TestTestConnection:
    """Tests POST /connectors/test."""

    def test_successful_connection_test(self) -> None:
        """Test de connexion réussi."""
        mock_result = ConnectionTestResult(
            success=True,
            message="Connexion réussie",
            details={"host": "localhost"},
        )
        with patch("routes.connectors.test_connection", return_value=mock_result):
            response = client.post(
                "/api/v1/connectors/test",
                json={
                    "connector_id": "postgres",
                    "config": {"host": "localhost", "port": 5432},
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Connexion réussie"

    def test_failed_connection_test(self) -> None:
        """Test de connexion échoué."""
        mock_result = ConnectionTestResult(
            success=False,
            message="Connection refused",
        )
        with patch("routes.connectors.test_connection", return_value=mock_result):
            response = client.post(
                "/api/v1/connectors/test",
                json={"connector_id": "postgres", "config": {}},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False

    def test_validates_required_fields(self) -> None:
        """Valide les champs requis."""
        response = client.post(
            "/api/v1/connectors/test",
            json={"connector_id": "postgres"},  # Missing config
        )
        assert response.status_code == 422


class TestDiscoverCatalog:
    """Tests POST /connectors/discover."""

    def test_successful_discovery(self) -> None:
        """Découverte de catalogue réussie."""
        mock_stream = DiscoveredStream(
            name="users",
            columns=[{"name": "id", "type": "integer", "nullable": False}],
            primary_key=["id"],
        )
        mock_result = DiscoverResult(success=True, streams=[mock_stream])

        with patch("routes.connectors.discover_catalog", return_value=mock_result):
            response = client.post(
                "/api/v1/connectors/discover",
                json={
                    "connector_id": "postgres",
                    "config": {"host": "localhost"},
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["stream_count"] == 1
        assert data["streams"][0]["name"] == "users"

    def test_failed_discovery(self) -> None:
        """Découverte de catalogue échouée."""
        mock_result = DiscoverResult(
            success=False,
            streams=[],
            error="Access denied",
        )
        with patch("routes.connectors.discover_catalog", return_value=mock_result):
            response = client.post(
                "/api/v1/connectors/discover",
                json={"connector_id": "postgres", "config": {}},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "Access denied"


class TestAirbyteStatus:
    """Tests GET /connectors/status."""

    def test_returns_available_status(self) -> None:
        """Retourne statut disponible."""
        with patch("routes.connectors.is_airbyte_available", return_value=True):
            response = client.get("/api/v1/connectors/status")

        assert response.status_code == 200
        data = response.json()
        assert data["airbyte_available"] is True
        assert "disponible" in data["message"]

    def test_returns_unavailable_status(self) -> None:
        """Retourne statut non disponible."""
        with patch("routes.connectors.is_airbyte_available", return_value=False):
            response = client.get("/api/v1/connectors/status")

        assert response.status_code == 200
        data = response.json()
        assert data["airbyte_available"] is False
        assert "pas installé" in data["message"]
