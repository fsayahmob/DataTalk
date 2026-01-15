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
from functools import lru_cache
from pathlib import Path
from typing import Any


# Configuration
LOCALES_DIR = Path(__file__).parent / "locales"
DEFAULT_LOCALE = "fr"
FALLBACK_LOCALE = "en"


# Module-level state using a mutable container to avoid global statements
class _LocaleState:
    current: str = DEFAULT_LOCALE


_locale_state = _LocaleState()


@lru_cache(maxsize=10)
def _load_locale(locale: str) -> dict[str, Any]:
    """Charge un fichier de locale JSON."""
    filepath = LOCALES_DIR / f"{locale}.json"
    try:
        with filepath.open(encoding="utf-8") as f:
            result: dict[str, Any] = json.load(f)
            return result
    except FileNotFoundError:
        return {}


def _get_nested(data: dict[str, Any], key: str) -> str | None:
    """Récupère une valeur imbriquée par clé pointée (ex: 'llm.empty_response')."""
    keys = key.split(".")
    value: Any = data
    for k in keys:
        if isinstance(value, dict) and k in value:
            value = value[k]
        else:
            return None
    return value if isinstance(value, str) else None


def t(msg_key: str, locale: str | None = None, **kwargs: Any) -> str:
    """
    Traduit une clé en message localisé.

    Args:
        msg_key: Clé pointée (ex: "llm.empty_response")
        locale: Locale à utiliser (défaut: locale courante)
        **kwargs: Variables à interpoler dans le message (ex: key=value)

    Returns:
        Message traduit avec variables interpolées
    """
    locale = locale or _locale_state.current

    # Essayer la locale demandée
    messages = _load_locale(locale)
    message = _get_nested(messages, msg_key)

    # Fallback sur la locale par défaut
    if message is None and locale != FALLBACK_LOCALE:
        messages = _load_locale(FALLBACK_LOCALE)
        message = _get_nested(messages, msg_key)

    # Si toujours pas trouvé, retourner la clé
    if message is None:
        return msg_key

    # Interpoler les variables
    try:
        return message.format(**kwargs)
    except KeyError:
        return message


def set_locale(locale: str) -> None:
    """Change la locale courante."""
    _locale_state.current = locale


def get_locale() -> str:
    """Retourne la locale courante."""
    return _locale_state.current


def get_available_locales() -> list[str]:
    """Liste les locales disponibles."""
    return sorted([f.stem for f in LOCALES_DIR.iterdir() if f.suffix == ".json"])
