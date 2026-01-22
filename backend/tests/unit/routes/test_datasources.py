"""Tests pour routes/datasources.py - API datasources."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestCreateDatasource:
    """Tests POST /datasources."""

    def test_creates_datasource(self) -> None:
        """Crée une datasource."""
        with (
            patch("routes.datasources.add_datasource", return_value=1),
            patch(
                "routes.datasources.get_datasource",
                return_value={
                    "id": 1,
                    "name": "test_ds",
                    "type": "postgres",
                    "dataset_id": "ds-123",
                    "source_type": "postgres",
                    "path": None,
                    "description": "Test",
                    "sync_config": {"host": "localhost"},
                    "sync_status": "pending",
                    "last_sync_at": None,
                    "last_sync_error": None,
                    "is_active": 1,
                    "created_at": "2024-01-01",
                    "updated_at": "2024-01-01",
                },
            ),
        ):
            response = client.post(
                "/api/v1/datasources",
                json={
                    "name": "test_ds",
                    "dataset_id": "ds-123",
                    "source_type": "postgres",
                    "description": "Test",
                    "sync_config": {"host": "localhost"},
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "test_ds"
        assert data["source_type"] == "postgres"

    def test_returns_500_if_creation_fails(self) -> None:
        """Retourne 500 si création échoue."""
        with patch("routes.datasources.add_datasource", return_value=None):
            response = client.post(
                "/api/v1/datasources",
                json={
                    "name": "fail",
                    "dataset_id": "ds-123",
                    "source_type": "postgres",
                },
            )

        assert response.status_code == 500

    def test_validates_required_fields(self) -> None:
        """Valide les champs requis."""
        response = client.post(
            "/api/v1/datasources",
            json={"name": "test"},  # Missing dataset_id and source_type
        )
        assert response.status_code == 422


class TestListDatasources:
    """Tests GET /datasources."""

    def test_returns_empty_list(self) -> None:
        """Retourne une liste vide."""
        with patch("routes.datasources.list_datasources", return_value=[]):
            response = client.get("/api/v1/datasources")

        assert response.status_code == 200
        data = response.json()
        assert data["datasources"] == []
        assert data["count"] == 0

    def test_filters_by_dataset_id(self) -> None:
        """Filtre par dataset_id."""
        with patch("routes.datasources.list_datasources", return_value=[]) as mock:
            response = client.get("/api/v1/datasources?dataset_id=ds-123")

        mock.assert_called_once_with(dataset_id="ds-123")
        assert response.status_code == 200


class TestGetDatasource:
    """Tests GET /datasources/{id}."""

    def test_returns_datasource(self) -> None:
        """Retourne une datasource."""
        with patch(
            "routes.datasources.get_datasource",
            return_value={
                "id": 1,
                "name": "test",
                "type": "postgres",
                "dataset_id": "ds-123",
                "source_type": "postgres",
                "path": None,
                "description": None,
                "sync_config": None,
                "sync_status": "pending",
                "last_sync_at": None,
                "last_sync_error": None,
                "is_active": 1,
                "created_at": "2024-01-01",
                "updated_at": "2024-01-01",
            },
        ):
            response = client.get("/api/v1/datasources/1")

        assert response.status_code == 200
        assert response.json()["id"] == 1

    def test_returns_404_if_not_found(self) -> None:
        """Retourne 404 si non trouvé."""
        with patch("routes.datasources.get_datasource", return_value=None):
            response = client.get("/api/v1/datasources/999")

        assert response.status_code == 404


class TestUpdateDatasource:
    """Tests PATCH /datasources/{id}."""

    def test_updates_datasource(self) -> None:
        """Met à jour une datasource."""
        with (
            patch("routes.datasources.update_datasource", return_value=True),
            patch(
                "routes.datasources.get_datasource",
                return_value={
                    "id": 1,
                    "name": "updated",
                    "type": "postgres",
                    "dataset_id": "ds-123",
                    "source_type": "postgres",
                    "path": None,
                    "description": "Updated desc",
                    "sync_config": None,
                    "sync_status": "pending",
                    "last_sync_at": None,
                    "last_sync_error": None,
                    "is_active": 1,
                    "created_at": "2024-01-01",
                    "updated_at": "2024-01-01",
                },
            ),
        ):
            response = client.patch(
                "/api/v1/datasources/1",
                json={"name": "updated", "description": "Updated desc"},
            )

        assert response.status_code == 200
        assert response.json()["name"] == "updated"

    def test_returns_404_if_not_found(self) -> None:
        """Retourne 404 si non trouvé."""
        with patch("routes.datasources.update_datasource", return_value=False):
            response = client.patch("/api/v1/datasources/999", json={"name": "test"})

        assert response.status_code == 404


class TestDeleteDatasource:
    """Tests DELETE /datasources/{id}."""

    def test_deletes_datasource(self) -> None:
        """Supprime une datasource."""
        with patch("routes.datasources.delete_datasource", return_value=True):
            response = client.delete("/api/v1/datasources/1")

        assert response.status_code == 200
        # Message traduit via i18n
        assert "id" in response.json()

    def test_returns_404_if_not_found(self) -> None:
        """Retourne 404 si non trouvé."""
        with patch("routes.datasources.delete_datasource", return_value=False):
            response = client.delete("/api/v1/datasources/999")

        assert response.status_code == 404


class TestTriggerSync:
    """Tests POST /datasources/{id}/sync."""

    def test_triggers_sync(self) -> None:
        """Lance une sync."""
        with patch(
            "routes.datasources.get_datasource",
            return_value={
                "id": 1,
                "sync_config": {"host": "localhost"},
            },
        ):
            response = client.post("/api/v1/datasources/1/sync")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert data["datasource_id"] == 1

    def test_returns_404_if_not_found(self) -> None:
        """Retourne 404 si non trouvé."""
        with patch("routes.datasources.get_datasource", return_value=None):
            response = client.post("/api/v1/datasources/999/sync")

        assert response.status_code == 404

    def test_returns_400_if_no_sync_config(self) -> None:
        """Retourne 400 si pas de config sync."""
        with patch(
            "routes.datasources.get_datasource",
            return_value={"id": 1, "sync_config": None},
        ):
            response = client.post("/api/v1/datasources/1/sync")

        assert response.status_code == 400
