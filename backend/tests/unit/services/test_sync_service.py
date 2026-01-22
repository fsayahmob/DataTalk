"""Tests pour services/sync_service.py - Service de synchronisation PyAirbyte."""

import pytest

from services.sync_service import (
    _transform_config_for_airbyte,
    get_airbyte_source_name,
    AIRBYTE_SOURCE_MAPPING,
)


class TestGetAirbyteSourceName:
    """Tests pour get_airbyte_source_name."""

    def test_known_sources(self) -> None:
        """Retourne le bon nom pour les sources connues."""
        assert get_airbyte_source_name("postgres") == "source-postgres"
        assert get_airbyte_source_name("mysql") == "source-mysql"
        assert get_airbyte_source_name("mongodb") == "source-mongodb-v2"
        assert get_airbyte_source_name("bigquery") == "source-bigquery"

    def test_unknown_source(self) -> None:
        """Formate les sources inconnues avec préfixe source-."""
        assert get_airbyte_source_name("custom") == "source-custom"
        assert get_airbyte_source_name("my-db") == "source-my-db"

    def test_all_mappings_exist(self) -> None:
        """Vérifie que tous les mappings sont valides."""
        for key, value in AIRBYTE_SOURCE_MAPPING.items():
            assert value.startswith("source-")
            assert get_airbyte_source_name(key) == value


class TestTransformConfigForAirbyte:
    """Tests pour _transform_config_for_airbyte.

    Cette fonction transforme les configs natives (format simple) vers
    le format attendu par PyAirbyte (format objet pour certains champs).
    """

    # =========================================================================
    # PostgreSQL
    # =========================================================================

    def test_postgres_ssl_mode_string_to_object(self) -> None:
        """Transforme ssl_mode string en objet pour postgres."""
        config = {
            "host": "localhost",
            "port": 5432,
            "database": "test",
            "username": "user",
            "password": "pass",
            "ssl_mode": "disable",
        }
        result = _transform_config_for_airbyte("postgres", config)

        assert result["ssl_mode"] == {"mode": "disable"}
        # Les autres champs restent inchangés
        assert result["host"] == "localhost"
        assert result["port"] == 5432

    def test_postgres_ssl_mode_already_object(self) -> None:
        """Ne transforme pas si ssl_mode est déjà un objet."""
        config = {
            "host": "localhost",
            "ssl_mode": {"mode": "require"},
        }
        result = _transform_config_for_airbyte("postgres", config)

        # Pas de double transformation
        assert result["ssl_mode"] == {"mode": "require"}

    def test_postgres_ssl_mode_missing(self) -> None:
        """Gère l'absence de ssl_mode."""
        config = {
            "host": "localhost",
            "port": 5432,
        }
        result = _transform_config_for_airbyte("postgres", config)

        assert "ssl_mode" not in result or result.get("ssl_mode") is None

    def test_postgres_ssl_mode_all_values(self) -> None:
        """Transforme correctement toutes les valeurs ssl_mode."""
        for mode in ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]:
            config = {"ssl_mode": mode}
            result = _transform_config_for_airbyte("postgres", config)
            assert result["ssl_mode"] == {"mode": mode}

    def test_postgres_preserves_other_fields(self) -> None:
        """Préserve tous les autres champs de la config."""
        config = {
            "host": "db.example.com",
            "port": 5432,
            "database": "mydb",
            "username": "admin",
            "password": "secret123",
            "ssl_mode": "require",
            "schemas": ["public", "analytics"],
        }
        result = _transform_config_for_airbyte("postgres", config)

        assert result["host"] == "db.example.com"
        assert result["port"] == 5432
        assert result["database"] == "mydb"
        assert result["username"] == "admin"
        assert result["password"] == "secret123"
        assert result["schemas"] == ["public", "analytics"]
        assert result["ssl_mode"] == {"mode": "require"}

    # =========================================================================
    # Autres connecteurs (pas de transformation)
    # =========================================================================

    def test_mysql_no_transformation(self) -> None:
        """MySQL n'a pas de transformation spéciale."""
        config = {
            "host": "localhost",
            "port": 3306,
            "database": "test",
            "ssl": True,
        }
        result = _transform_config_for_airbyte("mysql", config)

        # Config inchangée
        assert result == config

    def test_mongodb_no_transformation(self) -> None:
        """MongoDB n'a pas de transformation spéciale."""
        config = {
            "connection_string": "mongodb://localhost:27017",
        }
        result = _transform_config_for_airbyte("mongodb", config)

        assert result == config

    def test_unknown_connector_no_transformation(self) -> None:
        """Les connecteurs inconnus ne sont pas transformés."""
        config = {
            "api_key": "secret",
            "endpoint": "https://api.example.com",
        }
        result = _transform_config_for_airbyte("custom-source", config)

        assert result == config

    # =========================================================================
    # Edge cases
    # =========================================================================

    def test_empty_config(self) -> None:
        """Gère une config vide."""
        result = _transform_config_for_airbyte("postgres", {})
        assert result == {}

    def test_does_not_mutate_original(self) -> None:
        """Ne modifie pas la config originale."""
        original = {
            "host": "localhost",
            "ssl_mode": "disable",
        }
        original_copy = original.copy()

        _transform_config_for_airbyte("postgres", original)

        # L'original n'est pas modifié
        assert original == original_copy

    def test_ssl_mode_empty_string(self) -> None:
        """Gère ssl_mode comme string vide."""
        config = {"ssl_mode": ""}
        result = _transform_config_for_airbyte("postgres", config)

        # String vide est falsy, donc pas transformé
        assert result["ssl_mode"] == ""

    def test_ssl_mode_none(self) -> None:
        """Gère ssl_mode comme None."""
        config = {"ssl_mode": None}
        result = _transform_config_for_airbyte("postgres", config)

        # None est falsy, donc pas transformé
        assert result["ssl_mode"] is None
