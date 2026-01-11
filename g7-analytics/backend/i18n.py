"""
Internationalisation (i18n) pour G7 Analytics Backend.
Standard: fichiers JSON avec clés hiérarchiques.

Usage:
    from i18n import t

    # Message simple
    t("llm.empty_response")

    # Message avec variables
    t("llm.api_key_missing", provider="Google")
"""
import json
import os
from functools import lru_cache
from typing import Any

# Configuration
LOCALES_DIR = os.path.join(os.path.dirname(__file__), "locales")
DEFAULT_LOCALE = "fr"
FALLBACK_LOCALE = "en"

# Locale courante (peut être changée dynamiquement)
_current_locale = DEFAULT_LOCALE


@lru_cache(maxsize=10)
def _load_locale(locale: str) -> dict[str, Any]:
    """Charge un fichier de locale JSON."""
    filepath = os.path.join(LOCALES_DIR, f"{locale}.json")
    try:
        with open(filepath, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _get_nested(data: dict, key: str) -> str | None:
    """Récupère une valeur imbriquée par clé pointée (ex: 'llm.empty_response')."""
    keys = key.split(".")
    value = data
    for k in keys:
        if isinstance(value, dict) and k in value:
            value = value[k]
        else:
            return None
    return value if isinstance(value, str) else None


def t(key: str, locale: str | None = None, **kwargs: Any) -> str:
    """
    Traduit une clé en message localisé.

    Args:
        key: Clé pointée (ex: "llm.empty_response")
        locale: Locale à utiliser (défaut: locale courante)
        **kwargs: Variables à interpoler dans le message

    Returns:
        Message traduit avec variables interpolées
    """
    locale = locale or _current_locale

    # Essayer la locale demandée
    messages = _load_locale(locale)
    message = _get_nested(messages, key)

    # Fallback sur la locale par défaut
    if message is None and locale != FALLBACK_LOCALE:
        messages = _load_locale(FALLBACK_LOCALE)
        message = _get_nested(messages, key)

    # Si toujours pas trouvé, retourner la clé
    if message is None:
        return key

    # Interpoler les variables
    try:
        return message.format(**kwargs)
    except KeyError:
        return message


def set_locale(locale: str) -> None:
    """Change la locale courante."""
    global _current_locale
    _current_locale = locale


def get_locale() -> str:
    """Retourne la locale courante."""
    return _current_locale


def get_available_locales() -> list[str]:
    """Liste les locales disponibles."""
    locales = []
    for filename in os.listdir(LOCALES_DIR):
        if filename.endswith(".json"):
            locales.append(filename[:-5])
    return sorted(locales)
