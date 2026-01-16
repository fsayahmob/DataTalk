"""
Fonctions helper pour le service LLM.

Contient les fonctions de conversion de noms de modèles et récupération de clés API.
"""

from typing import Any

from llm_config import get_api_key


def _get_litellm_model_name(model: dict[str, Any]) -> str:
    """Convertit notre model_id en format LiteLLM."""
    provider: str = model.get("provider_name", "")
    model_id: str = model.get("model_id", "")

    # Mapping provider -> préfixe LiteLLM
    if provider == "google":
        return f"gemini/{model_id}"
    if provider == "openai":
        return model_id  # OpenAI n'a pas besoin de préfixe
    if provider == "anthropic":
        return f"anthropic/{model_id}"
    if provider == "mistral":
        return f"mistral/{model_id}"
    if provider == "ollama":
        return f"ollama_chat/{model_id}"
    return model_id


def _get_api_key_for_model(model: dict[str, Any]) -> str | None:
    """
    Récupère la clé API pour un modèle.
    Retourne None si pas de clé requise ou non configurée.
    """
    provider_id = model.get("provider_id")
    if not provider_id:
        return None

    # Récupérer la clé (env var ou SQLite)
    return get_api_key(provider_id)
