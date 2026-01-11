"""
Script de migration: gemini_api_key (settings) → llm_secrets (chiffré).
À exécuter une seule fois après le déploiement du nouveau système LLM.
"""
from db import get_connection
from llm_config import get_provider_by_name, init_llm_tables, set_api_key


def migrate_gemini_key():
    """Migre la clé Gemini de settings vers llm_secrets."""
    print("Migration de gemini_api_key vers llm_secrets...")

    # 1. Récupérer l'ancienne clé depuis settings
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    row = cursor.fetchone()
    conn.close()

    if not row or not row["value"]:
        print("Aucune clé gemini_api_key trouvée dans settings.")
        return False

    old_key = row["value"]
    print(f"Clé trouvée: {old_key[:4]}...{old_key[-4:]}")

    # 2. S'assurer que les tables LLM existent
    init_llm_tables()

    # 3. Trouver le provider Google
    google_provider = get_provider_by_name("google")
    if not google_provider:
        print("ERREUR: Provider 'google' non trouvé. Lancez seed_llm.py d'abord.")
        return False

    # 4. Sauvegarder la clé (chiffrée) dans llm_secrets
    set_api_key(google_provider["id"], old_key)
    print(f"Clé migrée vers llm_secrets (provider_id={google_provider['id']})")

    # 5. Supprimer l'ancienne clé de settings (optionnel)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM settings WHERE key = 'gemini_api_key'")
    conn.commit()
    deleted = cursor.rowcount
    conn.close()

    if deleted:
        print("Ancienne clé supprimée de settings.")
    else:
        print("Note: Aucune clé à supprimer de settings.")

    print("Migration terminée!")
    return True


if __name__ == "__main__":
    migrate_gemini_key()
