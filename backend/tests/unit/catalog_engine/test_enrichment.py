"""Tests pour catalog_engine/enrichment.py - Enrichissement LLM."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from catalog_engine.enrichment import (
    PromptNotConfiguredError,
    _build_full_context,
    build_response_model,
    check_token_limit,
    enrich_with_llm,
    estimate_tokens,
    validate_catalog_enrichment,
)
from catalog_engine.models import (
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    TableMetadata,
    ValueFrequency,
)


class TestEstimateTokens:
    """Tests de estimate_tokens."""

    def test_estimates_empty_string(self) -> None:
        """Estime 0 pour string vide."""
        assert estimate_tokens("") == 0

    def test_estimates_short_string(self) -> None:
        """Estime correctement une courte string."""
        # 12 chars / 4 = 3 tokens
        assert estimate_tokens("Hello World!") == 3

    def test_estimates_long_string(self) -> None:
        """Estime correctement une longue string."""
        text = "a" * 400  # 400 chars / 4 = 100 tokens
        assert estimate_tokens(text) == 100

    def test_approximation_factor(self) -> None:
        """Utilise un facteur de ~4 chars/token."""
        text = "test"  # 4 chars
        assert estimate_tokens(text) == 1


class TestCheckTokenLimit:
    """Tests de check_token_limit."""

    def test_ok_for_small_prompt(self) -> None:
        """OK pour petit prompt."""
        is_ok, count, msg = check_token_limit("Hello", max_input_tokens=1000)
        assert is_ok is True
        assert "OK:" in msg

    def test_warning_for_large_prompt(self) -> None:
        """Warning pour prompt volumineux (>80%)."""
        # 850 tokens = 3400 chars
        text = "a" * 3400
        is_ok, count, msg = check_token_limit(text, max_input_tokens=1000)
        assert is_ok is True
        assert "80%" in msg.lower() or "volumineux" in msg.lower()

    def test_error_for_too_large_prompt(self) -> None:
        """Erreur pour prompt trop grand."""
        # 1100 tokens = 4400 chars
        text = "a" * 4400
        is_ok, count, msg = check_token_limit(text, max_input_tokens=1000)
        assert is_ok is False
        assert "trop long" in msg.lower()

    def test_returns_token_count(self) -> None:
        """Retourne le nombre de tokens."""
        text = "a" * 400  # 100 tokens
        is_ok, count, msg = check_token_limit(text, max_input_tokens=1000)
        assert count == 100


class TestPromptNotConfiguredError:
    """Tests de PromptNotConfiguredError."""

    def test_is_exception(self) -> None:
        """Est une Exception."""
        assert issubclass(PromptNotConfiguredError, Exception)

    def test_stores_prompt_key(self) -> None:
        """Stocke la clé du prompt."""
        error = PromptNotConfiguredError("test_prompt")
        assert error.prompt_key == "test_prompt"

    def test_message_includes_key(self) -> None:
        """Le message inclut la clé."""
        error = PromptNotConfiguredError("catalog_enrichment")
        assert "catalog_enrichment" in str(error)

    def test_message_includes_hint(self) -> None:
        """Le message inclut un indice."""
        error = PromptNotConfiguredError("test")
        assert "seed_prompts" in str(error).lower()


class TestBuildResponseModel:
    """Tests de build_response_model."""

    def test_returns_pydantic_model(self) -> None:
        """Retourne un modèle Pydantic."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        model = build_response_model(catalog)
        assert issubclass(model, BaseModel)

    def test_model_has_table_fields(self) -> None:
        """Le modèle a des champs pour chaque table."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(name="users", row_count=100, columns=[]),
                TableMetadata(name="orders", row_count=50, columns=[]),
            ],
        )
        model = build_response_model(catalog)
        assert "users" in model.model_fields
        assert "orders" in model.model_fields

    def test_table_model_has_description(self) -> None:
        """Les modèles de table ont un champ description."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="users", row_count=100, columns=[])],
        )
        model = build_response_model(catalog)
        # Le champ users est un modèle avec description et columns
        users_field = model.model_fields["users"]
        assert users_field is not None


