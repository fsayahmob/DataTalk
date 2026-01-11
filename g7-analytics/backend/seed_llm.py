"""
Seed des providers et modèles LLM.
Lance ce script pour peupler les tables llm_providers et llm_models.
"""
from db import get_connection
from llm_config import init_llm_tables

# Providers LLM
PROVIDERS = [
    {
        "name": "google",
        "display_name": "Google AI",
        "type": "cloud",
        "requires_api_key": True,
    },
    {
        "name": "openai",
        "display_name": "OpenAI",
        "type": "cloud",
        "requires_api_key": True,
    },
    {
        "name": "anthropic",
        "display_name": "Anthropic",
        "type": "cloud",
        "requires_api_key": True,
    },
    {
        "name": "mistral",
        "display_name": "Mistral AI",
        "type": "cloud",
        "requires_api_key": True,
    },
    {
        "name": "ollama",
        "display_name": "Ollama",
        "type": "self-hosted",
        "requires_api_key": False,
    },
]

# Modèles LLM (avec support JSON structuré)
# Pricing source: https://ai.google.dev/pricing (Jan 2025)
MODELS = [
    # ========================================
    # Google AI - Gemini
    # ========================================
    {
        "provider": "google",
        "model_id": "gemini-2.0-flash",
        "display_name": "Gemini 2.0 Flash",
        "context_window": 1000000,
        "cost_per_1m_input": 0.10,
        "cost_per_1m_output": 0.40,
        "is_default": True,
    },
    {
        "provider": "google",
        "model_id": "gemini-2.5-flash",
        "display_name": "Gemini 2.5 Flash",
        "context_window": 1000000,
        "cost_per_1m_input": 0.30,
        "cost_per_1m_output": 2.50,
        "is_default": False,
    },
    {
        "provider": "google",
        "model_id": "gemini-2.5-flash-lite",
        "display_name": "Gemini 2.5 Flash Lite",
        "context_window": 1000000,
        "cost_per_1m_input": 0.10,
        "cost_per_1m_output": 0.40,
        "is_default": False,
    },
    {
        "provider": "google",
        "model_id": "gemini-2.5-pro",
        "display_name": "Gemini 2.5 Pro",
        "context_window": 1000000,
        "cost_per_1m_input": 1.25,
        "cost_per_1m_output": 10.00,
        "is_default": False,
    },
    {
        "provider": "google",
        "model_id": "gemini-3-flash-preview",
        "display_name": "Gemini 3 Flash (Preview)",
        "context_window": 1000000,
        "cost_per_1m_input": 0.50,
        "cost_per_1m_output": 3.00,
        "is_default": False,
    },
    {
        "provider": "google",
        "model_id": "gemini-3-pro-preview",
        "display_name": "Gemini 3 Pro (Preview)",
        "context_window": 1000000,
        "cost_per_1m_input": 2.00,
        "cost_per_1m_output": 12.00,
        "is_default": False,
    },
    # ========================================
    # OpenAI
    # ========================================
    {
        "provider": "openai",
        "model_id": "gpt-4o",
        "display_name": "GPT-4o",
        "context_window": 128000,
        "cost_per_1m_input": 2.50,
        "cost_per_1m_output": 10.00,
        "is_default": False,
    },
    {
        "provider": "openai",
        "model_id": "gpt-4o-mini",
        "display_name": "GPT-4o Mini",
        "context_window": 128000,
        "cost_per_1m_input": 0.15,
        "cost_per_1m_output": 0.60,
        "is_default": False,
    },
    {
        "provider": "openai",
        "model_id": "gpt-4.1",
        "display_name": "GPT-4.1",
        "context_window": 1000000,
        "cost_per_1m_input": 2.00,
        "cost_per_1m_output": 8.00,
        "is_default": False,
    },
    {
        "provider": "openai",
        "model_id": "gpt-4.1-mini",
        "display_name": "GPT-4.1 Mini",
        "context_window": 1000000,
        "cost_per_1m_input": 0.40,
        "cost_per_1m_output": 1.60,
        "is_default": False,
    },
    {
        "provider": "openai",
        "model_id": "o3-mini",
        "display_name": "o3 Mini (Reasoning)",
        "context_window": 200000,
        "cost_per_1m_input": 1.10,
        "cost_per_1m_output": 4.40,
        "is_default": False,
    },
    # ========================================
    # Anthropic
    # ========================================
    {
        "provider": "anthropic",
        "model_id": "claude-sonnet-4-20250514",
        "display_name": "Claude Sonnet 4",
        "context_window": 200000,
        "cost_per_1m_input": 3.00,
        "cost_per_1m_output": 15.00,
        "is_default": False,
    },
    {
        "provider": "anthropic",
        "model_id": "claude-3-5-haiku-20241022",
        "display_name": "Claude 3.5 Haiku",
        "context_window": 200000,
        "cost_per_1m_input": 0.80,
        "cost_per_1m_output": 4.00,
        "is_default": False,
    },
    {
        "provider": "anthropic",
        "model_id": "claude-opus-4-20250514",
        "display_name": "Claude Opus 4",
        "context_window": 200000,
        "cost_per_1m_input": 15.00,
        "cost_per_1m_output": 75.00,
        "is_default": False,
    },
    # ========================================
    # Mistral AI
    # ========================================
    {
        "provider": "mistral",
        "model_id": "mistral-large-latest",
        "display_name": "Mistral Large",
        "context_window": 128000,
        "cost_per_1m_input": 2.00,
        "cost_per_1m_output": 6.00,
        "is_default": False,
    },
    {
        "provider": "mistral",
        "model_id": "mistral-small-latest",
        "display_name": "Mistral Small",
        "context_window": 128000,
        "cost_per_1m_input": 0.20,
        "cost_per_1m_output": 0.60,
        "is_default": False,
    },
    {
        "provider": "mistral",
        "model_id": "codestral-latest",
        "display_name": "Codestral",
        "context_window": 256000,
        "cost_per_1m_input": 0.30,
        "cost_per_1m_output": 0.90,
        "is_default": False,
    },
    # ========================================
    # Ollama (local - pas de coût)
    # ========================================
    {
        "provider": "ollama",
        "model_id": "llama3.2",
        "display_name": "Llama 3.2 (Local)",
        "context_window": 128000,
        "cost_per_1m_input": None,
        "cost_per_1m_output": None,
        "is_default": False,
    },
    {
        "provider": "ollama",
        "model_id": "mistral",
        "display_name": "Mistral (Local)",
        "context_window": 32000,
        "cost_per_1m_input": None,
        "cost_per_1m_output": None,
        "is_default": False,
    },
    {
        "provider": "ollama",
        "model_id": "qwen2.5-coder",
        "display_name": "Qwen 2.5 Coder (Local)",
        "context_window": 128000,
        "cost_per_1m_input": None,
        "cost_per_1m_output": None,
        "is_default": False,
    },
]


