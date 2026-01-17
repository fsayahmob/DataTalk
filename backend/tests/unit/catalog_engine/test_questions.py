"""Tests pour catalog_engine/questions.py - Génération questions suggérées."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from catalog_engine.models import ExtractedCatalog, TableMetadata
from catalog_engine.questions import (
    generate_suggested_questions,
    save_suggested_questions,
)


class TestGenerateSuggestedQuestions:
    """Tests de generate_suggested_questions."""

    @patch("catalog_engine.questions.get_active_prompt")
    def test_raises_if_prompt_not_found(self, mock_prompt: MagicMock) -> None:
        """Lève erreur si prompt non trouvé."""
        mock_prompt.return_value = None

        from llm_utils import QuestionGenerationError

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )

        with pytest.raises(QuestionGenerationError):
            generate_suggested_questions(catalog)

    @patch("catalog_engine.questions.get_active_prompt")
    def test_raises_if_prompt_empty(self, mock_prompt: MagicMock) -> None:
        """Lève erreur si prompt vide."""
        mock_prompt.return_value = {"content": ""}

        from llm_utils import QuestionGenerationError

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )

        with pytest.raises(QuestionGenerationError):
            generate_suggested_questions(catalog)

    @patch("catalog_engine.questions.call_with_retry")
    @patch("catalog_engine.questions.get_schema_for_llm")
    @patch("catalog_engine.questions.get_active_prompt")
    def test_returns_questions_list(
        self,
        mock_prompt: MagicMock,
        mock_schema: MagicMock,
        mock_retry: MagicMock,
    ) -> None:
        """Retourne une liste de questions."""
        mock_prompt.return_value = {"content": "Generate questions for: {schema}"}
        mock_schema.return_value = "Table: users (100 rows)"
        mock_retry.return_value = [
            {"question": "How many users?", "category": "Stats", "icon": "📊"},
            {"question": "User distribution?", "category": "Analysis", "icon": "📈"},
        ]

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="users", row_count=100, columns=[])],
        )

        result = generate_suggested_questions(catalog)

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["question"] == "How many users?"

    @patch("catalog_engine.questions.call_with_retry")
    @patch("catalog_engine.questions.get_schema_for_llm")
    @patch("catalog_engine.questions.get_active_prompt")
    def test_uses_schema_from_sqlite(
        self,
        mock_prompt: MagicMock,
        mock_schema: MagicMock,
        mock_retry: MagicMock,
    ) -> None:
        """Utilise le schéma depuis SQLite."""
        mock_prompt.return_value = {"content": "Prompt: {schema}"}
        mock_schema.return_value = "Schema from SQLite"
        mock_retry.return_value = []

        catalog = ExtractedCatalog(datasource="test.duckdb", tables=[])

        generate_suggested_questions(catalog)

        mock_schema.assert_called_once()


class TestSaveSuggestedQuestions:
    """Tests de save_suggested_questions."""

    def test_returns_zero_for_empty_list(self) -> None:
        """Retourne 0 pour liste vide."""
        stats = save_suggested_questions([])
        assert stats["questions"] == 0

    @patch("catalog_engine.questions.get_connection")
    def test_saves_questions_to_db(self, mock_conn: MagicMock) -> None:
        """Sauvegarde les questions en DB."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        questions = [
            {"question": "Q1?", "category": "Cat1", "icon": "📊"},
            {"question": "Q2?", "category": "Cat2", "icon": "📈"},
        ]

        stats = save_suggested_questions(questions)

        assert stats["questions"] == 2

    @patch("catalog_engine.questions.get_connection")
    def test_clears_old_questions(self, mock_conn: MagicMock) -> None:
        """Vide les anciennes questions."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        questions = [{"question": "Q?", "category": "C", "icon": "📊"}]

        save_suggested_questions(questions)

        # Vérifie que DELETE a été appelé
        delete_calls = [c for c in cursor.execute.call_args_list if "DELETE" in str(c)]
        assert len(delete_calls) > 0

    @patch("catalog_engine.questions.get_connection")
    def test_sets_display_order(self, mock_conn: MagicMock) -> None:
        """Définit display_order."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        questions = [
            {"question": "Q1?", "category": "C", "icon": "📊"},
            {"question": "Q2?", "category": "C", "icon": "📈"},
        ]

        save_suggested_questions(questions)

        # Vérifie les INSERT avec display_order
        insert_calls = [c for c in cursor.execute.call_args_list if "INSERT" in str(c)]
        # Premier appel avec display_order=0, deuxième avec display_order=1
        assert len(insert_calls) == 2

    @patch("catalog_engine.questions.get_connection")
    def test_handles_insert_error(self, mock_conn: MagicMock) -> None:
        """Gère les erreurs d'insertion."""
        conn = MagicMock()
        cursor = MagicMock()
        # DELETE OK, premier INSERT erreur
        cursor.execute.side_effect = [None, Exception("Insert error")]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        questions = [{"question": "Q?", "category": "C", "icon": "📊"}]

        # Ne devrait pas lever d'erreur
        stats = save_suggested_questions(questions)
        assert stats["questions"] == 0

    @patch("catalog_engine.questions.get_connection")
    def test_handles_missing_fields(self, mock_conn: MagicMock) -> None:
        """Gère les champs manquants."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        # Question avec champs manquants
        questions: list[dict[str, str]] = [
            {"question": "Q?"},  # Pas de category ni icon
        ]

        stats = save_suggested_questions(questions)

        # Devrait quand même insérer avec None
        assert stats["questions"] == 1

    @patch("catalog_engine.questions.get_connection")
    def test_commits_and_closes(self, mock_conn: MagicMock) -> None:
        """Commit et ferme la connexion."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        questions = [{"question": "Q?", "category": "C", "icon": "📊"}]

        save_suggested_questions(questions)

        conn.commit.assert_called_once()
        conn.close.assert_called_once()
