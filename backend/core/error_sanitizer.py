"""
Sanitization des erreurs pour réponses API.

Évite d'exposer des informations sensibles (chemins fichiers, noms de tables internes)
dans les messages d'erreur retournés aux clients.
"""

import logging
import re

logger = logging.getLogger(__name__)

# Patterns d'erreurs DuckDB/SQL communes
ERROR_PATTERNS: dict[str, str] = {
    r"table .* does not exist": "db.table_not_found",
    r"table .* not found": "db.table_not_found",
    r"column .* not found": "db.column_not_found",
    r"column .* does not exist": "db.column_not_found",
    r"catalog error": "db.catalog_error",
    r"parser error": "db.syntax_error",
    r"syntax error": "db.syntax_error",
    r"binder error": "db.binding_error",
    r"constraint": "db.constraint_violated",
    r"permission denied": "db.permission_denied",
    r"timeout": "db.query_timeout",
    r"connection": "db.connection_error",
    r"out of memory": "db.out_of_memory",
    r"division by zero": "db.division_by_zero",
    r"invalid input": "db.invalid_input",
}


def sanitize_sql_error(error: Exception, log_full: bool = True) -> str:
    """
    Convertit une erreur SQL en clé i18n safe pour le frontend.

    Args:
        error: Exception SQL brute
        log_full: Si True, log l'erreur complète (pour debug côté serveur)

    Returns:
        Clé i18n (ex: "db.table_not_found") ou "db.query_error" par défaut
    """
    error_str = str(error).lower()

    # Logger l'erreur complète pour debug (jamais envoyée au client)
    if log_full:
        logger.error("SQL error (full): %s", error)

    # Chercher un pattern connu
    for pattern, i18n_key in ERROR_PATTERNS.items():
        if re.search(pattern, error_str, re.IGNORECASE):
            return i18n_key

    # Fallback générique
    return "db.query_error"


def sanitize_error_message(error: Exception, context: str = "operation") -> str:
    """
    Sanitize un message d'erreur générique pour le frontend.

    Supprime:
    - Chemins de fichiers
    - Informations de stack trace
    - Noms de tables/colonnes internes

    Args:
        error: Exception brute
        context: Contexte pour le log

    Returns:
        Message d'erreur générique safe
    """
    error_str = str(error)

    # Logger l'erreur complète
    logger.error("Error in %s: %s", context, error)

    # Patterns à supprimer
    path_pattern = r"(/[a-zA-Z0-9_\-./]+)+\.(\w+)"  # Chemins fichiers
    line_pattern = r"line \d+"  # Numéros de ligne
    at_pattern = r"at 0x[0-9a-f]+"  # Adresses mémoire

    sanitized = error_str
    sanitized = re.sub(path_pattern, "[path]", sanitized)
    sanitized = re.sub(line_pattern, "[line]", sanitized)
    sanitized = re.sub(at_pattern, "[addr]", sanitized)

    # Limiter la longueur
    if len(sanitized) > 200:
        sanitized = sanitized[:200] + "..."

    return sanitized
