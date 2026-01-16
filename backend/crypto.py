"""
Chiffrement AES-256 pour les secrets (clés API).
Utilise la bibliothèque cryptography.
"""

import base64
import hashlib
import os
import sys
from pathlib import Path

try:
    from cryptography.fernet import Fernet

    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


def _get_encryption_key() -> bytes:
    """
    Récupère la clé de chiffrement.
    ENCRYPTION_KEY doit être définie en production.
    En dev, une clé aléatoire est générée et persistée dans un fichier local.
    """
    env_key = os.getenv("ENCRYPTION_KEY")

    if env_key:
        # Utiliser la clé fournie (doit être 32 bytes en base64)
        key_bytes = env_key.encode()
    else:
        # Dev only: générer/charger une clé persistée localement
        key_file = Path(__file__).parent / ".encryption_key"
        if key_file.exists():
            key_bytes = key_file.read_bytes()
        else:
            # Générer une clé aléatoire unique pour cette installation
            key_bytes = os.urandom(32)
            key_file.write_bytes(key_bytes)
            # Avertissement en dev
            print(
                "WARNING: ENCRYPTION_KEY not set. Generated random key for dev.",
                file=sys.stderr,
            )

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
    encrypted: bytes = f.encrypt(plaintext.encode())
    return encrypted


def decrypt(ciphertext: bytes) -> str | None:
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
        decrypted: bytes = f.decrypt(ciphertext)
        return decrypted.decode()
    except Exception:
        return None


def is_crypto_available() -> bool:
    """Vérifie si le chiffrement est disponible."""
    return CRYPTO_AVAILABLE
