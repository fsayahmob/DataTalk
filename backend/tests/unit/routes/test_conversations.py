"""Tests pour routes/conversations.py - Gestion des conversations."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.conversations import (
    analyze_in_conversation,
    create_new_conversation,
    get_conversation_messages,
    list_conversations,
    remove_all_conversations,
    remove_conversation,
)
from routes.dependencies import QuestionRequest


class TestCreateNewConversation:
    """Tests de create_new_conversation."""

    @pytest.mark.asyncio
    @patch("routes.conversations.create_conversation")
    async def test_creates_conversation(self, mock_create: MagicMock) -> None:
        """Crée une nouvelle conversation."""
        mock_create.return_value = 42

        result = await create_new_conversation()

        assert result["id"] == 42
        assert "message" in result
        mock_create.assert_called_once()


class TestListConversations:
    """Tests de list_conversations."""

    @pytest.mark.asyncio
    @patch("routes.conversations.get_conversations")
    @patch("routes.conversations.validate_pagination")
    async def test_lists_conversations(
        self, mock_validate: MagicMock, mock_get: MagicMock
    ) -> None:
        """Liste les conversations."""
        mock_validate.return_value = (20, 0)
        mock_get.return_value = [
            {"id": 1, "created_at": "2024-01-01"},
            {"id": 2, "created_at": "2024-01-02"},
        ]

        result = await list_conversations()

        assert len(result["conversations"]) == 2
        assert result["limit"] == 20
        assert result["offset"] == 0


class TestRemoveConversation:
    """Tests de remove_conversation."""

    @pytest.mark.asyncio
    @patch("routes.conversations.delete_conversation")
    async def test_removes_conversation(self, mock_delete: MagicMock) -> None:
        """Supprime une conversation."""
        mock_delete.return_value = True

        result = await remove_conversation(1)

        assert "message" in result
        mock_delete.assert_called_once_with(1)

    @pytest.mark.asyncio
    @patch("routes.conversations.delete_conversation")
    async def test_raises_if_not_found(self, mock_delete: MagicMock) -> None:
        """Lève une erreur si conversation non trouvée."""
        mock_delete.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await remove_conversation(999)

        assert exc_info.value.status_code == 404


class TestRemoveAllConversations:
    """Tests de remove_all_conversations."""

    @pytest.mark.asyncio
    @patch("routes.conversations.delete_all_conversations")
    async def test_removes_all(self, mock_delete: MagicMock) -> None:
        """Supprime toutes les conversations."""
        mock_delete.return_value = 5

        result = await remove_all_conversations()

        assert result["count"] == 5
        assert "message" in result


class TestGetConversationMessages:
    """Tests de get_conversation_messages."""

    @pytest.mark.asyncio
    @patch("routes.conversations.get_messages")
    async def test_returns_messages(self, mock_get: MagicMock) -> None:
        """Retourne les messages d'une conversation."""
        mock_get.return_value = [
            {"id": 1, "role": "user", "content": "Hello"},
            {"id": 2, "role": "assistant", "content": "Hi"},
        ]

        result = await get_conversation_messages(1)

        assert len(result["messages"]) == 2


class TestAnalyzeInConversation:
    """Tests de analyze_in_conversation."""

    @pytest.mark.asyncio
    @patch("routes.conversations.add_message")
    @patch("routes.conversations.call_llm_for_analytics")
    @patch("routes.conversations.execute_query")
    @patch("routes.conversations.should_disable_chart")
    async def test_successful_analysis(
        self,
        mock_disable: MagicMock,
        mock_execute: MagicMock,
        mock_llm: MagicMock,
        mock_add: MagicMock,
    ) -> None:
        """Analyse réussie dans une conversation."""
        mock_add.return_value = 10
        mock_llm.return_value = {
            "sql": "SELECT 1",
            "message": "Result",
            "chart": {"type": "bar", "x": "x", "y": "y", "title": "Test"},
            "_metadata": {
                "model_name": "gemini",
                "tokens_input": 10,
                "tokens_output": 20,
                "response_time_ms": 100,
            },
        }
        mock_execute.return_value = [{"col": 1}]
        mock_disable.return_value = (False, None)

        request = QuestionRequest(question="Test?")
        result = await analyze_in_conversation(1, request)

        assert result["message_id"] == 10
        assert result["sql"] == "SELECT 1"
        assert result["data"] == [{"col": 1}]
        assert result["model_name"] == "gemini"

    @pytest.mark.asyncio
    @patch("routes.conversations.add_message")
    @patch("routes.conversations.call_llm_for_analytics")
    async def test_handles_no_sql(
        self, mock_llm: MagicMock, mock_add: MagicMock
    ) -> None:
        """Gère le cas où pas de SQL généré."""
        mock_add.return_value = 5
        mock_llm.return_value = {
            "sql": "",
            "message": "Je ne peux pas répondre.",
            "chart": None,
            "_metadata": {"model_name": "gemini"},
        }

        request = QuestionRequest(question="Test?")
        result = await analyze_in_conversation(1, request)

        assert result["sql"] == ""
        assert result["data"] == []
        assert "ne peux pas" in result["message"] or result["message"] == "Je ne peux pas répondre."

    @pytest.mark.asyncio
    @patch("routes.conversations.add_message")
    @patch("routes.conversations.call_llm_for_analytics")
    @patch("routes.conversations.execute_query")
    @patch("routes.conversations.sanitize_sql_error")
    async def test_handles_sql_error(
        self,
        mock_sanitize: MagicMock,
        mock_execute: MagicMock,
        mock_llm: MagicMock,
        mock_add: MagicMock,
    ) -> None:
        """Gère les erreurs SQL."""
        mock_add.return_value = 5
        mock_llm.return_value = {
            "sql": "SELECT * FROM invalid_table",
            "message": "Voici les résultats",
            "chart": {"type": "bar"},
            "_metadata": {"model_name": "gemini"},
        }
        mock_execute.side_effect = Exception("Table not found")
        mock_sanitize.return_value = "db.query_error"

        request = QuestionRequest(question="Test?")
        result = await analyze_in_conversation(1, request)

        assert "sql_error" in result
        assert result["data"] == []

    @pytest.mark.asyncio
    @patch("routes.conversations.add_message")
    @patch("routes.conversations.call_llm_for_analytics")
    async def test_passes_use_context(
        self, mock_llm: MagicMock, mock_add: MagicMock
    ) -> None:
        """Passe use_context au LLM."""
        mock_add.return_value = 1
        mock_llm.return_value = {
            "sql": "",
            "message": "OK",
            "chart": None,
            "_metadata": {},
        }

        request = QuestionRequest(question="Test?", use_context=True)
        await analyze_in_conversation(1, request)

        mock_llm.assert_called_once()
        call_args = mock_llm.call_args
        assert call_args[1]["use_context"] is True or call_args[0][3] is True
