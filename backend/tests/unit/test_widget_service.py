"""Tests pour widget_service.py - Service widgets dynamiques."""

import json
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from widget_service import (
    DEFAULT_CACHE_TTL_MINUTES,
    execute_widget_sql,
    get_all_widgets_with_data,
    get_widget_with_data,
    refresh_all_widgets_cache,
    refresh_single_widget_cache,
)


class TestExecuteWidgetSql:
    """Tests de execute_widget_sql."""

    def test_returns_list_of_dicts(self) -> None:
        """Retourne une liste de dictionnaires."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"col1": [1, 2], "col2": ["a", "b"]}
        )

        result = execute_widget_sql(db, "SELECT * FROM test")

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["col1"] == 1
        assert result[0]["col2"] == "a"

    def test_handles_empty_result(self) -> None:
        """Gère les résultats vides."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame()

        result = execute_widget_sql(db, "SELECT * FROM test")

        assert result == []


class TestGetWidgetWithData:
    """Tests de get_widget_with_data."""

    @patch("widget_service.get_widget_cache")
    @patch("widget_service.set_widget_cache")
    def test_uses_cache_when_available(
        self, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """Utilise le cache si disponible."""
        mock_get.return_value = {
            "data": '[{"col": 1}]',
            "computed_at": "2024-01-01T00:00:00",
        }

        widget = {"widget_id": "w1", "sql_query": "SELECT 1"}
        db = MagicMock()

        result = get_widget_with_data(widget, db, use_cache=True)

        assert result["from_cache"] is True
        assert result["data"] == [{"col": 1}]
        db.execute.assert_not_called()

    @patch("widget_service.get_widget_cache")
    @patch("widget_service.set_widget_cache")
    def test_executes_sql_when_no_cache(
        self, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """Exécute SQL si pas de cache."""
        mock_get.return_value = None

        widget = {"widget_id": "w1", "sql_query": "SELECT 1"}
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"col": [1]})

        result = get_widget_with_data(widget, db, use_cache=True)

        assert result["from_cache"] is False
        assert result["data"] == [{"col": 1}]
        db.execute.assert_called_once()
        mock_set.assert_called_once()

    @patch("widget_service.get_widget_cache")
    @patch("widget_service.set_widget_cache")
    def test_skips_cache_when_disabled(
        self, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """N'utilise pas le cache si désactivé."""
        widget = {"widget_id": "w1", "sql_query": "SELECT 1"}
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"col": [1]})

        result = get_widget_with_data(widget, db, use_cache=False)

        mock_get.assert_not_called()
        assert result["from_cache"] is False

    @patch("widget_service.get_widget_cache")
    @patch("widget_service.set_widget_cache")
    def test_handles_invalid_cache_json(
        self, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """Gère le JSON invalide dans le cache."""
        mock_get.return_value = {
            "data": "invalid json",
            "computed_at": "2024-01-01T00:00:00",
        }

        widget = {"widget_id": "w1", "sql_query": "SELECT 1"}
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"col": [1]})

        result = get_widget_with_data(widget, db, use_cache=True)

        # Doit exécuter SQL car cache invalide
        db.execute.assert_called_once()
        assert result["from_cache"] is False

    @patch("widget_service.get_widget_cache")
    @patch("widget_service.set_widget_cache")
    @patch("widget_service.sanitize_sql_error")
    def test_handles_sql_error(
        self, mock_sanitize: MagicMock, mock_set: MagicMock, mock_get: MagicMock
    ) -> None:
        """Gère les erreurs SQL gracieusement."""
        mock_get.return_value = None
        mock_sanitize.return_value = "db.query_error"

        widget = {"widget_id": "w1", "sql_query": "SELECT * FROM invalid"}
        db = MagicMock()
        db.execute.side_effect = Exception("Table not found")

        result = get_widget_with_data(widget, db, use_cache=False)

        assert result["data"] == []
        assert "error" in result


