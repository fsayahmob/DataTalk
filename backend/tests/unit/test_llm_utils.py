"""Tests pour llm_utils.py - Utilitaires LLM."""

from unittest.mock import MagicMock

import pytest

from llm_utils import (
    EnrichmentError,
    KpiGenerationError,
    LLMGenerationError,
    LLMJsonParseError,
    QuestionGenerationError,
    call_with_retry,
    extract_json_from_llm,
    parse_analytics_response,
    parse_llm_json,
)


class TestExceptions:
    """Tests des exceptions personnalisées."""

    def test_llm_generation_error_is_exception(self) -> None:
        """LLMGenerationError est une Exception."""
        assert issubclass(LLMGenerationError, Exception)

    def test_question_generation_error_inherits(self) -> None:
        """QuestionGenerationError hérite de LLMGenerationError."""
        assert issubclass(QuestionGenerationError, LLMGenerationError)

    def test_kpi_generation_error_inherits(self) -> None:
        """KpiGenerationError hérite de LLMGenerationError."""
        assert issubclass(KpiGenerationError, LLMGenerationError)

    def test_enrichment_error_inherits(self) -> None:
        """EnrichmentError hérite de LLMGenerationError."""
        assert issubclass(EnrichmentError, LLMGenerationError)

    def test_llm_json_parse_error_inherits(self) -> None:
        """LLMJsonParseError hérite de LLMGenerationError."""
        assert issubclass(LLMJsonParseError, LLMGenerationError)

    def test_exceptions_store_message(self) -> None:
        """Les exceptions stockent le message."""
        error = LLMGenerationError("Test error")
        assert str(error) == "Test error"


class TestParseLlmJson:
    """Tests de parse_llm_json."""

    def test_parses_valid_json(self) -> None:
        """Parse du JSON valide."""
        content = '{"key": "value", "number": 42}'
        result = parse_llm_json(content)
        assert result == {"key": "value", "number": 42}

    def test_parses_json_with_markdown(self) -> None:
        """Parse JSON avec balises markdown."""
        content = '```json\n{"test": true}\n```'
        result = parse_llm_json(content)
        assert result == {"test": True}

    def test_parses_json_with_text_before(self) -> None:
        """Parse JSON avec texte avant."""
        content = 'Here is the result: {"data": "value"}'
        result = parse_llm_json(content)
        assert result == {"data": "value"}

    def test_parses_json_with_text_after(self) -> None:
        """Parse JSON avec texte après."""
        content = '{"result": 123} Hope this helps!'
        result = parse_llm_json(content)
        assert result == {"result": 123}

    def test_parses_nested_json(self) -> None:
        """Parse JSON imbriqué."""
        content = '{"outer": {"inner": {"deep": true}}}'
        result = parse_llm_json(content)
        assert result["outer"]["inner"]["deep"] is True

    def test_parses_json_array(self) -> None:
        """Parse un tableau JSON."""
        content = '[{"a": 1}, {"b": 2}]'
        result = parse_llm_json(content)
        assert result == [{"a": 1}, {"b": 2}]

    def test_raises_on_empty_content(self) -> None:
        """Lève une erreur si contenu vide."""
        with pytest.raises(LLMJsonParseError) as exc_info:
            parse_llm_json("")
        assert "vide" in str(exc_info.value)

    def test_raises_on_no_json(self) -> None:
        """Lève une erreur si pas de JSON."""
        with pytest.raises(LLMJsonParseError) as exc_info:
            parse_llm_json("No JSON here, just text")
        assert "ne contient pas de JSON valide" in str(exc_info.value)

    def test_raises_on_invalid_json(self) -> None:
        """Lève une erreur si JSON invalide."""
        with pytest.raises(LLMJsonParseError) as exc_info:
            parse_llm_json("{invalid json}")
        assert "JSON" in str(exc_info.value) and "invalide" in str(exc_info.value)

    def test_uses_context_in_error(self) -> None:
        """Utilise le contexte dans les erreurs."""
        with pytest.raises(LLMJsonParseError) as exc_info:
            parse_llm_json("", context="KPIs")
        assert "KPIs" in str(exc_info.value)

    def test_handles_triple_backticks_only(self) -> None:
        """Gère les balises ``` sans json."""
        content = "```\n{\"value\": 100}\n```"
        result = parse_llm_json(content)
        assert result == {"value": 100}


