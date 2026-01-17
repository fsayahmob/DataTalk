"""
Chiffrement AES-256 pour les secrets (clés API).
Utilise la bibliothèque cryptography.
"""

import base64
import hashlib
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet

    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


def _is_production() -> bool:
    """Détecte si on est en environnement de production."""
    env = os.getenv("ENVIRONMENT", "").lower()
    return env in ("production", "prod")


def _get_encryption_key() -> bytes:
    """
    Récupère la clé de chiffrement.

    En production (ENVIRONMENT=production):
        - ENCRYPTION_KEY DOIT être définie
        - Erreur fatale si absente

    En développement:
        - Utilise ENCRYPTION_KEY si définie
        - Sinon génère/charge une clé locale (.encryption_key)
    """
    env_key = os.getenv("ENCRYPTION_KEY")

    if env_key:
        # Utiliser la clé fournie (doit être 32 bytes en base64)
        key_bytes = env_key.encode()
    elif _is_production():
        # Production sans clé = erreur fatale
        logger.critical("ENCRYPTION_KEY must be set in production environment!")
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is required in production. "
            "Generate one with: python -c \"import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""
        )
    else:
        # Dev only: générer/charger une clé persistée localement
        key_file = Path(__file__).parent / ".encryption_key"
        if key_file.exists():
            key_bytes = key_file.read_bytes()
        else:
            # Générer une clé aléatoire unique pour cette installation
            key_bytes = os.urandom(32)
            key_file.write_bytes(key_bytes)
            # Sécuriser les permissions (lecture/écriture owner only)
            key_file.chmod(0o600)
            logger.warning("ENCRYPTION_KEY not set. Generated random key for dev.")

    # Créer une clé Fernet valide (32 bytes base64-encoded)
    key_hash = hashlib.sha256(key_bytes).digest()
    return base64.urlsafe_b64encode(key_hash)


class CryptoUnavailableError(RuntimeError):
    """Raised when cryptography library is not available."""


def encrypt(plaintext: str) -> bytes:
    """Chiffre une chaîne de caractères avec AES-256 (Fernet)."""
    if not CRYPTO_AVAILABLE:
        raise CryptoUnavailableError(
            "cryptography library not installed. Run: pip install cryptography"
        )

    key = _get_encryption_key()
    f = Fernet(key)
    encrypted: bytes = f.encrypt(plaintext.encode())
    return encrypted


def decrypt(ciphertext: bytes) -> str | None:
    """Déchiffre des données chiffrées avec encrypt()."""
    if not ciphertext:
        return None

    if not CRYPTO_AVAILABLE:
        raise CryptoUnavailableError(
            "cryptography library not installed. Run: pip install cryptography"
        )

    try:
        key = _get_encryption_key()
        f = Fernet(key)
        decrypted: bytes = f.decrypt(ciphertext)
        return decrypted.decode()
    except (ValueError, TypeError):
        # Données corrompues ou format invalide
        return None
    except Exception:  # noqa: BLE001
        # Fernet peut lever diverses exceptions (InvalidToken, etc.)
        # Retourner None pour ne pas exposer les détails crypto
        logger.debug("Decryption failed - invalid token or corrupted data")
        return None


def is_crypto_available() -> bool:
    """Vérifie si le chiffrement est disponible."""
    return CRYPTO_AVAILABLE