class TestGetAllWidgetsWithData:
    """Tests de get_all_widgets_with_data."""

    @patch("widget_service.get_widgets")
    @patch("widget_service.get_widget_with_data")
    def test_returns_all_widgets(
        self, mock_get_widget: MagicMock, mock_get_widgets: MagicMock
    ) -> None:
        """Retourne tous les widgets."""
        mock_get_widgets.return_value = [
            {"widget_id": "w1", "sql_query": "SELECT 1"},
            {"widget_id": "w2", "sql_query": "SELECT 2"},
        ]
        mock_get_widget.side_effect = [
            {"widget_id": "w1", "data": [{"v": 1}]},
            {"widget_id": "w2", "data": [{"v": 2}]},
        ]

        db = MagicMock()
        result = get_all_widgets_with_data(db)

        assert len(result) == 2
        mock_get_widgets.assert_called_once_with(enabled_only=True)


class TestRefreshAllWidgetsCache:
    """Tests de refresh_all_widgets_cache."""

    @patch("widget_service.clear_widget_cache")
    @patch("widget_service.get_widgets")
    @patch("widget_service.execute_widget_sql")
    @patch("widget_service.set_widget_cache")
    def test_refreshes_all_widgets(
        self,
        mock_set: MagicMock,
        mock_execute: MagicMock,
        mock_get: MagicMock,
        mock_clear: MagicMock,
    ) -> None:
        """Rafraîchit tous les widgets."""
        mock_get.return_value = [
            {"widget_id": "w1", "sql_query": "SELECT 1"},
            {"widget_id": "w2", "sql_query": "SELECT 2"},
        ]
        mock_execute.return_value = [{"col": 1}]

        db = MagicMock()
        result = refresh_all_widgets_cache(db)

        mock_clear.assert_called_once()
        assert result["total"] == 2
        assert result["success"] == 2
        assert result["errors"] == []

    @patch("widget_service.clear_widget_cache")
    @patch("widget_service.get_widgets")
    @patch("widget_service.execute_widget_sql")
    @patch("widget_service.set_widget_cache")
    def test_tracks_errors(
        self,
        mock_set: MagicMock,
        mock_execute: MagicMock,
        mock_get: MagicMock,
        mock_clear: MagicMock,
    ) -> None:
        """Trace les erreurs."""
        mock_get.return_value = [
            {"widget_id": "w1", "sql_query": "SELECT 1"},
            {"widget_id": "w2", "sql_query": "SELECT * FROM invalid"},
        ]
        mock_execute.side_effect = [[{"col": 1}], Exception("Error")]

        db = MagicMock()
        result = refresh_all_widgets_cache(db)

        assert result["success"] == 1
        assert len(result["errors"]) == 1
        assert result["errors"][0]["widget_id"] == "w2"


class TestRefreshSingleWidgetCache:
    """Tests de refresh_single_widget_cache."""

    @patch("widget_service.get_widgets")
    @patch("widget_service.execute_widget_sql")
    @patch("widget_service.set_widget_cache")
    def test_refreshes_single_widget(
        self, mock_set: MagicMock, mock_execute: MagicMock, mock_get: MagicMock
    ) -> None:
        """Rafraîchit un seul widget."""
        mock_get.return_value = [{"widget_id": "w1", "sql_query": "SELECT 1"}]
        mock_execute.return_value = [{"col": 1}, {"col": 2}]

        db = MagicMock()
        result = refresh_single_widget_cache("w1", db)

        assert result["success"] is True
        assert result["rows"] == 2
        assert result["widget_id"] == "w1"

    @patch("widget_service.get_widgets")
    def test_returns_error_if_not_found(self, mock_get: MagicMock) -> None:
        """Retourne erreur si widget non trouvé."""
        mock_get.return_value = []

        db = MagicMock()
        result = refresh_single_widget_cache("unknown", db)

        assert "error" in result
        assert "non trouvé" in result["error"]

    @patch("widget_service.get_widgets")
    @patch("widget_service.execute_widget_sql")
    def test_handles_sql_error(
        self, mock_execute: MagicMock, mock_get: MagicMock
    ) -> None:
        """Gère les erreurs SQL."""
        mock_get.return_value = [{"widget_id": "w1", "sql_query": "SELECT * FROM bad"}]
        mock_execute.side_effect = Exception("SQL error")

        db = MagicMock()
        result = refresh_single_widget_cache("w1", db)

        assert result["success"] is False
        assert "error" in result


class TestDefaultCacheTtl:
    """Tests de la constante DEFAULT_CACHE_TTL_MINUTES."""

    def test_default_ttl_is_60(self) -> None:
        """Le TTL par défaut est 60 minutes."""
        assert DEFAULT_CACHE_TTL_MINUTES == 60
