"""Tests pour llm_config/prompts.py - CRUD prompts."""

from unittest.mock import MagicMock, patch

import pytest

from llm_config.prompts import (
    add_prompt,
    delete_prompt,
    get_active_prompt,
    get_all_prompts,
    get_prompt,
    get_prompts,
    set_active_prompt,
    update_prompt,
    update_prompt_content,
)


class TestGetPrompts:
    """Tests de get_prompts."""

    @patch("llm_config.prompts.get_connection")
    def test_returns_all_prompts(self, mock_conn: MagicMock) -> None:
        """Retourne tous les prompts."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "key": "analytics_system", "is_active": 1},
            {"id": 2, "key": "catalog_enrichment", "is_active": 0},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompts = get_prompts()
        assert len(prompts) == 2

    @patch("llm_config.prompts.get_connection")
    def test_filters_by_category(self, mock_conn: MagicMock) -> None:
        """Filtre par catégorie."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "key": "analytics_system", "category": "analytics"},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_prompts(category="analytics")

        call_args = cursor.execute.call_args
        assert "analytics" in str(call_args)

    @patch("llm_config.prompts.get_connection")
    def test_filters_active_only(self, mock_conn: MagicMock) -> None:
        """Filtre les actifs seulement."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_prompts(active_only=True)

        call_args = cursor.execute.call_args[0][0]
        assert "is_active = 1" in call_args


class TestGetPrompt:
    """Tests de get_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_returns_prompt_by_key_and_version(self, mock_conn: MagicMock) -> None:
        """Retourne le prompt par clé et version."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "id": 1,
            "key": "analytics_system",
            "version": "normal",
            "content": "System prompt",
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt = get_prompt("analytics_system", "normal")
        assert prompt is not None
        assert prompt["key"] == "analytics_system"

    @patch("llm_config.prompts.get_connection")
    def test_returns_none_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne None si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt = get_prompt("unknown", "normal")
        assert prompt is None


class TestGetActivePrompt:
    """Tests de get_active_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_returns_active_prompt(self, mock_conn: MagicMock) -> None:
        """Retourne le prompt actif."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "id": 1,
            "key": "analytics_system",
            "is_active": 1,
            "content": "Active prompt",
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt = get_active_prompt("analytics_system")
        assert prompt is not None
        assert prompt["is_active"] == 1

    @patch("llm_config.prompts.get_prompt")
    @patch("llm_config.prompts.get_connection")
    def test_falls_back_to_normal_version(
        self, mock_conn: MagicMock, mock_get_prompt: MagicMock
    ) -> None:
        """Fallback vers version normal si pas de prompt actif."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None  # Pas de prompt actif
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_get_prompt.return_value = {"key": "test", "version": "normal"}

        prompt = get_active_prompt("test")

        mock_get_prompt.assert_called_once_with("test", "normal")


class TestAddPrompt:
    """Tests de add_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_adds_prompt(self, mock_conn: MagicMock) -> None:
        """Ajoute un prompt."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt_id = add_prompt(
            key="new_prompt",
            name="New Prompt",
            category="test",
            content="Prompt content",
        )

        assert prompt_id == 1
        conn.commit.assert_called_once()

    @patch("llm_config.prompts.get_connection")
    def test_adds_prompt_with_all_params(self, mock_conn: MagicMock) -> None:
        """Ajoute un prompt avec tous les paramètres."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 2
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt_id = add_prompt(
            key="test",
            name="Test",
            category="test",
            content="Content",
            version="v2",
            is_active=True,
            tokens_estimate=500,
            description="Test description",
        )

        assert prompt_id == 2

    @patch("llm_config.prompts.get_connection")
    def test_returns_none_on_error(self, mock_conn: MagicMock) -> None:
        """Retourne None en cas d'erreur."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.execute.side_effect = Exception("Duplicate key")
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompt_id = add_prompt(
            key="duplicate",
            name="Duplicate",
            category="test",
            content="Content",
        )

        assert prompt_id is None


class TestUpdatePrompt:
    """Tests de update_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_updates_prompt(self, mock_conn: MagicMock) -> None:
        """Met à jour le prompt."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_prompt(1, content="New content")
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.prompts.get_connection")
    def test_returns_false_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne False si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_prompt(999, content="New content")
        assert result is False


class TestSetActivePrompt:
    """Tests de set_active_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_sets_active_prompt(self, mock_conn: MagicMock) -> None:
        """Active un prompt."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1}  # Prompt exists
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_active_prompt("test", "v2")
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.prompts.get_connection")
    def test_deactivates_other_versions(self, mock_conn: MagicMock) -> None:
        """Désactive les autres versions."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1}
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        set_active_prompt("test", "v2")

        # Vérifier que is_active = 0 est dans les appels
        calls = [str(c) for c in cursor.execute.call_args_list]
        assert any("is_active = 0" in c for c in calls)

    @patch("llm_config.prompts.get_connection")
    def test_returns_false_if_prompt_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne False si prompt non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = None  # Prompt not found
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = set_active_prompt("unknown", "v1")
        assert result is False


class TestDeletePrompt:
    """Tests de delete_prompt."""

    @patch("llm_config.prompts.get_connection")
    def test_deletes_prompt(self, mock_conn: MagicMock) -> None:
        """Supprime un prompt."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = delete_prompt(1)
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.prompts.get_connection")
    def test_returns_false_if_not_found(self, mock_conn: MagicMock) -> None:
        """Retourne False si non trouvé."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = delete_prompt(999)
        assert result is False


class TestGetAllPrompts:
    """Tests de get_all_prompts."""

    @patch("llm_config.prompts.get_connection")
    def test_returns_all_prompts(self, mock_conn: MagicMock) -> None:
        """Retourne tous les prompts."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"id": 1, "key": "p1"},
            {"id": 2, "key": "p2"},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        prompts = get_all_prompts()
        assert len(prompts) == 2

    @patch("llm_config.prompts.get_connection")
    def test_closes_connection(self, mock_conn: MagicMock) -> None:
        """Ferme la connexion."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_all_prompts()
        conn.close.assert_called_once()


class TestUpdatePromptContent:
    """Tests de update_prompt_content."""

    @patch("llm_config.prompts.get_connection")
    def test_updates_content(self, mock_conn: MagicMock) -> None:
        """Met à jour le contenu."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_prompt_content("test", "New content")
        assert result is True
        conn.commit.assert_called_once()

    @patch("llm_config.prompts.get_connection")
    def test_updates_only_active(self, mock_conn: MagicMock) -> None:
        """Met à jour seulement le prompt actif."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        update_prompt_content("test", "New content")

        call_args = cursor.execute.call_args[0][0]
        assert "is_active = 1" in call_args

    @patch("llm_config.prompts.get_connection")
    def test_returns_false_if_no_active(self, mock_conn: MagicMock) -> None:
        """Retourne False si pas de prompt actif."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.rowcount = 0
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = update_prompt_content("unknown", "Content")
        assert result is False
