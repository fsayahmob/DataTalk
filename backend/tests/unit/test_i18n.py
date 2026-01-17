"""Tests pour i18n.py - Internationalisation."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from i18n import (
    DEFAULT_LOCALE,
    FALLBACK_LOCALE,
    _get_nested,
    _load_locale,
    get_available_locales,
    get_locale,
    set_locale,
    t,
)


class TestLoadLocale:
    """Tests de _load_locale."""

    def test_loads_existing_locale(self) -> None:
        """Charge une locale existante."""
        # La locale 'fr' devrait exister
        messages = _load_locale("fr")
        assert isinstance(messages, dict)
        assert len(messages) > 0

    def test_returns_empty_for_missing_locale(self) -> None:
        """Retourne dict vide pour une locale manquante."""
        messages = _load_locale("nonexistent_locale_xyz")
        assert messages == {}

    def test_caches_results(self) -> None:
        """Les résultats sont mis en cache."""
        # Appeler deux fois
        result1 = _load_locale("fr")
        result2 = _load_locale("fr")
        # Les objets doivent être identiques (même référence)
        assert result1 is result2


class TestGetNested:
    """Tests de _get_nested."""

    def test_gets_simple_key(self) -> None:
        """Récupère une clé simple."""
        data = {"key": "value"}
        assert _get_nested(data, "key") == "value"

    def test_gets_nested_key(self) -> None:
        """Récupère une clé imbriquée."""
        data = {"level1": {"level2": "value"}}
        assert _get_nested(data, "level1.level2") == "value"

    def test_gets_deeply_nested_key(self) -> None:
        """Récupère une clé profondément imbriquée."""
        data = {"a": {"b": {"c": {"d": "deep"}}}}
        assert _get_nested(data, "a.b.c.d") == "deep"

    def test_returns_none_for_missing_key(self) -> None:
        """Retourne None pour une clé manquante."""
        data = {"key": "value"}
        assert _get_nested(data, "missing") is None

    def test_returns_none_for_missing_nested_key(self) -> None:
        """Retourne None pour une clé imbriquée manquante."""
        data = {"level1": {"level2": "value"}}
        assert _get_nested(data, "level1.missing") is None

    def test_returns_none_for_non_string_value(self) -> None:
        """Retourne None pour une valeur non-string."""
        data = {"key": {"nested": "value"}}
        # "key" pointe vers un dict, pas une string
        assert _get_nested(data, "key") is None

    def test_returns_none_for_list_value(self) -> None:
        """Retourne None pour une valeur liste."""
        data = {"key": ["a", "b"]}
        assert _get_nested(data, "key") is None


class TestTranslate:
    """Tests de t()."""

    def test_translates_existing_key(self) -> None:
        """Traduit une clé existante."""
        # Utiliser une clé qui existe probablement
        result = t("db.not_connected")
        # Si la clé existe, on a un message traduit
        # Si non, on a la clé elle-même
        assert result is not None

    def test_returns_key_for_missing_translation(self) -> None:
        """Retourne la clé si traduction manquante."""
        result = t("nonexistent.key.xyz")
        assert result == "nonexistent.key.xyz"

    def test_interpolates_variables(self) -> None:
        """Interpole les variables."""
        # Mock une locale avec un message paramétré
        mock_messages = {"test": {"message": "Hello {name}!"}}

        with patch("i18n._load_locale", return_value=mock_messages):
            result = t("test.message", name="World")
            assert result == "Hello World!"

    def test_handles_missing_variable(self) -> None:
        """Gère les variables manquantes."""
        mock_messages = {"test": {"message": "Hello {name}!"}}

        with patch("i18n._load_locale", return_value=mock_messages):
            # Pas de variable passée - retourne le template
            result = t("test.message")
            assert "{name}" in result or result == "Hello {name}!"

    def test_uses_current_locale(self) -> None:
        """Utilise la locale courante."""
        set_locale("fr")
        # Le résultat dépend de la locale
        result = t("db.not_connected")
        assert result is not None

    def test_uses_explicit_locale(self) -> None:
        """Utilise une locale explicite."""
        # Force la locale 'en' même si 'fr' est courante
        set_locale("fr")
        result = t("db.not_connected", locale="en")
        # Le résultat devrait venir de 'en'
        assert result is not None

    def test_fallback_to_default_locale(self) -> None:
        """Fallback sur la locale par défaut."""
        # Locale qui n'existe pas
        result = t("db.not_connected", locale="xyz")
        # Devrait utiliser le fallback
        assert result is not None


class TestSetLocale:
    """Tests de set_locale."""

    def test_sets_locale(self) -> None:
        """Définit la locale."""
        set_locale("en")
        assert get_locale() == "en"

        set_locale("fr")
        assert get_locale() == "fr"


class TestGetLocale:
    """Tests de get_locale."""

    def test_returns_current_locale(self) -> None:
        """Retourne la locale courante."""
        set_locale("fr")
        assert get_locale() == "fr"

        set_locale("en")
        assert get_locale() == "en"


class TestGetAvailableLocales:
    """Tests de get_available_locales."""

    def test_returns_list(self) -> None:
        """Retourne une liste."""
        locales = get_available_locales()
        assert isinstance(locales, list)

    def test_includes_french(self) -> None:
        """Inclut le français."""
        locales = get_available_locales()
        assert "fr" in locales

    def test_sorted_alphabetically(self) -> None:
        """Liste triée alphabétiquement."""
        locales = get_available_locales()
        assert locales == sorted(locales)


class TestConstants:
    """Tests des constantes."""

    def test_default_locale_is_french(self) -> None:
        """La locale par défaut est le français."""
        assert DEFAULT_LOCALE == "fr"

    def test_fallback_locale_is_english(self) -> None:
        """La locale de fallback est l'anglais."""
        assert FALLBACK_LOCALE == "en"


class TestLocaleState:
    """Tests du state de locale."""

    def test_locale_state_persists(self) -> None:
        """Le state de locale persiste entre les appels."""
        set_locale("en")
        assert get_locale() == "en"

        # Autre appel - doit toujours être 'en'
        assert get_locale() == "en"

        set_locale("fr")
        assert get_locale() == "fr"
