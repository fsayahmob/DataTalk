"""
État applicatif global pour G7 Analytics.

Contient:
- _AppState: Singleton thread-safe pour les connexions DuckDB et le cache
- get_duckdb_path: Résolution du chemin DuckDB
- get_system_instruction: Génération du prompt système LLM
"""

import logging
import threading
from pathlib import Path

import duckdb

logger = logging.getLogger(__name__)

from catalog import get_schema_for_llm, get_setting
from llm_config import get_active_prompt

# Configuration par défaut (fallback si settings non initialisé)
DEFAULT_DB_PATH = str(Path(__file__).parent.parent / ".." / "data" / "g7_analytics.duckdb")


class _AppState:
    """
    État global thread-safe de l'application.

    Utilise un RLock pour permettre les appels ré-entrants
    (ex: get_connection() appelé depuis set_connection()).
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._db_connection: duckdb.DuckDBPyConnection | None = None
        self._db_schema_cache: str | None = None
        self._current_db_path: str | None = None

    @property
    def db_connection(self) -> duckdb.DuckDBPyConnection | None:
        with self._lock:
            return self._db_connection

    @db_connection.setter
    def db_connection(self, conn: duckdb.DuckDBPyConnection | None) -> None:
        with self._lock:
            # Fermer l'ancienne connexion si elle existe
            if self._db_connection is not None:
                try:
                    self._db_connection.close()
                except duckdb.Error:
                    # Connexion déjà fermée ou invalide - normal en shutdown
                    pass
            self._db_connection = conn
            # Invalider le cache schéma (nouvelle connexion = potentiel nouveau schéma)
            self._db_schema_cache = None
            logger.debug("Schema cache invalidated (connection changed)")

    @property
    def db_schema_cache(self) -> str | None:
        with self._lock:
            return self._db_schema_cache

    @db_schema_cache.setter
    def db_schema_cache(self, schema: str | None) -> None:
        with self._lock:
            self._db_schema_cache = schema

    @property
    def current_db_path(self) -> str | None:
        with self._lock:
            return self._current_db_path

    @current_db_path.setter
    def current_db_path(self, path: str | None) -> None:
        with self._lock:
            # Invalider le cache si le path change
            if self._current_db_path != path:
                self._db_schema_cache = None
                logger.debug("Schema cache invalidated (path changed to %s)", path)
            self._current_db_path = path

    def invalidate_cache(self) -> None:
        """Invalide le cache schéma (après changement de datasource)."""
        with self._lock:
            self._db_schema_cache = None


# Instance singleton
app_state = _AppState()


def get_duckdb_path() -> str:
    """Récupère le chemin DuckDB depuis les settings ou utilise le défaut."""
    path = get_setting("duckdb_path")
    if path:
        # Si chemin relatif, le résoudre par rapport au dossier backend
        if not Path(path).is_absolute():
            path = str(Path(__file__).parent.parent / ".." / path)
        return str(Path(path).resolve())
    return DEFAULT_DB_PATH


class PromptNotConfiguredError(Exception):
    """Erreur levée quand un prompt n'est pas configuré en base."""

    def __init__(self, prompt_key: str):
        self.prompt_key = prompt_key
        super().__init__(f"Prompt '{prompt_key}' non configuré. Exécutez: python seed_prompts.py")


def get_system_instruction() -> str:
    """Génère les instructions système pour le LLM.

    Charge le prompt depuis la base de données (llm_prompts).
    Lève PromptNotConfiguredError si non trouvé.
    """
    if app_state.db_schema_cache is None:
        app_state.db_schema_cache = get_schema_for_llm()

    # Récupérer le prompt actif depuis la DB
    prompt_data = get_active_prompt("analytics_system")

    if not prompt_data or not prompt_data.get("content"):
        raise PromptNotConfiguredError("analytics_system")

    # Injecter le schéma dans le template
    content: str = prompt_data["content"]
    return content.format(schema=app_state.db_schema_cache)
