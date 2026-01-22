"""Tests pour catalog/widgets.py - CRUD widgets et cache."""

from unittest.mock import MagicMock, patch

import pytest

from catalog.widgets import (
    add_widget,
    clear_widget_cache,
    delete_all_widgets,
    get_widget_cache,
    get_widgets,
    set_widget_cache,
)


class TestAddWidget:
    """Tests de add_widget."""

    def test_inserts_widget(self) -> None:
        """Insère un widget."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = add_widget(
                widget_id="widget-1",
                title="Test Widget",
                sql_query="SELECT 1",
                chart_type="number",
            )

        assert result == 1
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_handles_all_parameters(self) -> None:
        """Gère tous les paramètres."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.lastrowid = 1
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = add_widget(
                widget_id="widget-2",
                title="Full Widget",
                sql_query="SELECT COUNT(*) FROM users",
                chart_type="bar",
                description="A test widget",
                icon="chart",
                chart_config='{"x": "name"}',
                display_order=5,
                priority="high",
            )

        assert result == 1
        call_args = mock_cursor.execute.call_args[0][1]
        assert call_args[0] == "widget-2"
        assert call_args[7] == 5  # display_order
        assert call_args[8] == "high"  # priority


class TestGetWidgets:
    """Tests de get_widgets."""

    def test_returns_enabled_widgets_by_default(self) -> None:
        """Retourne les widgets activés par défaut."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {"widget_id": "w1", "title": "Widget 1"},
            {"widget_id": "w2", "title": "Widget 2"},
        ]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = get_widgets()

        assert len(result) == 2
        # Vérifie que le filtre is_enabled est utilisé
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "is_enabled" in call_sql

    def test_returns_all_widgets_when_disabled_filter(self) -> None:
        """Retourne tous les widgets quand enabled_only=False."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"widget_id": "w1"}]
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            widgets = get_widgets(enabled_only=False)

        # Vérifie que le filtre is_enabled n'est PAS utilisé
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "WHERE" not in call_sql or "is_enabled" not in call_sql
        assert len(widgets) == 1

    def test_returns_empty_list_when_no_widgets(self) -> None:
        """Retourne liste vide sans widgets."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = get_widgets()

        assert result == []


class TestDeleteAllWidgets:
    """Tests de delete_all_widgets."""

    def test_deletes_cache_and_widgets(self) -> None:
        """Supprime le cache et les widgets."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            delete_all_widgets()

        # Doit supprimer widget_cache ET widgets
        calls = [c[0][0] for c in mock_cursor.execute.call_args_list]
        assert any("widget_cache" in c for c in calls)
        assert any("widgets" in c for c in calls)
        mock_conn.commit.assert_called_once()


class TestGetWidgetCache:
    """Tests de get_widget_cache."""

    def test_returns_cache_when_exists(self) -> None:
        """Retourne le cache quand il existe."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {
            "widget_id": "w1",
            "data": '{"value": 100}',
        }
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = get_widget_cache("w1")

        assert result is not None
        assert result["widget_id"] == "w1"

    def test_returns_none_when_not_cached(self) -> None:
        """Retourne None quand pas de cache."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = get_widget_cache("nonexistent")

        assert result is None

    def test_filters_expired_cache(self) -> None:
        """Filtre le cache expiré."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # Expired
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            result = get_widget_cache("expired_widget")

        # La requête doit inclure la vérification d'expiration
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "expires_at" in call_sql
        assert result is None


class TestSetWidgetCache:
    """Tests de set_widget_cache."""

    def test_sets_cache_without_ttl(self) -> None:
        """Définit le cache sans TTL."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            set_widget_cache("w1", '{"value": 100}')

        mock_conn.commit.assert_called_once()
        # expires_at devrait être NULL
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "NULL" in call_sql or "expires_at" in call_sql

    def test_sets_cache_with_ttl(self) -> None:
        """Définit le cache avec TTL."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            set_widget_cache("w1", '{"value": 100}', ttl_minutes=60)

        call_args = mock_cursor.execute.call_args[0][1]
        assert 60 in call_args  # TTL minutes

    def test_replaces_existing_cache(self) -> None:
        """Remplace le cache existant."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            set_widget_cache("w1", '{"value": 200}')

        call_sql = mock_cursor.execute.call_args[0][0]
        assert "ON CONFLICT" in call_sql


class TestClearWidgetCache:
    """Tests de clear_widget_cache."""

    def test_clears_all_cache(self) -> None:
        """Vide tout le cache."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("catalog.widgets.get_connection", return_value=mock_conn):
            clear_widget_cache()

        call_sql = mock_cursor.execute.call_args[0][0]
        assert "DELETE" in call_sql
        assert "widget_cache" in call_sql
        mock_conn.commit.assert_called_once()
