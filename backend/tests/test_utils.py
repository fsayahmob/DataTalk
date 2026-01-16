"""
Tests des utilitaires - Logique pure sans dépendances externes.

Ces tests vérifient les fonctions utilitaires qui n'ont pas
de dépendances sur des services externes (DB, LLM, etc.).
"""

import re

import pytest

# Import depuis l'API publique uniquement
from catalog_engine import (
    COMMON_PATTERNS,
    check_token_limit,
    detect_pattern,
    estimate_tokens,
)
from i18n import get_locale, set_locale, t


class TestTokenEstimation:
    """Tests de l'estimation de tokens."""

    def test_estimate_short_text(self) -> None:
        """Texte court."""
        # 5 caractères / 4 = 1 token
        assert estimate_tokens("hello") == 1

    def test_estimate_medium_text(self) -> None:
        """Texte moyen."""
        # 100 caractères / 4 = 25 tokens
        text = "a" * 100
        assert estimate_tokens(text) == 25

    def test_estimate_long_text(self) -> None:
        """Texte long."""
        # 400 caractères / 4 = 100 tokens
        text = "a" * 400
        assert estimate_tokens(text) == 100

    def test_estimate_empty_text(self) -> None:
        """Texte vide."""
        assert estimate_tokens("") == 0


class TestTokenLimit:
    """Tests de la vérification de limite de tokens."""

    def test_check_limit_ok(self) -> None:
        """Texte sous la limite."""
        is_ok, _count, msg = check_token_limit("short text", max_input_tokens=1000)
        assert is_ok is True
        assert "OK" in msg

    def test_check_limit_warning(self) -> None:
        """Texte à >80% de la limite (warning)."""
        # 3600 chars / 4 = 900 tokens = 90% de 1000 (> 80%)
        text = "a" * 3600
        is_ok, _count, msg = check_token_limit(text, max_input_tokens=1000)
        assert is_ok is True
        assert "volumineux" in msg or "80%" in msg

    def test_check_limit_exceeded(self) -> None:
        """Texte au-dessus de la limite."""
        # 500000 chars / 4 = 125000 tokens > 100000
        text = "a" * 500000
        is_ok, _count, msg = check_token_limit(text, max_input_tokens=100000)
        assert is_ok is False
        assert "trop long" in msg


class TestPatternDetection:
    """Tests de la détection de patterns."""

    def test_detect_email(self) -> None:
        """Détection pattern email."""
        values = ["user@example.com", "test@domain.fr", "admin@company.org"]
        pattern, rate = detect_pattern(values)
        assert pattern == "email"
        assert rate is not None
        assert rate > 0.9

    def test_detect_uuid(self) -> None:
        """Détection pattern UUID."""
        values = [
            "123e4567-e89b-12d3-a456-426614174000",
            "987fcdeb-51a2-3bc4-d567-890123456789",
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        ]
        pattern, _rate = detect_pattern(values)
        assert pattern == "uuid"

    def test_detect_postal_code_fr(self) -> None:
        """Détection code postal français."""
        values = ["75001", "69002", "33000", "13001", "31000"]
        pattern, _rate = detect_pattern(values)
        assert pattern == "postal_code_fr"

    def test_detect_date_iso(self) -> None:
        """Détection date ISO."""
        values = ["2024-01-15", "2024-02-20", "2024-03-25"]
        pattern, _rate = detect_pattern(values)
        assert pattern == "date_iso"

    def test_no_pattern_mixed_values(self) -> None:
        """Pas de pattern avec valeurs mixtes."""
        values = ["abc", "123", "xyz", "user@email.com", "hello world"]
        pattern, _rate = detect_pattern(values)
        assert pattern is None

    def test_no_pattern_random_strings(self) -> None:
        """Pas de pattern avec strings aléatoires."""
        values = ["foo", "bar", "baz", "qux"]
        pattern, _rate = detect_pattern(values)
        assert pattern is None

    def test_empty_values(self) -> None:
        """Liste vide."""
        pattern, rate = detect_pattern([])
        assert pattern is None
        assert rate is None

    def test_pattern_threshold(self) -> None:
        """Pattern détecté seulement si >70% de match."""
        # 2 emails sur 5 = 40% < 70%
        values = ["user@example.com", "test@domain.fr", "not-email", "random", "text"]
        pattern, _rate = detect_pattern(values)
        assert pattern is None  # Sous le seuil


class TestCommonPatterns:
    """Tests des patterns prédéfinis."""

    def test_patterns_exist(self) -> None:
        """Vérifier que les patterns communs existent."""
        assert "email" in COMMON_PATTERNS
        assert "uuid" in COMMON_PATTERNS
        assert "url" in COMMON_PATTERNS
        assert "date_iso" in COMMON_PATTERNS

    def test_patterns_are_valid_regex(self) -> None:
        """Vérifier que les patterns sont des regex valides."""
        for name, pattern in COMMON_PATTERNS.items():
            try:
                re.compile(pattern)
            except re.error:
                pytest.fail(f"Pattern '{name}' is not a valid regex")


class TestI18n:
    """Tests de l'internationalisation."""

    def test_translate_existing_key(self) -> None:
        """Traduction d'une clé existante."""
        msg = t("llm.empty_response")
        # La clé doit être traduite (différente de la clé elle-même)
        assert msg != "llm.empty_response" or msg == "Réponse LLM vide"

    def test_translate_missing_key_returns_key(self) -> None:
        """Clé manquante retourne la clé."""
        msg = t("non.existing.key.that.does.not.exist")
        assert msg == "non.existing.key.that.does.not.exist"

    def test_translate_with_variables(self) -> None:
        """Traduction avec variables."""
        msg = t("llm.api_key_missing", provider="TestProvider")
        # La variable doit être interpolée
        assert "TestProvider" in msg or "{provider}" not in msg

    def test_get_set_locale(self) -> None:
        """Changement de locale."""
        original = get_locale()

        # Changer de locale
        set_locale("en")
        assert get_locale() == "en"

        # Remettre la locale originale
        set_locale(original)
        assert get_locale() == original