class TestExtractJsonFromLlm:
    """Tests de extract_json_from_llm."""

    def test_returns_full_dict_if_no_key(self) -> None:
        """Retourne tout le dict si pas de clé."""
        content = '{"a": 1, "b": 2}'
        result = extract_json_from_llm(content)
        assert result == {"a": 1, "b": 2}

    def test_extracts_specific_key(self) -> None:
        """Extrait une clé spécifique."""
        content = '{"questions": [1, 2, 3], "other": "data"}'
        result = extract_json_from_llm(content, key="questions")
        assert result == [1, 2, 3]

    def test_raises_if_key_missing(self) -> None:
        """Lève une erreur si la clé est manquante."""
        content = '{"existing": "value"}'
        with pytest.raises(LLMJsonParseError) as exc_info:
            extract_json_from_llm(content, key="missing")
        assert "missing" in str(exc_info.value)
        assert "Clés disponibles" in str(exc_info.value)


class TestParseAnalyticsResponse:
    """Tests de parse_analytics_response."""

    def test_parses_valid_response(self) -> None:
        """Parse une réponse valide."""
        content = '{"sql": "SELECT *", "message": "Query", "chart": {"type": "bar"}}'
        result = parse_analytics_response(content)
        assert result["sql"] == "SELECT *"
        assert result["message"] == "Query"

    def test_fallback_on_empty(self) -> None:
        """Fallback sur contenu vide."""
        result = parse_analytics_response("")
        assert result["sql"] == ""
        assert result["message"] == ""
        assert result["chart"]["type"] == "none"

    def test_fallback_on_invalid_json(self) -> None:
        """Fallback sur JSON invalide."""
        content = "Je ne peux pas répondre à cette question."
        result = parse_analytics_response(content)
        assert result["sql"] == ""
        assert result["message"] == content
        assert result["chart"]["type"] == "none"

    def test_handles_list_response(self) -> None:
        """Gère une réponse en liste (prend le premier)."""
        content = '[{"sql": "SELECT 1", "message": "First"}]'
        result = parse_analytics_response(content)
        assert result["sql"] == "SELECT 1"

    def test_handles_empty_list(self) -> None:
        """Gère une liste vide."""
        content = "[]"
        result = parse_analytics_response(content)
        assert result == {}


class TestCallWithRetry:
    """Tests de call_with_retry."""

    def test_successful_call(self) -> None:
        """Appel réussi retourne le résultat."""
        call_fn = MagicMock(return_value="success")

        result = call_with_retry(call_fn)

        assert result == "success"
        call_fn.assert_called_once()

    def test_raises_on_none_result(self) -> None:
        """Lève une erreur si résultat None."""
        call_fn = MagicMock(return_value=None)

        with pytest.raises(LLMGenerationError):
            call_with_retry(call_fn, max_retries=0)

    def test_retries_on_failure(self) -> None:
        """Retry sur échec."""
        call_fn = MagicMock(side_effect=[Exception("fail"), "success"])

        result = call_with_retry(call_fn, max_retries=1)

        assert result == "success"
        assert call_fn.call_count == 2

    def test_raises_after_max_retries(self) -> None:
        """Lève une erreur après max retries."""
        call_fn = MagicMock(side_effect=Exception("always fails"))

        with pytest.raises(LLMGenerationError) as exc_info:
            call_with_retry(call_fn, max_retries=1)
        assert "Échec" in str(exc_info.value)

    def test_uses_custom_error_class(self) -> None:
        """Utilise la classe d'erreur personnalisée."""
        call_fn = MagicMock(side_effect=Exception("fail"))

        with pytest.raises(KpiGenerationError):
            call_with_retry(
                call_fn, max_retries=0, error_class=KpiGenerationError, context="KPI"
            )

    def test_validation_function(self) -> None:
        """Utilise la fonction de validation."""
        call_fn = MagicMock(return_value={"valid": False})
        validate_fn = MagicMock(return_value=False)

        with pytest.raises(LLMGenerationError):
            call_with_retry(call_fn, max_retries=0, validate_fn=validate_fn)

    def test_validation_passes(self) -> None:
        """Validation réussie."""
        call_fn = MagicMock(return_value={"data": [1, 2, 3]})
        validate_fn = MagicMock(return_value=True)

        result = call_with_retry(call_fn, validate_fn=validate_fn)

        assert result == {"data": [1, 2, 3]}
        validate_fn.assert_called_once_with({"data": [1, 2, 3]})

    def test_reraises_typed_error(self) -> None:
        """Re-lève les erreurs déjà typées."""
        call_fn = MagicMock(side_effect=KpiGenerationError("typed"))

        with pytest.raises(KpiGenerationError):
            call_with_retry(call_fn, max_retries=0, error_class=KpiGenerationError)