class TestBuildFullContext:
    """Tests de _build_full_context."""

    def test_includes_table_name(self) -> None:
        """Inclut le nom de la table."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="evaluations", row_count=64000, columns=[])],
        )
        context = _build_full_context(catalog)
        assert "evaluations" in context

    def test_includes_row_count(self) -> None:
        """Inclut le nombre de lignes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=64000, columns=[])],
        )
        context = _build_full_context(catalog)
        assert "64,000" in context or "64000" in context

    def test_includes_column_info(self) -> None:
        """Inclut les infos de colonne."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[ColumnMetadata(name="user_id", data_type="INTEGER")],
                )
            ],
        )
        context = _build_full_context(catalog)
        assert "user_id" in context
        assert "INTEGER" in context

    def test_includes_null_rate(self) -> None:
        """Inclut le taux de NULL."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[ColumnMetadata(name="c", data_type="INT", null_rate=0.15)],
                )
            ],
        )
        context = _build_full_context(catalog)
        assert "15" in context
        assert "NULL" in context

    def test_includes_enum_for_categorical(self) -> None:
        """Inclut ENUM pour catégoriel."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[
                        ColumnMetadata(
                            name="status",
                            data_type="VARCHAR",
                            is_categorical=True,
                            sample_values=["active", "inactive"],
                        )
                    ],
                )
            ],
        )
        context = _build_full_context(catalog)
        assert "ENUM:" in context
        assert "active" in context

    def test_includes_numeric_stats(self) -> None:
        """Inclut les stats numériques."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[
                        ColumnMetadata(
                            name="price",
                            data_type="FLOAT",
                            value_range="10 - 100",
                            mean=50.0,
                        )
                    ],
                )
            ],
        )
        context = _build_full_context(catalog)
        assert "Range:" in context
        assert "Moyenne:" in context


class TestEnrichWithLlm:
    """Tests de enrich_with_llm."""

    @patch("catalog_engine.enrichment.call_llm_structured")
    @patch("catalog_engine.enrichment.get_active_prompt")
    @patch("catalog_engine.enrichment.call_with_retry")
    def test_raises_if_prompt_not_configured(
        self, mock_retry: MagicMock, mock_prompt: MagicMock, mock_llm: MagicMock
    ) -> None:
        """Lève PromptNotConfiguredError si prompt manquant."""
        mock_prompt.return_value = None

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )

        with pytest.raises(PromptNotConfiguredError):
            enrich_with_llm(catalog)

    @patch("catalog_engine.enrichment.call_llm_structured")
    @patch("catalog_engine.enrichment.get_active_prompt")
    @patch("catalog_engine.enrichment.call_with_retry")
    def test_raises_if_prompt_empty(
        self, mock_retry: MagicMock, mock_prompt: MagicMock, mock_llm: MagicMock
    ) -> None:
        """Lève PromptNotConfiguredError si prompt vide."""
        mock_prompt.return_value = {"content": ""}

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )

        with pytest.raises(PromptNotConfiguredError):
            enrich_with_llm(catalog)

    @patch("catalog_engine.enrichment.call_with_retry")
    @patch("catalog_engine.enrichment.get_active_prompt")
    def test_returns_enrichment_dict(self, mock_prompt: MagicMock, mock_retry: MagicMock) -> None:
        """Retourne un dict d'enrichissement."""
        mock_prompt.return_value = {"content": "Enrich: {tables_context}"}
        mock_retry.return_value = {
            "users": {
                "description": "Table des utilisateurs",
                "columns": {"id": {"description": "ID", "synonyms": []}},
            }
        }

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )

        result = enrich_with_llm(catalog)
        assert isinstance(result, dict)
        assert "users" in result

    @patch("catalog_engine.enrichment.call_with_retry")
    @patch("catalog_engine.enrichment.get_active_prompt")
    def test_uses_provided_context(self, mock_prompt: MagicMock, mock_retry: MagicMock) -> None:
        """Utilise le contexte fourni."""
        mock_prompt.return_value = {"content": "Test: {tables_context}"}
        mock_retry.return_value = {"t": {"description": "Test", "columns": {}}}

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )

        custom_context = "Custom context from PostgreSQL"
        enrich_with_llm(catalog, tables_context=custom_context)

        # Le contexte devrait être utilisé dans le prompt
        mock_retry.assert_called_once()


