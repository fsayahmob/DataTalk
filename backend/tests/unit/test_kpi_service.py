"""Tests pour kpi_service.py - Service KPIs dynamiques."""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from kpi_service import (
    execute_kpi_sql,
    get_all_kpis_with_data,
    get_kpi_with_data,
    save_kpis,
)


class TestExecuteKpiSql:
    """Tests de execute_kpi_sql."""

    def test_returns_none_if_empty(self) -> None:
        """Retourne None si résultat vide."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame()

        result = execute_kpi_sql(db, "SELECT COUNT(*) FROM test")

        assert result is None

    def test_returns_single_value(self) -> None:
        """Retourne une valeur unique."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"count": [42]})

        result = execute_kpi_sql(db, "SELECT COUNT(*) FROM test")

        assert result == 42

    def test_returns_list_for_multiple_rows(self) -> None:
        """Retourne une liste pour plusieurs lignes."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"value": [10, 20, 30, 40]}
        )

        result = execute_kpi_sql(db, "SELECT value FROM test")

        assert result == [10, 20, 30, 40]

    def test_handles_float_values(self) -> None:
        """Gère les valeurs float."""
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"avg": [4.567]})

        result = execute_kpi_sql(db, "SELECT AVG(note) FROM test")

        assert result == 4.567

    def test_skips_timestamp_in_sparkline(self) -> None:
        """Ignore les timestamps dans les sparklines."""
        db = MagicMock()
        df = pd.DataFrame(
            {
                "date": pd.to_datetime(["2024-01-01", "2024-01-02"]),
                "value": [10, 20],
            }
        )
        db.execute.return_value.fetchdf.return_value = df[["value"]]

        result = execute_kpi_sql(db, "SELECT value FROM test")

        # Résultat doit être une liste de valeurs
        assert isinstance(result, list)


class TestGetKpiWithData:
    """Tests de get_kpi_with_data."""

    def test_returns_kpi_structure(self) -> None:
        """Retourne la structure KPI de base."""
        kpi = {
            "kpi_id": "test_kpi",
            "title": "Test KPI",
            "sql_value": "SELECT 1",
            "sql_trend": "SELECT 0",
            "sql_sparkline": "SELECT 1",
        }
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"v": [42]})

        result = get_kpi_with_data(kpi, db)

        assert result["id"] == "test_kpi"
        assert result["title"] == "Test KPI"

    def test_uses_id_fallback(self) -> None:
        """Utilise 'id' si 'kpi_id' absent."""
        kpi = {
            "id": "fallback_id",
            "title": "Test",
            "sql_value": "SELECT 1",
            "sql_trend": "SELECT 0",
            "sql_sparkline": "SELECT 1",
        }
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame()

        result = get_kpi_with_data(kpi, db)

        assert result["id"] == "fallback_id"

    def test_rounds_float_value(self) -> None:
        """Arrondit les valeurs float à 2 décimales."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT 4.5678",
            "sql_trend": "SELECT 0",
            "sql_sparkline": "SELECT 1",
        }
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"v": [4.5678]})

        result = get_kpi_with_data(kpi, db)

        assert result["value"] == 4.57

    def test_calculates_trend(self) -> None:
        """Calcule le trend correctement."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT 100",
            "sql_trend": "SELECT 80",
            "sql_sparkline": "SELECT 1",
        }
        db = MagicMock()

        # Simuler sql_value retourne 100, sql_trend retourne 80
        def execute_side_effect(sql):
            mock_result = MagicMock()
            if "100" in sql:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [100]})
            elif "80" in sql:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [80]})
            else:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [1, 2, 3]})
            return mock_result

        db.execute.side_effect = execute_side_effect

        result = get_kpi_with_data(kpi, db)

        assert "trend" in result
        assert result["trend"]["direction"] == "up"
        # (100 - 80) / 80 * 100 = 25%
        assert result["trend"]["value"] == 25.0

    def test_handles_sparkline(self) -> None:
        """Gère les données sparkline."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT 1",
            "sql_trend": "SELECT 1",
            "sql_sparkline": "SELECT value FROM test",
            "sparkline_type": "line",
        }
        db = MagicMock()

        def execute_side_effect(sql):
            mock_result = MagicMock()
            if "value FROM" in sql:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [10, 20, 30, 40]})
            else:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [1]})
            return mock_result

        db.execute.side_effect = execute_side_effect

        result = get_kpi_with_data(kpi, db)

        assert "sparkline" in result
        assert result["sparkline"]["type"] == "line"
        assert len(result["sparkline"]["data"]) == 4

    def test_includes_footer(self) -> None:
        """Inclut le footer si présent."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT 1",
            "sql_trend": "SELECT 0",
            "sql_sparkline": "SELECT 1",
            "footer": "Dernière mise à jour: aujourd'hui",
        }
        db = MagicMock()
        db.execute.return_value.fetchdf.return_value = pd.DataFrame({"v": [1]})

        result = get_kpi_with_data(kpi, db)

        assert result["footer"] == "Dernière mise à jour: aujourd'hui"

    def test_handles_sql_value_error(self) -> None:
        """Gère les erreurs SQL gracieusement."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT * FROM invalid",
            "sql_trend": "SELECT 0",
            "sql_sparkline": "SELECT 1",
        }
        db = MagicMock()
        db.execute.side_effect = Exception("Table not found")

        result = get_kpi_with_data(kpi, db)

        assert result["value"] == "—"

    def test_invert_trend_flag(self) -> None:
        """Passe le flag invert au trend."""
        kpi = {
            "kpi_id": "test",
            "title": "Test",
            "sql_value": "SELECT 100",
            "sql_trend": "SELECT 120",
            "sql_sparkline": "SELECT 1",
            "invert_trend": True,
        }
        db = MagicMock()

        def execute_side_effect(sql):
            mock_result = MagicMock()
            if "100" in sql:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [100]})
            elif "120" in sql:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [120]})
            else:
                mock_result.fetchdf.return_value = pd.DataFrame({"v": [1, 2, 3]})
            return mock_result

        db.execute.side_effect = execute_side_effect

        result = get_kpi_with_data(kpi, db)

        assert result["trend"]["invert"] is True


