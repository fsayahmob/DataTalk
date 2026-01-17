"""Tests d'intégration pour vérifier l'intégrité de la base de données."""

import sqlite3
from pathlib import Path

import pytest

# Chemin vers la base de données de production
CATALOG_DB = Path(__file__).parent.parent.parent / "catalog.sqlite"


@pytest.mark.integration
class TestPromptIntegrity:
    """Vérifie que les prompts requis existent."""

    REQUIRED_PROMPTS = [
        "analytics_system",
        "catalog_enrichment",
        "widgets_generation",
        "catalog_questions",
    ]

    @pytest.fixture
    def db_connection(self):
        """Connexion à la vraie base de données."""
        if not CATALOG_DB.exists():
            pytest.skip("Base de données catalog.sqlite non trouvée")
        conn = sqlite3.connect(str(CATALOG_DB))
        conn.row_factory = sqlite3.Row
        yield conn
        conn.close()

    def test_all_required_prompts_exist(self, db_connection) -> None:
        """Tous les prompts requis doivent exister et être actifs."""
        cursor = db_connection.cursor()

        for prompt_key in self.REQUIRED_PROMPTS:
            cursor.execute(
                "SELECT key, is_active, content FROM llm_prompts WHERE key = ?",
                (prompt_key,),
            )
            row = cursor.fetchone()

            assert row is not None, f"Prompt '{prompt_key}' manquant dans llm_prompts"
            assert row["is_active"] == 1, f"Prompt '{prompt_key}' n'est pas actif"
            assert row["content"], f"Prompt '{prompt_key}' a un contenu vide"

    def test_analytics_prompt_has_schema_placeholder(self, db_connection) -> None:
        """Le prompt analytics doit contenir {schema} pour l'injection."""
        cursor = db_connection.cursor()
        cursor.execute(
            "SELECT content FROM llm_prompts WHERE key = 'analytics_system' AND is_active = 1"
        )
        row = cursor.fetchone()

        assert row is not None, "Prompt analytics_system manquant"
        assert "{schema}" in row["content"], "Le prompt analytics_system doit contenir {schema}"

    def test_analytics_prompt_can_be_formatted(self, db_connection) -> None:
        """Le prompt analytics doit pouvoir être formaté avec .format(schema=...)."""
        cursor = db_connection.cursor()
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

    REQUIRED_TABLES = [
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

    @pytest.fixture
    def db_connection(self):
        """Connexion à la vraie base de données."""
        if not CATALOG_DB.exists():
            pytest.skip("Base de données catalog.sqlite non trouvée")
        conn = sqlite3.connect(str(CATALOG_DB))
        yield conn
        conn.close()

    def test_all_required_tables_exist(self, db_connection) -> None:
        """Toutes les tables requises doivent exister."""
        cursor = db_connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cursor.fetchall()}

        for table in self.REQUIRED_TABLES:
            assert table in existing_tables, f"Table '{table}' manquante"


@pytest.mark.integration
class TestLLMConfiguration:
    """Vérifie la configuration LLM."""

    @pytest.fixture
    def db_connection(self):
        """Connexion à la vraie base de données."""
        if not CATALOG_DB.exists():
            pytest.skip("Base de données catalog.sqlite non trouvée")
        conn = sqlite3.connect(str(CATALOG_DB))
        conn.row_factory = sqlite3.Row
        yield conn
        conn.close()

    def test_at_least_one_provider_exists(self, db_connection) -> None:
        """Au moins un provider LLM doit exister."""
        cursor = db_connection.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_providers")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun provider LLM configuré"

    def test_at_least_one_model_exists(self, db_connection) -> None:
        """Au moins un modèle LLM doit exister."""
        cursor = db_connection.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_models")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun modèle LLM configuré"
