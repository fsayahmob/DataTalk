"""Tests pour services/connector_service.py - Service connecteurs PyAirbyte."""

from unittest.mock import MagicMock, patch

import pytest

from services.connector_service import (
    ConnectionTestResult,
    DiscoverResult,
    DiscoveredStream,
    _extract_columns_from_schema,
    _format_connector_name,
    _infer_category,
    discover_catalog,
    get_connector_spec,
    is_airbyte_available,
    list_available_connectors,
    test_connection,
)


class TestConnectionTestResult:
    """Tests pour ConnectionTestResult."""

    def test_to_dict_success(self) -> None:
        """Convertit en dict - succès."""
        result = ConnectionTestResult(
            success=True,
            message="Connexion réussie",
            details={"host": "localhost"},
        )
        assert result.to_dict() == {
            "success": True,
            "message": "Connexion réussie",
            "details": {"host": "localhost"},
        }

    def test_to_dict_failure(self) -> None:
        """Convertit en dict - échec."""
        result = ConnectionTestResult(
            success=False,
            message="Connexion échouée",
        )
        assert result.to_dict() == {
            "success": False,
            "message": "Connexion échouée",
            "details": {},
        }


class TestDiscoveredStream:
    """Tests pour DiscoveredStream."""

    def test_to_dict(self) -> None:
        """Convertit en dict."""
        stream = DiscoveredStream(
            name="users",
            columns=[{"name": "id", "type": "integer"}],
            primary_key=["id"],
        )
        assert stream.to_dict() == {
            "name": "users",
            "columns": [{"name": "id", "type": "integer"}],
            "primary_key": ["id"],
        }

    def test_default_primary_key(self) -> None:
        """Primary key vide par défaut."""
        stream = DiscoveredStream(name="users", columns=[])
        assert stream.primary_key == []


class TestDiscoverResult:
    """Tests pour DiscoverResult."""

    def test_to_dict_success(self) -> None:
        """Convertit en dict - succès."""
        stream = DiscoveredStream(name="users", columns=[])
        result = DiscoverResult(success=True, streams=[stream])
        d = result.to_dict()
        assert d["success"] is True
        assert d["stream_count"] == 1
        assert d["error"] is None

    def test_to_dict_error(self) -> None:
        """Convertit en dict - erreur."""
        result = DiscoverResult(success=False, streams=[], error="Connection failed")
        d = result.to_dict()
        assert d["success"] is False
        assert d["error"] == "Connection failed"


class TestFormatConnectorName:
    """Tests pour _format_connector_name."""

    def test_known_connectors(self) -> None:
        """Formate les connecteurs connus."""
        assert _format_connector_name("postgres") == "PostgreSQL"
        assert _format_connector_name("mysql") == "MySQL"
        assert _format_connector_name("bigquery") == "Google BigQuery"
        assert _format_connector_name("snowflake") == "Snowflake"

    def test_unknown_connector(self) -> None:
        """Formate les connecteurs inconnus."""
        assert _format_connector_name("my-custom-source") == "My Custom Source"
        assert _format_connector_name("test") == "Test"


class TestInferCategory:
    """Tests pour _infer_category."""

    def test_database_category(self) -> None:
        """Infère catégorie database."""
        assert _infer_category("postgres") == "database"
        assert _infer_category("mysql") == "database"
        assert _infer_category("mongodb") == "database"

    def test_cloud_dw_category(self) -> None:
        """Infère catégorie data_warehouse."""
        assert _infer_category("bigquery") == "data_warehouse"
        assert _infer_category("snowflake") == "data_warehouse"

    def test_marketing_category(self) -> None:
        """Infère catégorie marketing."""
        assert _infer_category("google-analytics") == "marketing"
        assert _infer_category("facebook-marketing") == "marketing"

    def test_file_category(self) -> None:
        """Infère catégorie file."""
        assert _infer_category("csv") == "file"
        assert _infer_category("parquet") == "file"

    def test_unknown_category(self) -> None:
        """Retourne 'other' pour les inconnus."""
        assert _infer_category("unknown-source") == "other"


class TestExtractColumnsFromSchema:
    """Tests pour _extract_columns_from_schema."""

    def test_extracts_columns(self) -> None:
        """Extrait les colonnes d'un schema."""
        schema = {
            "properties": {
                "id": {"type": "integer", "description": "ID unique"},
                "name": {"type": "string"},
            },
            "required": ["id"],
        }
        columns = _extract_columns_from_schema(schema)
        assert len(columns) == 2
        assert columns[0]["name"] == "id"
        assert columns[0]["type"] == "integer"
        assert columns[0]["nullable"] is False
        assert columns[1]["name"] == "name"
        assert columns[1]["nullable"] is True

    def test_handles_array_type(self) -> None:
        """Gère les types array (nullable)."""
        schema = {
            "properties": {
                "email": {"type": ["string", "null"]},
            }
        }
        columns = _extract_columns_from_schema(schema)
        assert columns[0]["type"] == "string"

    def test_empty_schema(self) -> None:
        """Gère un schema vide."""
        columns = _extract_columns_from_schema({})
        assert columns == []


