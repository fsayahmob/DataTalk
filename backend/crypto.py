"""
Chiffrement AES-256 pour les secrets (clés API).
Utilise la bibliothèque cryptography.
"""
import base64
import hashlib
import os
from typing import Optional

try:
    from cryptography.fernet import Fernet
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


def _get_encryption_key() -> bytes:
    """
    Récupère la clé de chiffrement.
    Priorité:
    1. Variable d'environnement ENCRYPTION_KEY
    2. Clé dérivée du hostname (fallback pour dev)
    """
    env_key = os.getenv("ENCRYPTION_KEY")

    if env_key:
        # Utiliser la clé fournie (doit être 32 bytes en base64)
        key_bytes = env_key.encode()
    else:
        # Fallback: dériver une clé du hostname (dev uniquement)
        import socket
        hostname = socket.gethostname()
        key_bytes = hostname.encode()

    # Créer une clé Fernet valide (32 bytes base64-encoded)
    key_hash = hashlib.sha256(key_bytes).digest()
    return base64.urlsafe_b64encode(key_hash)


def encrypt(plaintext: str) -> bytes:
    """Chiffre une chaîne de caractères."""
    if not CRYPTO_AVAILABLE:
        # Fallback: encodage simple (pas sécurisé, pour dev)
        return base64.b64encode(plaintext.encode())

    key = _get_encryption_key()
    f = Fernet(key)
    return f.encrypt(plaintext.encode())


def decrypt(ciphertext: bytes) -> Optional[str]:
    """Déchiffre des données."""
    if not ciphertext:
        return None

    if not CRYPTO_AVAILABLE:
        # Fallback: décodage simple
        try:
            return base64.b64decode(ciphertext).decode()
        except Exception:
            return None

    try:
        key = _get_encryption_key()
        f = Fernet(key)
        return f.decrypt(ciphertext).decode()
    except Exception:
        return None


def is_crypto_available() -> bool:
    """Vérifie si le chiffrement est disponible."""
    return CRYPTO_AVAILABLE
