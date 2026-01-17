"""Tests d'intégration pour vérifier l'intégrité de la base de données.

Ces tests vérifient que le schema.sql produit une base de données valide
avec tous les prompts, tables et configurations requis.
"""

import sqlite3
import typing
from collections.abc import Generator
from pathlib import Path

import pytest

# Chemin vers le schema.sql
SCHEMA_SQL = Path(__file__).parent.parent.parent / "schema.sql"


@pytest.fixture(scope="module")
def schema_db() -> Generator[sqlite3.Connection, None, None]:
    """Crée une base de données en mémoire à partir du schema.sql."""
    if not SCHEMA_SQL.exists():
        pytest.skip("schema.sql non trouvé")

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row

    # Exécuter le schema.sql complet
    schema_content = SCHEMA_SQL.read_text(encoding="utf-8")
    conn.executescript(schema_content)

    yield conn
    conn.close()


@pytest.mark.integration
class TestPromptIntegrity:
    """Vérifie que les prompts requis existent dans le schema.sql."""

    REQUIRED_PROMPTS: typing.ClassVar[list[str]] = [
        "analytics_system",
        "catalog_enrichment",
        "widgets_generation",
        "catalog_questions",
    ]

    def test_all_required_prompts_exist(self, schema_db: sqlite3.Connection) -> None:
        """Tous les prompts requis doivent exister et être actifs."""
        cursor = schema_db.cursor()

        for prompt_key in self.REQUIRED_PROMPTS:
            cursor.execute(
                "SELECT key, is_active, content FROM llm_prompts WHERE key = ?",
                (prompt_key,),
            )
            row = cursor.fetchone()

            assert row is not None, f"Prompt '{prompt_key}' manquant dans llm_prompts"
            assert row["is_active"] == 1, f"Prompt '{prompt_key}' n'est pas actif"
            assert row["content"], f"Prompt '{prompt_key}' a un contenu vide"

    def test_analytics_prompt_has_schema_placeholder(self, schema_db: sqlite3.Connection) -> None:
        """Le prompt analytics doit contenir {schema} pour l'injection."""
        cursor = schema_db.cursor()
        cursor.execute(
            "SELECT content FROM llm_prompts WHERE key = 'analytics_system' AND is_active = 1"
        )
        row = cursor.fetchone()

        assert row is not None, "Prompt analytics_system manquant"
        assert "{schema}" in row["content"], "Le prompt analytics_system doit contenir {schema}"

    def test_analytics_prompt_can_be_formatted(self, schema_db: sqlite3.Connection) -> None:
        """Le prompt analytics doit pouvoir être formaté avec .format(schema=...)."""
        cursor = schema_db.cursor()
        cursor.execute(
            "SELECT content FROM llm_prompts WHERE key = 'analytics_system' AND is_active = 1"
        )
        row = cursor.fetchone()

        assert row is not None, "Prompt analytics_system manquant"

        # Test que le format fonctionne sans KeyError
        try:
            formatted = row["content"].format(schema="TEST_SCHEMA")
            assert "TEST_SCHEMA" in formatted
        except KeyError as e:
            raise AssertionError(
                f"Le prompt contient des accolades non échappées: {e}. "
                "Utilisez {{ et }} pour les accolades littérales."
            ) from e


@pytest.mark.integration
class TestDatabaseSchema:
    """Vérifie que les tables requises existent."""

    REQUIRED_TABLES: typing.ClassVar[list[str]] = [
        "llm_prompts",
        "llm_providers",
        "llm_models",
        "conversations",
        "messages",
        "saved_reports",
        "settings",
        "kpis",
        "widgets",
    ]

    def test_all_required_tables_exist(self, schema_db: sqlite3.Connection) -> None:
        """Toutes les tables requises doivent exister."""
        cursor = schema_db.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cursor.fetchall()}

        for table in self.REQUIRED_TABLES:
            assert table in existing_tables, f"Table '{table}' manquante"


@pytest.mark.integration
class TestLLMConfiguration:
    """Vérifie la configuration LLM."""

    def test_at_least_one_provider_exists(self, schema_db: sqlite3.Connection) -> None:
        """Au moins un provider LLM doit exister."""
        cursor = schema_db.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_providers")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun provider LLM configuré"

    def test_at_least_one_model_exists(self, schema_db: sqlite3.Connection) -> None:
        """Au moins un modèle LLM doit exister."""
        cursor = schema_db.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_models")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun modèle LLM configuré"
