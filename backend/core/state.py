"""
État applicatif global pour G7 Analytics.

Contient:
- _AppState: Singleton pour les connexions DuckDB et le cache
- get_duckdb_path: Résolution du chemin DuckDB
- get_system_instruction: Génération du prompt système LLM
"""

from pathlib import Path
from typing import Any

import duckdb

from catalog import get_schema_for_llm, get_setting
from llm_config import get_active_prompt

# Configuration par défaut (fallback si settings non initialisé)
DEFAULT_DB_PATH = str(Path(__file__).parent.parent / ".." / "data" / "g7_analytics.duckdb")


class _AppState:
    """Container for mutable application state."""

    db_connection: duckdb.DuckDBPyConnection | None = None
    current_db_path: str | None = None
    db_schema_cache: str | None = None


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
