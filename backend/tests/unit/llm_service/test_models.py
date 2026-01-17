"""Tests pour llm_service/models.py - Modèles de réponse LLM."""

import pytest
from pydantic import BaseModel

from llm_service.models import LLMResponse, StructuredLLMResponse


class TestLLMResponse:
    """Tests de LLMResponse."""

    def test_stores_all_attributes(self) -> None:
        """Stocke tous les attributs."""
        response = LLMResponse(
            content="Test content",
            model_id=1,
            model_name="gemini-2.0-flash",
            tokens_input=100,
            tokens_output=50,
            response_time_ms=500,
            cost_total=0.001,
        )

        assert response.content == "Test content"
        assert response.model_id == 1
        assert response.model_name == "gemini-2.0-flash"
        assert response.tokens_input == 100
        assert response.tokens_output == 50
        assert response.response_time_ms == 500
        assert response.cost_total == 0.001

    def test_to_dict(self) -> None:
        """to_dict retourne un dictionnaire complet."""
        response = LLMResponse(
            content="Hello",
            model_id=2,
            model_name="gpt-4",
            tokens_input=10,
            tokens_output=20,
            response_time_ms=300,
            cost_total=0.05,
        )

        result = response.to_dict()

        assert result == {
            "content": "Hello",
            "model_id": 2,
            "model_name": "gpt-4",
            "tokens_input": 10,
            "tokens_output": 20,
            "response_time_ms": 300,
            "cost_total": 0.05,
        }

    def test_empty_content(self) -> None:
        """Gère le contenu vide."""
        response = LLMResponse(
            content="",
            model_id=1,
            model_name="test",
            tokens_input=0,
            tokens_output=0,
            response_time_ms=0,
            cost_total=0.0,
        )

        assert response.content == ""
        assert response.to_dict()["content"] == ""


class TestStructuredLLMResponse:
    """Tests de StructuredLLMResponse."""

    def test_inherits_from_llm_response(self) -> None:
        """Hérite de LLMResponse."""
        assert issubclass(StructuredLLMResponse, LLMResponse)

    def test_stores_pydantic_data(self) -> None:
        """Stocke les données Pydantic."""

        class TestModel(BaseModel):
            name: str
            value: int

        data = TestModel(name="test", value=42)
        response = StructuredLLMResponse(
            data=data,
            model_id=1,
            model_name="gemini",
            tokens_input=10,
            tokens_output=20,
            response_time_ms=100,
            cost_total=0.001,
        )

        assert response.data == data
        assert response.data.name == "test"
        assert response.data.value == 42

    def test_content_is_empty(self) -> None:
        """Le contenu est vide (remplacé par data)."""

        class SimpleModel(BaseModel):
            text: str

        data = SimpleModel(text="hello")
        response = StructuredLLMResponse(
            data=data,
            model_id=1,
            model_name="test",
            tokens_input=5,
            tokens_output=10,
            response_time_ms=50,
            cost_total=0.0,
        )

        assert response.content == ""

    def test_to_dict_from_parent(self) -> None:
        """to_dict hérite du parent."""

        class DummyModel(BaseModel):
            x: int

        response = StructuredLLMResponse(
            data=DummyModel(x=1),
            model_id=3,
            model_name="claude",
            tokens_input=100,
            tokens_output=200,
            response_time_ms=1000,
            cost_total=0.1,
        )

        result = response.to_dict()

        assert result["model_id"] == 3
        assert result["model_name"] == "claude"
        assert result["tokens_input"] == 100
        assert result["content"] == ""