class TestValidateCatalogEnrichment:
    """Tests de validate_catalog_enrichment."""

    def test_returns_validation_result(self) -> None:
        """Retourne un CatalogValidationResult."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )
        enrichment: dict[str, Any] = {"t": {"description": "Test table", "columns": {}}}

        result = validate_catalog_enrichment(catalog, enrichment)
        assert isinstance(result, CatalogValidationResult)

    def test_counts_ok_tables(self) -> None:
        """Compte les tables OK."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(name="t1", row_count=100, columns=[]),
                TableMetadata(name="t2", row_count=50, columns=[]),
            ],
        )
        enrichment: dict[str, Any] = {
            "t1": {"description": "Table 1 description", "columns": {}},
            "t2": {"description": "Table 2 description", "columns": {}},
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.tables_ok == 2
        assert result.tables_warning == 0

    def test_counts_warning_tables(self) -> None:
        """Compte les tables en warning."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(name="t1", row_count=100, columns=[]),
                TableMetadata(name="t2", row_count=50, columns=[]),
            ],
        )
        enrichment: dict[str, Any] = {
            "t1": {"description": "OK desc", "columns": {}},
            "t2": {"description": "", "columns": {}},  # Description vide
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.tables_ok == 1
        assert result.tables_warning == 1

    def test_counts_ok_columns(self) -> None:
        """Compte les colonnes OK."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="c1", data_type="INT"),
                        ColumnMetadata(name="c2", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "t": {
                "description": "Table",
                "columns": {
                    "c1": {"description": "Column 1", "synonyms": []},
                    "c2": {"description": "Column 2", "synonyms": []},
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.columns_ok == 2
        assert result.columns_warning == 0

    def test_counts_warning_columns(self) -> None:
        """Compte les colonnes en warning."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="c1", data_type="INT"),
                        ColumnMetadata(name="c2", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "t": {
                "description": "Table",
                "columns": {
                    "c1": {"description": "Valid description", "synonyms": []},  # >3 chars = OK
                    "c2": {"description": "", "synonyms": []},  # Vide = warning
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        # Seuil est >3 caractères pour être OK
        assert result.columns_ok == 1
        assert result.columns_warning == 1

    def test_counts_synonyms(self) -> None:
        """Compte les synonymes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[ColumnMetadata(name="c", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "t": {
                "description": "Table",
                "columns": {
                    "c": {"description": "Column", "synonyms": ["alias1", "alias2", "alias3"]},
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.synonyms_total == 3

    def test_records_issues(self) -> None:
        """Enregistre les problèmes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "users": {
                "description": "",  # Manquante
                "columns": {
                    "id": {"description": "", "synonyms": []},  # Manquante
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert len(result.issues) == 2
        assert any("users" in issue for issue in result.issues)

    def test_handles_missing_table(self) -> None:
        """Gère les tables manquantes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )
        enrichment: dict[str, Any] = {}  # Pas d'enrichissement

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.tables_warning == 1

    def test_handles_missing_column(self) -> None:
        """Gère les colonnes manquantes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="t",
                    row_count=100,
                    columns=[ColumnMetadata(name="missing_col", data_type="INT")],
                )
            ],
        )
        enrichment: dict[str, Any] = {
            "t": {"description": "Table", "columns": {}}  # Pas de colonne
        }

        result = validate_catalog_enrichment(catalog, enrichment)
        assert result.columns_warning == 1