def seed_providers() -> dict[str, int]:
    """Insère les providers et retourne un mapping name -> id."""
    conn = get_connection()
    cursor = conn.cursor()

    provider_ids: dict[str, int] = {}

    for provider in PROVIDERS:
        cursor.execute("""
            INSERT OR REPLACE INTO llm_providers
            (name, display_name, type, requires_api_key)
            VALUES (?, ?, ?, ?)
        """, (
            provider["name"],
            provider["display_name"],
            provider["type"],
            provider["requires_api_key"],
        ))

        # Récupérer l'ID
        provider_name = str(provider["name"])
        cursor.execute("SELECT id FROM llm_providers WHERE name = ?", (provider_name,))
        row = cursor.fetchone()
        if row:
            provider_ids[provider_name] = row["id"]

    conn.commit()
    conn.close()

    print(f"Providers insérés: {len(provider_ids)}")
    return provider_ids


def seed_models(provider_ids: dict[str, int]) -> None:
    """Insère les modèles."""
    conn = get_connection()
    cursor = conn.cursor()

    count = 0
    for model in MODELS:
        provider_name = str(model["provider"])
        provider_id = provider_ids.get(provider_name)
        if not provider_id:
            print(f"Provider non trouvé: {model['provider']}")
            continue

        cursor.execute("""
            INSERT OR REPLACE INTO llm_models
            (provider_id, model_id, display_name, context_window,
             cost_per_1m_input, cost_per_1m_output, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            provider_id,
            model["model_id"],
            model["display_name"],
            model["context_window"],
            model["cost_per_1m_input"],
            model["cost_per_1m_output"],
            model["is_default"],
        ))
        count += 1

    conn.commit()
    conn.close()

    print(f"Modèles insérés: {count}")


def seed_all():
    """Initialise les tables et insère les données."""
    print("Initialisation des tables LLM...")
    init_llm_tables()

    print("Insertion des providers...")
    provider_ids = seed_providers()

    print("Insertion des modèles...")
    seed_models(provider_ids)

    print("Seed terminé!")


if __name__ == "__main__":
    seed_all()
