"""
CRUD operations for LLM secrets (API keys).

Manages encrypted storage of API keys using AES encryption.
"""

from crypto import decrypt, encrypt
from db import get_connection


def set_api_key(provider_id: int, api_key: str) -> bool:
    """Sauvegarde une clé API (chiffrée) pour un provider."""
    conn = get_connection()
    cursor = conn.cursor()

    # Si clé vide, supprimer l'entrée
    if not api_key or not api_key.strip():
        cursor.execute("DELETE FROM llm_secrets WHERE provider_id = %s", (provider_id,))
        conn.commit()
        conn.close()
        return True

    # Chiffrer la clé
    encrypted_key = encrypt(api_key)

    # Masquer la clé pour l'affichage
    key_hint = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"

    cursor.execute(
        """
        INSERT INTO llm_secrets (provider_id, encrypted_api_key, key_hint, updated_at)
        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (provider_id) DO UPDATE SET
            encrypted_api_key = EXCLUDED.encrypted_api_key,
            key_hint = EXCLUDED.key_hint,
            updated_at = CURRENT_TIMESTAMP
    """,
        (provider_id, encrypted_key, key_hint),
    )

    conn.commit()
    conn.close()
    return True


def get_api_key(provider_id: int) -> str | None:
    """Récupère la clé API (déchiffrée) pour un provider depuis la base."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT encrypted_api_key FROM llm_secrets WHERE provider_id = %s", (provider_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if row and row["encrypted_api_key"]:
        return decrypt(row["encrypted_api_key"])

    return None


def has_api_key(provider_id: int) -> bool:
    """Vérifie si une clé API est configurée pour un provider."""
    return get_api_key(provider_id) is not None


def get_api_key_hint(provider_id: int) -> str | None:
    """Récupère l'indice de la clé API (ex: AIza...xyz)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key_hint FROM llm_secrets WHERE provider_id = %s", (provider_id,))
    row = cursor.fetchone()
    conn.close()
    return row["key_hint"] if row else None
