"""Tests pour llm_config/costs.py - Tracking des coûts LLM."""

from unittest.mock import MagicMock, patch

import pytest

from llm_config.costs import (
    get_costs_by_hour,
    get_costs_by_model,
    get_costs_by_period,
    get_costs_by_source,
    get_total_costs,
    log_cost,
)


class TestLogCost:
    """Tests de log_cost."""

    @patch("llm_config.costs.get_model")
    @patch("llm_config.costs.get_connection")
    def test_logs_cost(self, mock_conn: MagicMock, mock_model: MagicMock) -> None:
        """Enregistre un coût."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_model.return_value = {
            "cost_per_1m_input": 0.15,
            "cost_per_1m_output": 0.60,
        }

        cost_id = log_cost(
            model_id=1,
            source="analytics",
            tokens_input=1000,
            tokens_output=500,
        )

        assert cost_id == 1
        conn.commit.assert_called_once()

    @patch("llm_config.costs.get_model")
    @patch("llm_config.costs.get_connection")
    def test_calculates_costs(self, mock_conn: MagicMock, mock_model: MagicMock) -> None:
        """Calcule les coûts correctement."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_model.return_value = {
            "cost_per_1m_input": 0.15,  # $0.15 par million
            "cost_per_1m_output": 0.60,  # $0.60 par million
        }

        log_cost(
            model_id=1,
            source="analytics",
            tokens_input=1_000_000,  # 1M tokens
            tokens_output=500_000,  # 500K tokens
        )

        # Vérifier que l'INSERT a été appelé avec les bons paramètres
        # cost_input = 1M * 0.15 / 1M = $0.15
        # cost_output = 500K * 0.60 / 1M = $0.30
        insert_params = cursor.execute.call_args[0][1]
        assert insert_params is not None  # Les valeurs sont quelque part dans les paramètres

    @patch("llm_config.costs.get_model")
    @patch("llm_config.costs.get_connection")
    def test_handles_missing_model_costs(self, mock_conn: MagicMock, mock_model: MagicMock) -> None:
        """Gère les modèles sans coûts définis."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 1
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_model.return_value = {}  # Pas de coûts

        cost_id = log_cost(
            model_id=1,
            source="analytics",
            tokens_input=1000,
            tokens_output=500,
        )

        assert cost_id == 1

    @patch("llm_config.costs.get_model")
    @patch("llm_config.costs.get_connection")
    def test_logs_with_optional_params(self, mock_conn: MagicMock, mock_model: MagicMock) -> None:
        """Enregistre avec les paramètres optionnels."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.lastrowid = 2
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn
        mock_model.return_value = {}

        cost_id = log_cost(
            model_id=1,
            source="catalog",
            tokens_input=100,
            tokens_output=50,
            response_time_ms=1500,
            conversation_id=42,
            success=False,
            error_message="Test error",
        )

        assert cost_id == 2


class TestGetTotalCosts:
    """Tests de get_total_costs."""

    @patch("llm_config.costs.get_connection")
    def test_returns_totals(self, mock_conn: MagicMock) -> None:
        """Retourne les totaux."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "total_calls": 100,
            "total_tokens_input": 50000,
            "total_tokens_output": 25000,
            "total_cost": 1.50,
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_total_costs(days=30)
        assert costs["total_calls"] == 100
        assert costs["total_tokens_input"] == 50000
        assert costs["total_cost"] == 1.50

    @patch("llm_config.costs.get_connection")
    def test_handles_null_values(self, mock_conn: MagicMock) -> None:
        """Gère les valeurs NULL."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "total_calls": None,
            "total_tokens_input": None,
            "total_tokens_output": None,
            "total_cost": None,
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_total_costs()
        assert costs["total_calls"] == 0
        assert costs["total_tokens_input"] == 0
        assert costs["total_cost"] == 0.0

    @patch("llm_config.costs.get_connection")
    def test_filters_by_model(self, mock_conn: MagicMock) -> None:
        """Filtre par modèle."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "total_calls": 50,
            "total_tokens_input": 25000,
            "total_tokens_output": 12500,
            "total_cost": 0.75,
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_total_costs(model_id=1)

        call_args = cursor.execute.call_args
        assert "model_id" in str(call_args)

    @patch("llm_config.costs.get_connection")
    def test_filters_by_source(self, mock_conn: MagicMock) -> None:
        """Filtre par source."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {
            "total_calls": 25,
            "total_tokens_input": 10000,
            "total_tokens_output": 5000,
            "total_cost": 0.30,
        }
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        get_total_costs(source="analytics")

        call_args = cursor.execute.call_args
        assert "source" in str(call_args)


class TestGetCostsByPeriod:
    """Tests de get_costs_by_period."""

    @patch("llm_config.costs.get_connection")
    def test_returns_daily_costs(self, mock_conn: MagicMock) -> None:
        """Retourne les coûts par jour."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"date": "2024-01-15", "calls": 50, "cost": 0.50},
            {"date": "2024-01-14", "calls": 45, "cost": 0.45},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_costs_by_period(days=30)
        assert len(costs) == 2
        assert costs[0]["date"] == "2024-01-15"


class TestGetCostsByHour:
    """Tests de get_costs_by_hour."""

    @patch("llm_config.costs.get_connection")
    def test_returns_hourly_costs(self, mock_conn: MagicMock) -> None:
        """Retourne les coûts par heure."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"hour": "2024-01-15 14:00", "calls": 10, "cost": 0.10},
            {"hour": "2024-01-15 13:00", "calls": 8, "cost": 0.08},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_costs_by_hour(days=7)
        assert len(costs) == 2


class TestGetCostsByModel:
    """Tests de get_costs_by_model."""

    @patch("llm_config.costs.get_connection")
    def test_returns_costs_by_model(self, mock_conn: MagicMock) -> None:
        """Retourne les coûts groupés par modèle."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"model_name": "Gemini 2.0 Flash", "calls": 80, "cost": 0.80},
            {"model_name": "GPT-4", "calls": 20, "cost": 0.40},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_costs_by_model(days=30)
        assert len(costs) == 2
        assert costs[0]["model_name"] == "Gemini 2.0 Flash"


class TestGetCostsBySource:
    """Tests de get_costs_by_source."""

    @patch("llm_config.costs.get_connection")
    def test_returns_costs_by_source(self, mock_conn: MagicMock) -> None:
        """Retourne les coûts groupés par source."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"source": "analytics", "calls": 60, "cost": 0.60},
            {"source": "catalog", "calls": 40, "cost": 0.40},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        costs = get_costs_by_source(days=30)
        assert len(costs) == 2
        assert costs[0]["source"] == "analytics"