class TestListAvailableConnectors:
    """Tests pour list_available_connectors."""

    def test_returns_empty_when_airbyte_unavailable(self) -> None:
        """Retourne liste vide si PyAirbyte non disponible."""
        with patch("services.connector_service._AIRBYTE_AVAILABLE", False):
            result = list_available_connectors()
        assert result == []

    def test_lists_connectors_from_registry(self) -> None:
        """Liste les connecteurs depuis le registry."""
        mock_connector = MagicMock()
        mock_connector.name = "source-postgres"
        mock_connector.pypi_package_name = "airbyte-source-postgres"
        mock_connector.latest_version = "1.0.0"
        mock_connector.language = "python"

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_available_connectors.return_value = [mock_connector]
            result = list_available_connectors()

        assert len(result) == 1
        assert result[0]["id"] == "postgres"
        assert result[0]["name"] == "PostgreSQL"
        assert result[0]["category"] == "database"


class TestGetConnectorSpec:
    """Tests pour get_connector_spec."""

    def test_returns_none_when_airbyte_unavailable(self) -> None:
        """Retourne None si PyAirbyte non disponible."""
        with patch("services.connector_service._AIRBYTE_AVAILABLE", False):
            result = get_connector_spec("postgres")
        assert result is None

    def test_returns_spec_from_source(self) -> None:
        """Retourne le spec depuis la source."""
        mock_spec = {"type": "object", "properties": {"host": {"type": "string"}}}
        mock_source = MagicMock()
        mock_source.config_spec = mock_spec

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_source.return_value = mock_source
            result = get_connector_spec("postgres")

        assert result == mock_spec
        mock_ab.get_source.assert_called_once_with(
            "source-postgres", config={}, install_if_missing=True
        )


class TestTestConnection:
    """Tests pour test_connection."""

    def test_returns_error_when_airbyte_unavailable(self) -> None:
        """Retourne erreur si PyAirbyte non disponible."""
        with patch("services.connector_service._AIRBYTE_AVAILABLE", False):
            result = test_connection("postgres", {"host": "localhost"})
        assert result.success is False
        assert "PyAirbyte" in result.message

    def test_successful_connection(self) -> None:
        """Test de connexion réussi."""
        mock_source = MagicMock()

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_source.return_value = mock_source
            result = test_connection("postgres", {"host": "localhost"})

        assert result.success is True
        mock_source.check.assert_called_once()

    def test_failed_connection(self) -> None:
        """Test de connexion échoué."""
        mock_source = MagicMock()
        mock_source.check.side_effect = Exception("Connection refused")

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_source.return_value = mock_source
            result = test_connection("postgres", {"host": "localhost"})

        assert result.success is False
        assert "Connection refused" in result.message


class TestDiscoverCatalog:
    """Tests pour discover_catalog."""

    def test_returns_error_when_airbyte_unavailable(self) -> None:
        """Retourne erreur si PyAirbyte non disponible."""
        with patch("services.connector_service._AIRBYTE_AVAILABLE", False):
            result = discover_catalog("postgres", {"host": "localhost"})
        assert result.success is False
        assert "PyAirbyte" in result.error

    def test_discovers_catalog(self) -> None:
        """Découvre le catalogue."""
        mock_stream = MagicMock()
        mock_stream.stream.json_schema = {
            "properties": {"id": {"type": "integer"}},
            "required": ["id"],
        }
        mock_stream.stream.source_defined_primary_key = [["id"]]

        mock_catalog = MagicMock()
        mock_catalog.streams = {"users": mock_stream}

        mock_source = MagicMock()
        mock_source.discovered_catalog = mock_catalog

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_source.return_value = mock_source
            result = discover_catalog("postgres", {"host": "localhost"})

        assert result.success is True
        assert len(result.streams) == 1
        assert result.streams[0].name == "users"
        assert result.streams[0].primary_key == ["id"]

    def test_handles_discovery_error(self) -> None:
        """Gère les erreurs de découverte."""
        mock_source = MagicMock()
        mock_source.discovered_catalog = property(
            fget=lambda self: (_ for _ in ()).throw(Exception("Access denied"))
        )

        with (
            patch("services.connector_service._AIRBYTE_AVAILABLE", True),
            patch("services.connector_service.ab") as mock_ab,
        ):
            mock_ab.get_source.return_value = mock_source
            type(mock_source).discovered_catalog = property(
                fget=lambda self: (_ for _ in ()).throw(Exception("Access denied"))
            )
            # Force exception
            mock_ab.get_source.side_effect = Exception("Access denied")
            result = discover_catalog("postgres", {"host": "localhost"})

        assert result.success is False
        assert "Access denied" in result.error


class TestIsAirbyteAvailable:
    """Tests pour is_airbyte_available."""

    def test_returns_availability_flag(self) -> None:
        """Retourne le flag de disponibilité."""
        with patch("services.connector_service._AIRBYTE_AVAILABLE", True):
            assert is_airbyte_available() is True

        with patch("services.connector_service._AIRBYTE_AVAILABLE", False):
            assert is_airbyte_available() is False