class TestGetAllKpisWithData:
    """Tests de get_all_kpis_with_data."""

    @patch("kpi_service.get_connection")
    @patch("kpi_service.get_kpi_with_data")
    def test_returns_all_kpis(
        self, mock_get_kpi: MagicMock, mock_conn: MagicMock
    ) -> None:
        """Retourne tous les KPIs."""
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"kpi_id": "k1", "title": "KPI 1", "sql_value": "SELECT 1", "sql_trend": "SELECT 0", "sql_sparkline": "SELECT 1"},
            {"kpi_id": "k2", "title": "KPI 2", "sql_value": "SELECT 2", "sql_trend": "SELECT 0", "sql_sparkline": "SELECT 1"},
        ]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        mock_get_kpi.side_effect = [
            {"id": "k1", "title": "KPI 1", "value": 1},
            {"id": "k2", "title": "KPI 2", "value": 2},
        ]

        db = MagicMock()
        result = get_all_kpis_with_data(db)

        assert len(result) == 2
        assert result[0]["id"] == "k1"
        assert result[1]["id"] == "k2"


class TestSaveKpis:
    """Tests de save_kpis."""

    @patch("kpi_service.get_connection")
    def test_saves_kpis(self, mock_conn: MagicMock) -> None:
        """Sauvegarde les KPIs."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        kpis = [
            {"id": "k1", "title": "KPI 1", "sql_value": "SELECT 1", "sql_trend": "SELECT 0", "sql_sparkline": "SELECT 1"},
            {"id": "k2", "title": "KPI 2", "sql_value": "SELECT 2", "sql_trend": "SELECT 0", "sql_sparkline": "SELECT 1"},
        ]

        count = save_kpis(kpis)

        assert count == 2
        # Vérifie que DELETE est appelé
        assert cursor.execute.call_count == 3  # 1 DELETE + 2 INSERT
        conn.commit.assert_called_once()
        conn.close.assert_called_once()

    @patch("kpi_service.get_connection")
    def test_clears_old_kpis(self, mock_conn: MagicMock) -> None:
        """Vide les anciens KPIs avant insertion."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        save_kpis([{"id": "new", "title": "New", "sql_value": "", "sql_trend": "", "sql_sparkline": ""}])

        # Premier appel doit être le DELETE
        first_call = cursor.execute.call_args_list[0]
        assert "DELETE FROM kpis" in first_call[0][0]
