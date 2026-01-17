"""Tests pour routes/analytics.py - Analyse Text-to-SQL."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from routes.analytics import build_conversation_context, call_llm_for_analytics
from routes.dependencies import AnalysisFilters


class TestBuildConversationContext:
    """Tests de build_conversation_context."""

    def test_returns_empty_if_no_conversation_id(self) -> None:
        """Retourne vide si pas de conversation_id."""
        result = build_conversation_context(None)
        assert result == ""

    @patch("routes.analytics.get_messages")
    def test_returns_empty_if_no_messages(self, mock_get_messages: MagicMock) -> None:
        """Retourne vide si pas de messages."""
        mock_get_messages.return_value = []
        result = build_conversation_context(1)
        assert result == ""

    @patch("routes.analytics.get_messages")
    def test_builds_context_from_messages(self, mock_get_messages: MagicMock) -> None:
        """Construit le contexte à partir des messages."""
        mock_get_messages.return_value = [
            {"role": "user", "content": "Question 1"},
            {"role": "assistant", "content": "Réponse 1", "sql_query": None},
        ]
        result = build_conversation_context(1)
        assert "HISTORIQUE DE LA CONVERSATION:" in result
        assert "Utilisateur: Question 1" in result
        assert "Assistant: Réponse 1" in result

    @patch("routes.analytics.get_messages")
    def test_includes_sql_preview_in_context(self, mock_get_messages: MagicMock) -> None:
        """Inclut un aperçu du SQL dans le contexte."""
        mock_get_messages.return_value = [
            {"role": "user", "content": "Top 10 chauffeurs"},
            {
                "role": "assistant",
                "content": "Voici les résultats",
                "sql_query": "SELECT * FROM drivers ORDER BY rating DESC LIMIT 10",
            },
        ]
        result = build_conversation_context(1)
        assert "SQL:" in result
        assert "SELECT" in result

    @patch("routes.analytics.get_messages")
    def test_limits_to_max_messages(self, mock_get_messages: MagicMock) -> None:
        """Limite au nombre max de messages."""
        # 10 messages
        mock_get_messages.return_value = [
            {"role": "user", "content": f"Q{i}", "sql_query": None} for i in range(10)
        ]
        result = build_conversation_context(1, max_messages=4)
        # Devrait inclure seulement les 4 derniers
        assert "Q6" in result
        assert "Q9" in result
        assert "Q0" not in result


class TestCallLlmForAnalytics:
    """Tests de call_llm_for_analytics."""

    @patch("routes.analytics.check_llm_status")
    def test_raises_if_llm_not_ok(self, mock_status: MagicMock) -> None:
        """Lève une erreur si LLM pas OK."""
        mock_status.return_value = {"status": "error", "message": "Not configured"}

        with pytest.raises(HTTPException) as exc_info:
            call_llm_for_analytics("test question")

        assert exc_info.value.status_code == 500

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    @patch("routes.analytics.parse_analytics_response")
    def test_successful_call(
        self,
        mock_parse: MagicMock,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Appel réussi retourne les données."""
        mock_status.return_value = {"status": "ok"}
        mock_instruction.return_value = "System prompt"

        mock_response = MagicMock()
        mock_response.content = '{"sql": "SELECT 1", "message": "OK"}'
        mock_response.model_name = "gemini"
        mock_response.tokens_input = 10
        mock_response.tokens_output = 20
        mock_response.response_time_ms = 100
        mock_call_llm.return_value = mock_response

        mock_parse.return_value = {"sql": "SELECT 1", "message": "OK"}

        result = call_llm_for_analytics("test")

        assert result["sql"] == "SELECT 1"
        assert "_metadata" in result
        assert result["_metadata"]["model_name"] == "gemini"

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    @patch("routes.analytics.build_filter_context")
    def test_uses_filters(
        self,
        mock_filter_ctx: MagicMock,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Utilise les filtres dans le prompt."""
        mock_status.return_value = {"status": "ok"}
        mock_instruction.return_value = "System"
        mock_filter_ctx.return_value = "FILTRES: date_start=2024-01-01"

        mock_response = MagicMock()
        mock_response.content = "{}"
        mock_response.model_name = "test"
        mock_response.tokens_input = 0
        mock_response.tokens_output = 0
        mock_response.response_time_ms = 0
        mock_call_llm.return_value = mock_response

        filters = AnalysisFilters(date_start="2024-01-01")  # type: ignore[call-arg]
        call_llm_for_analytics("test", filters=filters)

        mock_filter_ctx.assert_called_once_with(filters)

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    @patch("routes.analytics.build_conversation_context")
    def test_uses_context_when_enabled(
        self,
        mock_build_ctx: MagicMock,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Utilise le contexte conversationnel si use_context=True."""
        mock_status.return_value = {"status": "ok"}
        mock_instruction.return_value = "System"
        mock_build_ctx.return_value = "HISTORIQUE..."

        mock_response = MagicMock()
        mock_response.content = "{}"
        mock_response.model_name = "test"
        mock_response.tokens_input = 0
        mock_response.tokens_output = 0
        mock_response.response_time_ms = 0
        mock_call_llm.return_value = mock_response

        call_llm_for_analytics("test", conversation_id=1, use_context=True)

        mock_build_ctx.assert_called_once_with(1)

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    @patch("routes.analytics.build_conversation_context")
    def test_skips_context_when_disabled(
        self,
        mock_build_ctx: MagicMock,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Ne construit pas le contexte si use_context=False."""
        mock_status.return_value = {"status": "ok"}
        mock_instruction.return_value = "System"

        mock_response = MagicMock()
        mock_response.content = "{}"
        mock_response.model_name = "test"
        mock_response.tokens_input = 0
        mock_response.tokens_output = 0
        mock_response.response_time_ms = 0
        mock_call_llm.return_value = mock_response

        call_llm_for_analytics("test", conversation_id=1, use_context=False)

        mock_build_ctx.assert_not_called()

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    def test_handles_llm_error(
        self,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Gère les erreurs LLM."""
        from llm_service import LLMError, LLMErrorCode

        mock_status.return_value = {"status": "ok"}
        mock_instruction.return_value = "System"
        mock_call_llm.side_effect = LLMError(LLMErrorCode.QUOTA_EXCEEDED, provider="Google")

        with pytest.raises(HTTPException) as exc_info:
            call_llm_for_analytics("test")

        assert exc_info.value.status_code == 500

    @patch("routes.analytics.check_llm_status")
    @patch("routes.analytics.call_llm")
    @patch("routes.analytics.get_system_instruction")
    def test_handles_prompt_not_configured(
        self,
        mock_instruction: MagicMock,
        mock_call_llm: MagicMock,
        mock_status: MagicMock,
    ) -> None:
        """Gère l'erreur de prompt non configuré."""
        from core.state import PromptNotConfiguredError

        mock_status.return_value = {"status": "ok"}
        mock_instruction.side_effect = PromptNotConfiguredError("analytics_system")

        with pytest.raises(HTTPException) as exc_info:
            call_llm_for_analytics("test")

        assert exc_info.value.status_code == 503
        assert "analytics_system" in exc_info.value.detail
