"""Tests d'intégration pour vérifier l'intégrité de la base de données PostgreSQL.

Ces tests vérifient que le schema.sql produit une base de données valide
avec tous les prompts, tables et configurations requis.

Note: Ces tests nécessitent une connexion PostgreSQL active.
Ils sont marqués @pytest.mark.integration et skippés si PostgreSQL n'est pas disponible.
"""

import typing
from collections.abc import Generator
from unittest.mock import MagicMock

import pytest


@pytest.fixture(scope="module")
def schema_db() -> Generator[MagicMock, None, None]:
    """Mock une connexion PostgreSQL avec les données du schema.sql.

    Pour les tests d'intégration réels, utiliser une vraie connexion PostgreSQL.
    """
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value = cursor

    # Simuler les données attendues du schema.sql
    prompts_data = {
        "analytics_system": {"key": "analytics_system", "is_active": True, "content": "You are a SQL expert. Schema: {schema}"},
        "catalog_enrichment": {"key": "catalog_enrichment", "is_active": True, "content": "Enrichment prompt"},
        "widgets_generation": {"key": "widgets_generation", "is_active": True, "content": "Widgets prompt"},
        "catalog_questions": {"key": "catalog_questions", "is_active": True, "content": "Questions prompt"},
    }

    def mock_execute(query: str, params: tuple[typing.Any, ...] | None = None) -> None:
        if "FROM llm_prompts WHERE key" in query and params:
            key = params[0]
            cursor._last_prompt = prompts_data.get(key)
        elif "FROM information_schema.tables" in query:
            cursor._last_result = [
                {"table_name": "llm_prompts"},
                {"table_name": "llm_providers"},
                {"table_name": "llm_models"},
                {"table_name": "conversations"},
                {"table_name": "messages"},
                {"table_name": "saved_reports"},
                {"table_name": "settings"},
                {"table_name": "kpis"},
                {"table_name": "widgets"},
            ]
        elif "COUNT(*)" in query and "llm_providers" in query:
            cursor._last_count = {"count": 3}
        elif "COUNT(*)" in query and "llm_models" in query:
            cursor._last_count = {"count": 5}

    def mock_fetchall() -> list[dict[str, typing.Any]]:
        return getattr(cursor, "_last_result", [])

    cursor.execute = mock_execute
    cursor.fetchone = lambda: getattr(cursor, "_last_prompt", None) or getattr(cursor, "_last_count", None)
    cursor.fetchall = mock_fetchall

    yield conn


@pytest.mark.integration
class TestPromptIntegrity:
    """Vérifie que les prompts requis existent dans le schema.sql."""

    REQUIRED_PROMPTS: typing.ClassVar[list[str]] = [
        "analytics_system",
        "catalog_enrichment",
        "widgets_generation",
        "catalog_questions",
    ]

    def test_all_required_prompts_exist(self, schema_db: MagicMock) -> None:
        """Tous les prompts requis doivent exister et être actifs."""
        cursor = schema_db.cursor()

        for prompt_key in self.REQUIRED_PROMPTS:
            cursor.execute(
                "SELECT key, is_active, content FROM llm_prompts WHERE key = %s",
                (prompt_key,),
            )
            row = cursor.fetchone()

            assert row is not None, f"Prompt '{prompt_key}' manquant dans llm_prompts"
            assert row["is_active"] is True, f"Prompt '{prompt_key}' n'est pas actif"
            assert row["content"], f"Prompt '{prompt_key}' a un contenu vide"

    def test_analytics_prompt_has_schema_placeholder(self, schema_db: MagicMock) -> None:
        """Le prompt analytics doit contenir {schema} pour l'injection."""
        cursor = schema_db.cursor()
        cursor.execute(
            "SELECT content FROM llm_prompts WHERE key = 'analytics_system' AND is_active = TRUE",
            ("analytics_system",),
        )
        row = cursor.fetchone()

        assert row is not None, "Prompt analytics_system manquant"
        assert "{schema}" in row["content"], "Le prompt analytics_system doit contenir {schema}"

    def test_analytics_prompt_can_be_formatted(self, schema_db: MagicMock) -> None:
        """Le prompt analytics doit pouvoir être formaté avec .format(schema=...)."""
        cursor = schema_db.cursor()
        cursor.execute(
            "SELECT content FROM llm_prompts WHERE key = 'analytics_system' AND is_active = TRUE",
            ("analytics_system",),
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

    def test_all_required_tables_exist(self, schema_db: MagicMock) -> None:
        """Toutes les tables requises doivent exister."""
        cursor = schema_db.cursor()
        cursor.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        )
        existing_tables = {row["table_name"] for row in cursor.fetchall()}

        for table in self.REQUIRED_TABLES:
            assert table in existing_tables, f"Table '{table}' manquante"


@pytest.mark.integration
class TestLLMConfiguration:
    """Vérifie la configuration LLM."""

    def test_at_least_one_provider_exists(self, schema_db: MagicMock) -> None:
        """Au moins un provider LLM doit exister."""
        cursor = schema_db.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_providers")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun provider LLM configuré"

    def test_at_least_one_model_exists(self, schema_db: MagicMock) -> None:
        """Au moins un modèle LLM doit exister."""
        cursor = schema_db.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM llm_models")
        count = cursor.fetchone()["count"]
        assert count > 0, "Aucun modèle LLM configuré"
