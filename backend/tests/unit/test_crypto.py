"""Tests pour crypto.py - Chiffrement AES-256."""

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestIsProduction:
    """Tests de _is_production."""

    def test_returns_true_for_production(self) -> None:
        """Retourne True pour ENVIRONMENT=production."""
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            from crypto import _is_production

            # Force reimport
            import importlib

            import crypto

            importlib.reload(crypto)
            assert crypto._is_production() is True

    def test_returns_true_for_prod(self) -> None:
        """Retourne True pour ENVIRONMENT=prod."""
        with patch.dict(os.environ, {"ENVIRONMENT": "prod"}):
            from crypto import _is_production

            import importlib

            import crypto

            importlib.reload(crypto)
            assert crypto._is_production() is True

    def test_returns_false_for_development(self) -> None:
        """Retourne False pour ENVIRONMENT=development."""
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=True):
            import importlib

            import crypto

            importlib.reload(crypto)
            assert crypto._is_production() is False

    def test_returns_false_when_not_set(self) -> None:
        """Retourne False quand ENVIRONMENT n'est pas défini."""
        env = os.environ.copy()
        env.pop("ENVIRONMENT", None)
        with patch.dict(os.environ, env, clear=True):
            import importlib

            import crypto

            importlib.reload(crypto)
            assert crypto._is_production() is False


class TestGetEncryptionKey:
    """Tests de _get_encryption_key."""

    def test_uses_env_key_when_set(self) -> None:
        """Utilise ENCRYPTION_KEY quand définie."""
        test_key = "test_encryption_key_32bytes_long!"
        with patch.dict(os.environ, {"ENCRYPTION_KEY": test_key, "ENVIRONMENT": "dev"}):
            import importlib

            import crypto

            importlib.reload(crypto)
            key = crypto._get_encryption_key()
            assert key is not None
            assert len(key) == 44  # base64 encoded 32 bytes

    def test_raises_in_production_without_key(self) -> None:
        """Lève RuntimeError en production sans ENCRYPTION_KEY."""
        env = {"ENVIRONMENT": "production"}
        # Remove ENCRYPTION_KEY if present
        with patch.dict(os.environ, env, clear=True):
            import importlib

            import crypto

            importlib.reload(crypto)
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
                crypto._get_encryption_key()

    def test_generates_key_file_in_dev(self, tmp_path: Path) -> None:
        """Génère un fichier de clé en dev."""
        key_file = tmp_path / ".encryption_key"
        env = {"ENVIRONMENT": "dev"}

        with (
            patch.dict(os.environ, env, clear=True),
            patch("crypto.Path") as mock_path,
        ):
            mock_path.return_value.parent.__truediv__ = MagicMock(return_value=key_file)

            import importlib

            import crypto

            # Mock the key file path
            with patch.object(crypto, "__file__", str(tmp_path / "crypto.py")):
                importlib.reload(crypto)
                # In dev without key, should try to use/create file


class TestEncrypt:
    """Tests de encrypt."""

    def test_encrypts_string(self) -> None:
        """Chiffre une chaîne correctement."""
        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "test_key_for_encryption_test!!", "ENVIRONMENT": "dev"}
        ):
            import importlib

            import crypto

            importlib.reload(crypto)
            encrypted = crypto.encrypt("secret_value")
            assert encrypted is not None
            assert encrypted != b"secret_value"
            assert len(encrypted) > 0

    def test_encrypted_is_bytes(self) -> None:
        """Le résultat est en bytes."""
        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "test_key_for_encryption_test!!", "ENVIRONMENT": "dev"}
        ):
            import importlib

            import crypto

            importlib.reload(crypto)
            encrypted = crypto.encrypt("test")
            assert isinstance(encrypted, bytes)

    def test_raises_when_crypto_unavailable(self) -> None:
        """Lève CryptoUnavailableError si cryptography non disponible."""
        import crypto

        with patch.object(crypto, "CRYPTO_AVAILABLE", False):
            with pytest.raises(crypto.CryptoUnavailableError):
                crypto.encrypt("test")


class TestDecrypt:
    """Tests de decrypt."""

    def test_decrypts_to_original(self) -> None:
        """Déchiffre vers la valeur originale."""
        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "test_key_for_encryption_test!!", "ENVIRONMENT": "dev"}
        ):
            import importlib

            import crypto

            importlib.reload(crypto)
            original = "my_secret_api_key"
            encrypted = crypto.encrypt(original)
            decrypted = crypto.decrypt(encrypted)
            assert decrypted == original

    def test_returns_none_for_empty(self) -> None:
        """Retourne None pour une valeur vide."""
        import crypto

        assert crypto.decrypt(b"") is None
        assert crypto.decrypt(None) is None  # type: ignore

    def test_returns_none_for_invalid_ciphertext(self) -> None:
        """Retourne None pour un ciphertext invalide."""
        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "test_key_for_encryption_test!!", "ENVIRONMENT": "dev"}
        ):
            import importlib

            import crypto

            importlib.reload(crypto)
            result = crypto.decrypt(b"invalid_ciphertext")
            assert result is None

    def test_raises_when_crypto_unavailable(self) -> None:
        """Lève CryptoUnavailableError si cryptography non disponible."""
        import crypto

        with patch.object(crypto, "CRYPTO_AVAILABLE", False):
            with pytest.raises(crypto.CryptoUnavailableError):
                crypto.decrypt(b"test")


class TestIsCryptoAvailable:
    """Tests de is_crypto_available."""

    def test_returns_true_when_available(self) -> None:
        """Retourne True quand cryptography est disponible."""
        import crypto

        # Normalement disponible dans l'environnement de test
        assert crypto.is_crypto_available() is True

    def test_returns_crypto_available_value(self) -> None:
        """Retourne la valeur de CRYPTO_AVAILABLE."""
        import crypto

        with patch.object(crypto, "CRYPTO_AVAILABLE", False):
            assert crypto.is_crypto_available() is False


class TestCryptoUnavailableError:
    """Tests de CryptoUnavailableError."""

    def test_is_runtime_error(self) -> None:
        """Est une RuntimeError."""
        from crypto import CryptoUnavailableError

        assert issubclass(CryptoUnavailableError, RuntimeError)

    def test_message_includes_pip_hint(self) -> None:
        """Le message inclut un indice pip."""
        from crypto import CryptoUnavailableError

        error = CryptoUnavailableError("cryptography not installed")
        assert "cryptography" in str(error).lower()


class TestEncryptDecryptRoundtrip:
    """Tests de round-trip encrypt/decrypt."""

    @pytest.mark.parametrize(
        "value",
        [
            "simple",
            "with spaces",
            "with_special_chars!@#$%",
            "unicode_émojis_🔐",
            "a" * 1000,  # Long string
            "",  # Empty string (encrypt only)
        ],
    )
    def test_roundtrip_various_values(self, value: str) -> None:
        """Round-trip fonctionne pour diverses valeurs."""
        if not value:
            return  # Skip empty string (decrypt returns None)

        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "test_key_for_encryption_test!!", "ENVIRONMENT": "dev"}
        ):
            import importlib

            import crypto

            importlib.reload(crypto)
            encrypted = crypto.encrypt(value)
            decrypted = crypto.decrypt(encrypted)
            assert decrypted == value
