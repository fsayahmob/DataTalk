"""
Constantes globales du backend.

Centralise les magic numbers pour documentation et configuration.
Chaque constante est documentée avec son usage et sa valeur par défaut.
"""


class CircuitBreakerConfig:
    """Configuration du circuit breaker LLM."""

    FAILURE_THRESHOLD = 5
    """Nombre d'échecs avant ouverture du circuit."""

    COOLDOWN_SECONDS = 60
    """Temps en secondes avant passage en HALF_OPEN."""

    HALF_OPEN_MAX_CALLS = 1
    """Nombre d'appels test en HALF_OPEN."""

    TRANSIENT_THRESHOLD = 3
    """Erreurs transientes comptent comme 1 failure permanente."""

    TRANSIENT_WINDOW_SECONDS = 300
    """Fenêtre glissante pour erreurs transientes (5 min)."""


class LLMConfig:
    """Configuration des appels LLM."""

    DEFAULT_TEMPERATURE = 0.0
    """Température par défaut (déterministe)."""

    DEFAULT_MAX_TOKENS = 4096
    """Nombre max de tokens en sortie par défaut."""

    MAX_INPUT_TOKENS = 100_000
    """Limite max de tokens en entrée."""

    DEFAULT_TIMEOUT_MS = 60_000
    """Timeout par défaut pour les appels LLM (60s)."""


class CatalogConfig:
    """Configuration du moteur de catalogue."""

    DEFAULT_MAX_TABLES_PER_BATCH = 15
    """Nombre max de tables par batch d'enrichissement LLM."""

    MAX_SAMPLE_VALUES = 10
    """Nombre max de valeurs d'exemple par colonne."""

    MAX_VALUE_FREQUENCIES = 20
    """Nombre max de valeurs distinctes pour fréquences."""


class QueryConfig:
    """Configuration de l'exécution des requêtes."""

    DEFAULT_TIMEOUT_MS = 30_000
    """Timeout par défaut pour les requêtes SQL (30s)."""

    MAX_CHART_ROWS = 5_000
    """Nombre max de lignes pour afficher un graphique."""


class PaginationConfig:
    """Configuration de la pagination."""

    DEFAULT_LIMIT = 20
    """Limite par défaut pour les listes."""

    MAX_LIMIT = 100
    """Limite maximale autorisée."""


class StorageConfig:
    """Configuration du stockage."""

    MAX_DATA_ROWS_STORED = 100
    """Nombre max de lignes de données stockées par message."""
