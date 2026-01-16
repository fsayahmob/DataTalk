"""Fixtures pour les tests LLM."""

# Provider de test
MOCK_PROVIDER = {
    "id": 1,
    "name": "google",
    "display_name": "Google AI",
    "is_enabled": 1,
    "requires_api_key": True,
    "base_url": None,
}

MOCK_PROVIDER_OLLAMA = {
    "id": 2,
    "name": "ollama",
    "display_name": "Ollama (Local)",
    "is_enabled": 1,
    "requires_api_key": False,
    "base_url": "http://localhost:11434",
}

# Modèle de test
MOCK_MODEL = {
    "id": 1,
    "model_id": "gemini-2.0-flash",
    "display_name": "Gemini 2.0 Flash",
    "provider_id": 1,
    "provider_name": "google",
    "provider_display_name": "Google AI",
    "is_enabled": 1,
    "is_default": 1,
    "requires_api_key": True,
    "base_url": None,
    "cost_per_1m_input": 0.075,
    "cost_per_1m_output": 0.30,
}

# Prompt de test
MOCK_PROMPT = {
    "id": 1,
    "key": "catalog_enrichment",
    "name": "Enrichissement Catalogue",
    "category": "catalog",
    "content": "Tu es un expert en bases de données...",
    "version": "normal",
    "is_active": 1,
}
