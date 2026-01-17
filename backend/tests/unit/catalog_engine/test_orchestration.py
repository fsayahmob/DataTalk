"""Tests pour catalog_engine/orchestration.py - Orchestration workflows."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from catalog_engine.models import ColumnMetadata, ExtractedCatalog, TableMetadata
from catalog_engine.orchestration import (
    _dummy_context,
    _enrich_tables,
    enrich_selected_tables,
    extract_only,
)


class TestDummyContext:
    """Tests de _dummy_context."""

    def test_is_context_manager(self) -> None:
        """Est un context manager."""
        with _dummy_context():
            pass  # Ne doit pas lever d'erreur

    def test_yields_none(self) -> None:
        """Yield None."""
        with _dummy_context() as value:
            assert value is None


class TestExtractOnly:
    """Tests de extract_only."""

    @patch("catalog_engine.orchestration.build_column_full_context")
    @patch("catalog_engine.orchestration.add_column")
    @patch("catalog_engine.orchestration.add_table")
    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.add_datasource")
    @patch("catalog_engine.orchestration.extract_metadata_from_connection")
    def test_extracts_metadata(
        self,
        mock_extract: MagicMock,
        mock_ds: MagicMock,
        mock_conn: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Extrait les métadonnées."""
        mock_extract.return_value = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1
        mock_context.return_value = ""

        db_conn = MagicMock()
        result = extract_only(db_conn)

        assert result["status"] == "ok"
        mock_extract.assert_called_once_with(db_conn)

    @patch("catalog_engine.orchestration.build_column_full_context")
    @patch("catalog_engine.orchestration.add_column")
    @patch("catalog_engine.orchestration.add_table")
    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.add_datasource")
    @patch("catalog_engine.orchestration.extract_metadata_from_connection")
    def test_saves_tables_without_description(
        self,
        mock_extract: MagicMock,
        mock_ds: MagicMock,
        mock_conn: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Sauvegarde les tables sans description."""
        mock_extract.return_value = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )
        mock_ds.return_value = 1
        mock_table.return_value = 1

        db_conn = MagicMock()
        extract_only(db_conn)

        # Vérifie que description=None
        call_args = mock_table.call_args
        assert call_args[1]["description"] is None

    @patch("catalog_engine.orchestration.build_column_full_context")
    @patch("catalog_engine.orchestration.add_column")
    @patch("catalog_engine.orchestration.add_table")
    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.add_datasource")
    @patch("catalog_engine.orchestration.extract_metadata_from_connection")
    def test_returns_stats(
        self,
        mock_extract: MagicMock,
        mock_ds: MagicMock,
        mock_conn: MagicMock,
        mock_table: MagicMock,
        mock_col: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Retourne les stats."""
        mock_extract.return_value = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="id", data_type="INT"),
                        ColumnMetadata(name="name", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        mock_ds.return_value = 1
        mock_table.return_value = 1
        mock_col.return_value = 1
        mock_context.return_value = ""

        db_conn = MagicMock()
        result = extract_only(db_conn)

        assert result["stats"]["tables"] == 1
        assert result["stats"]["columns"] == 2

    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.add_datasource")
    @patch("catalog_engine.orchestration.extract_metadata_from_connection")
    def test_raises_if_datasource_fails(
        self,
        mock_extract: MagicMock,
        mock_ds: MagicMock,
        mock_conn: MagicMock,
    ) -> None:
        """Lève erreur si création datasource échoue."""
        mock_extract.return_value = ExtractedCatalog(
            datasource="test.duckdb", tables=[]
        )
        mock_ds.return_value = None
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        db_conn = MagicMock()
        with pytest.raises(ValueError, match="Impossible"):
            extract_only(db_conn)


class TestEnrichSelectedTables:
    """Tests de enrich_selected_tables."""

    @patch("catalog_engine.orchestration.get_connection")
    def test_returns_error_for_empty_table_ids(self, mock_conn: MagicMock) -> None:
        """Retourne erreur si pas de table_ids."""
        db_conn = MagicMock()
        result = enrich_selected_tables([], db_conn)

        assert result["status"] == "error"
        assert "Aucune table" in result["message"]

    @patch("catalog_engine.orchestration._enrich_tables")
    @patch("catalog_engine.orchestration.get_connection")
    def test_updates_is_enabled(
        self,
        mock_conn: MagicMock,
        mock_enrich: MagicMock,
    ) -> None:
        """Met à jour is_enabled."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "name": "users", "row_count": 100, "datasource_id": 1, "datasource_name": "test"}
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_enrich.return_value = {"status": "ok", "stats": {}}

        db_conn = MagicMock()
        enrich_selected_tables([1, 2], db_conn)

        # Vérifie les UPDATE
        update_calls = [
            c for c in cursor.execute.call_args_list
            if "UPDATE" in str(c) and "is_enabled" in str(c)
        ]
        assert len(update_calls) >= 1

    @patch("catalog_engine.orchestration.get_connection")
    def test_returns_error_if_no_tables_found(self, mock_conn: MagicMock) -> None:
        """Retourne erreur si tables non trouvées."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []  # Pas de tables
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        db_conn = MagicMock()
        result = enrich_selected_tables([999], db_conn)

        assert result["status"] == "error"
        assert "Aucune table trouvée" in result["message"]


class TestEnrichTables:
    """Tests de _enrich_tables."""

    @patch("catalog_engine.orchestration.save_suggested_questions")
    @patch("catalog_engine.orchestration.generate_suggested_questions")
    @patch("catalog_engine.orchestration.save_kpis")
    @patch("catalog_engine.orchestration.generate_kpis")
    @patch("catalog_engine.orchestration.update_descriptions")
    @patch("catalog_engine.orchestration.validate_catalog_enrichment")
    @patch("catalog_engine.orchestration.enrich_with_llm")
    @patch("catalog_engine.orchestration.get_setting")
    @patch("catalog_engine.orchestration.get_connection")
    def test_enriches_tables(
        self,
        mock_conn: MagicMock,
        mock_setting: MagicMock,
        mock_enrich: MagicMock,
        mock_validate: MagicMock,
        mock_update: MagicMock,
        mock_kpis: MagicMock,
        mock_save_kpis: MagicMock,
        mock_questions: MagicMock,
        mock_save_questions: MagicMock,
    ) -> None:
        """Enrichit les tables."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"name": "id", "data_type": "INT", "full_context": "", "sample_values": None, "value_range": None}
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_setting.return_value = "4"  # batch size

        mock_enrich.return_value = {"users": {"description": "Test", "columns": {}}}

        from catalog_engine.models import CatalogValidationResult
        mock_validate.return_value = CatalogValidationResult()
        mock_update.return_value = {"tables": 1, "columns": 1, "synonyms": 0}

        from catalog_engine.models import KpisGenerationResult
        mock_kpis.return_value = KpisGenerationResult(kpis=[])
        mock_save_kpis.return_value = {"kpis": 0}
        mock_questions.return_value = []
        mock_save_questions.return_value = {"questions": 0}

        tables_rows = [{"id": 1, "name": "users", "row_count": 100}]
        db_conn = MagicMock()

        result = _enrich_tables(tables_rows, db_conn)

        assert result["status"] == "ok"

    @patch("catalog_engine.orchestration.get_setting")
    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.enrich_with_llm")
    def test_handles_vertex_ai_error(
        self,
        mock_enrich: MagicMock,
        mock_conn: MagicMock,
        mock_setting: MagicMock,
    ) -> None:
        """Gère l'erreur Vertex AI."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"name": "c", "data_type": "INT", "full_context": "", "sample_values": None, "value_range": None}
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_setting.return_value = "4"

        mock_enrich.side_effect = Exception("too many states in schema")

        tables_rows = [{"id": 1, "name": "t", "row_count": 100}]
        db_conn = MagicMock()

        result = _enrich_tables(tables_rows, db_conn)

        assert result["status"] == "error"
        assert result["error_type"] == "vertex_ai_schema_too_complex"

    @patch("catalog_engine.orchestration.get_setting")
    @patch("catalog_engine.orchestration.get_connection")
    @patch("catalog_engine.orchestration.enrich_with_llm")
    def test_handles_llm_error(
        self,
        mock_enrich: MagicMock,
        mock_conn: MagicMock,
        mock_setting: MagicMock,
    ) -> None:
        """Gère les erreurs LLM génériques."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"name": "c", "data_type": "INT", "full_context": "", "sample_values": None, "value_range": None}
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_setting.return_value = "4"

        mock_enrich.side_effect = Exception("API rate limit exceeded")

        tables_rows = [{"id": 1, "name": "t", "row_count": 100}]
        db_conn = MagicMock()

        result = _enrich_tables(tables_rows, db_conn)

        assert result["status"] == "error"
        assert result["error_type"] == "llm_error"

    @patch("catalog_engine.orchestration.save_suggested_questions")
    @patch("catalog_engine.orchestration.generate_suggested_questions")
    @patch("catalog_engine.orchestration.save_kpis")
    @patch("catalog_engine.orchestration.generate_kpis")
    @patch("catalog_engine.orchestration.update_descriptions")
    @patch("catalog_engine.orchestration.validate_catalog_enrichment")
    @patch("catalog_engine.orchestration.enrich_with_llm")
    @patch("catalog_engine.orchestration.get_setting")
    @patch("catalog_engine.orchestration.get_connection")
    def test_handles_kpi_error(
        self,
        mock_conn: MagicMock,
        mock_setting: MagicMock,
        mock_enrich: MagicMock,
        mock_validate: MagicMock,
        mock_update: MagicMock,
        mock_kpis: MagicMock,
        mock_save_kpis: MagicMock,
        mock_questions: MagicMock,
        mock_save_questions: MagicMock,
    ) -> None:
        """Gère les erreurs de génération KPI."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_setting.return_value = "4"

        mock_enrich.return_value = {}

        from catalog_engine.models import CatalogValidationResult
        mock_validate.return_value = CatalogValidationResult()
        mock_update.return_value = {"tables": 0, "columns": 0, "synonyms": 0}

        from llm_utils import KpiGenerationError
        mock_kpis.side_effect = KpiGenerationError("KPI error")
        mock_questions.return_value = []
        mock_save_questions.return_value = {"questions": 0}

        tables_rows: list[dict[str, Any]] = []
        db_conn = MagicMock()

        result = _enrich_tables(tables_rows, db_conn)

        # Devrait continuer malgré l'erreur KPI
        assert result["status"] == "ok"
        assert result["stats"]["kpis"] == 0
        assert "kpis_error" in result["stats"]

    @patch("catalog_engine.orchestration.save_suggested_questions")
    @patch("catalog_engine.orchestration.generate_suggested_questions")
    @patch("catalog_engine.orchestration.save_kpis")
    @patch("catalog_engine.orchestration.generate_kpis")
    @patch("catalog_engine.orchestration.update_descriptions")
    @patch("catalog_engine.orchestration.validate_catalog_enrichment")
    @patch("catalog_engine.orchestration.enrich_with_llm")
    @patch("catalog_engine.orchestration.get_setting")
    @patch("catalog_engine.orchestration.get_connection")
    def test_handles_questions_error(
        self,
        mock_conn: MagicMock,
        mock_setting: MagicMock,
        mock_enrich: MagicMock,
        mock_validate: MagicMock,
        mock_update: MagicMock,
        mock_kpis: MagicMock,
        mock_save_kpis: MagicMock,
        mock_questions: MagicMock,
        mock_save_questions: MagicMock,
    ) -> None:
        """Gère les erreurs de génération questions."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_setting.return_value = "4"

        mock_enrich.return_value = {}

        from catalog_engine.models import CatalogValidationResult, KpisGenerationResult
        mock_validate.return_value = CatalogValidationResult()
        mock_update.return_value = {"tables": 0, "columns": 0, "synonyms": 0}
        mock_kpis.return_value = KpisGenerationResult(kpis=[])
        mock_save_kpis.return_value = {"kpis": 0}

        from llm_utils import QuestionGenerationError
        mock_questions.side_effect = QuestionGenerationError("Questions error")

        tables_rows: list[dict[str, Any]] = []
        db_conn = MagicMock()

        result = _enrich_tables(tables_rows, db_conn)

        # Devrait continuer malgré l'erreur questions
        assert result["status"] == "ok"
        assert result["stats"]["questions"] == 0
        assert "questions_error" in result["stats"]
