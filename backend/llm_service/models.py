"""
Modèles de réponse LLM.

Contient LLMResponse et StructuredLLMResponse.
"""

from typing import Any

from pydantic import BaseModel


class LLMResponse:
    """Réponse d'un appel LLM avec métadonnées."""

    def __init__(
        self,
        content: str,
        model_id: int,
        model_name: str,
        tokens_input: int,
        tokens_output: int,
        response_time_ms: int,
        cost_total: float,
    ):
        self.content = content
        self.model_id = model_id
        self.model_name = model_name
        self.tokens_input = tokens_input
        self.tokens_output = tokens_output
        self.response_time_ms = response_time_ms
        self.cost_total = cost_total

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "model_id": self.model_id,
            "model_name": self.model_name,
            "tokens_input": self.tokens_input,
            "tokens_output": self.tokens_output,
            "response_time_ms": self.response_time_ms,
            "cost_total": self.cost_total,
        }


class StructuredLLMResponse(LLMResponse):
    """Réponse structurée avec objet Pydantic."""

    def __init__(self, data: BaseModel, **kwargs: Any) -> None:
        super().__init__(content="", **kwargs)
        self.data = data
