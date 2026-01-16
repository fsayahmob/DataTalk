"""
Utilitaires pour les appels LLM.

- parse_llm_json: Parser JSON centralisé avec nettoyage markdown
- call_with_retry: Wrapper de retry avec tenacity
- Exceptions personnalisées
"""

import json
from collections.abc import Callable
from typing import Any, TypeVar

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
)


# =============================================================================
# EXCEPTIONS PERSONNALISÉES
# =============================================================================


class LLMGenerationError(Exception):
    """Erreur lors d'un appel LLM (après tous les retries)."""


class QuestionGenerationError(LLMGenerationError):
    """Erreur lors de la génération des questions."""


class KpiGenerationError(LLMGenerationError):
    """Erreur lors de la génération des KPIs."""


class EnrichmentError(LLMGenerationError):
    """Erreur lors de l'enrichissement du catalogue."""


class LLMJsonParseError(LLMGenerationError):
    """Erreur lors du parsing JSON d'une réponse LLM."""


# =============================================================================
# JSON PARSER CENTRALISÉ
# =============================================================================


def parse_llm_json(content: str, context: str = "LLM") -> dict[str, Any]:
    """
    Parse une réponse JSON depuis un LLM avec nettoyage automatique.

    Gère les cas courants:
    - Balises markdown ```json ... ```
    - Texte avant/après le JSON
    - Espaces et retours à la ligne

    Args:
        content: Contenu brut de la réponse LLM
        context: Contexte pour les messages d'erreur (ex: "questions", "KPIs")

    Returns:
        Dict parsé depuis le JSON

    Raises:
        LLMJsonParseError: Si le contenu est vide ou invalide
    """
    if not content:
        raise LLMJsonParseError(f"Réponse {context} vide")

    cleaned = content.strip()

    # Enlever les balises markdown ```json ou ```
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Enlever la première ligne (```json ou ```)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Enlever la dernière ligne si c'est ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    # Trouver le JSON dans le contenu (chercher { ou [)
    json_start = -1
    json_char = None

    for i, char in enumerate(cleaned):
        if char in "{[":
            json_start = i
            json_char = char
            break

    if json_start == -1 or json_char is None:
        raise LLMJsonParseError(
            f"Réponse {context} ne contient pas de JSON valide: {cleaned[:100]}..."
        )

    # Extraire depuis le début du JSON
    json_content = cleaned[json_start:]

    # Trouver la fin du JSON (bracket matching)
    bracket_map: dict[str, str] = {"{": "}", "[": "]"}
    closing_char = bracket_map[json_char]
    depth = 0
    json_end = -1

    for i, char in enumerate(json_content):
        if char == json_char:
            depth += 1
        elif char == closing_char:
            depth -= 1
            if depth == 0:
                json_end = i + 1
                break

    if json_end > 0:
        json_content = json_content[:json_end]

    # Parser le JSON
    try:
        return json.loads(json_content)
    except json.JSONDecodeError as e:
        raise LLMJsonParseError(
            f"JSON {context} invalide: {e}. Contenu: {json_content[:200]}..."
        ) from e


def extract_json_from_llm(content: str, key: str | None = None, context: str = "LLM") -> Any:
    """
    Extrait une valeur spécifique d'une réponse JSON LLM.

    Args:
        content: Contenu brut de la réponse LLM
        key: Clé à extraire (None = retourner tout le dict)
        context: Contexte pour les messages d'erreur

    Returns:
        La valeur extraite ou le dict complet

    Raises:
        LLMJsonParseError: Si parsing échoue ou clé manquante
    """
    data = parse_llm_json(content, context)

    if key is None:
        return data

    if key not in data:
        raise LLMJsonParseError(
            f"Clé '{key}' manquante dans la réponse {context}. Clés disponibles: {list(data.keys())}"
        )

    return data[key]


# =============================================================================
# RETRY AVEC TENACITY
# =============================================================================

T = TypeVar("T")


def call_with_retry(
    call_fn: Callable[[], T],
    max_retries: int = 2,
    error_class: type[LLMGenerationError] = LLMGenerationError,
    context: str = "LLM",
    validate_fn: Callable[[T], bool] | None = None,
) -> T:
    """
    Appelle une fonction avec retry et validation.

    Utilise tenacity pour la gestion des retries avec backoff exponentiel.

    Args:
        call_fn: Fonction sans argument qui fait l'appel et retourne le résultat
        max_retries: Nombre de tentatives supplémentaires après le premier échec
        error_class: Classe d'exception à lever en cas d'échec final
        context: Nom du contexte pour les logs
        validate_fn: Fonction de validation optionnelle (doit retourner True si valide)

    Returns:
        Le résultat de call_fn si succès

    Raises:
        error_class: Si toutes les tentatives échouent ou validation échoue
    """
    last_error: Exception | None = None

    @retry(
        stop=stop_after_attempt(max_retries + 1),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=False,  # On gère nous-mêmes les exceptions
    )
    def _attempt():
        nonlocal last_error
        try:
            result = call_fn()

            # Vérifier que le résultat n'est pas None ou vide
            if result is None:
                raise error_class(f"Réponse {context} vide (None)")

            # Validation personnalisée si fournie
            if validate_fn and not validate_fn(result):
                raise error_class(f"Validation {context} échouée")

            return result

        except error_class:
            raise  # Re-lever les erreurs déjà typées
        except Exception as e:
            last_error = e
            print(f"    [WARN] {context}: {e}")
            raise

    try:
        return _attempt()
    except Exception as e:
        # Convertir en error_class si ce n'en est pas déjà une
        if isinstance(e, error_class):
            raise
        raise error_class(
            f"Échec {context} après {max_retries + 1} tentatives: {last_error or e}"
        ) from e
