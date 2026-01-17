"""Tests pour catalog_engine/kpis.py - Génération et validation KPIs."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from catalog_engine.kpis import (
    generate_kpis,
    get_data_period,
    save_kpis,
    validate_all_kpis,
    validate_kpi,
)
from catalog_engine.models import (
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    KpiValidationResult,
    TableMetadata,
)


class TestValidateKpi:
    """Tests de validate_kpi."""

    def test_returns_validation_result(self) -> None:
        """Retourne un KpiValidationResult."""
        kpi = KpiDefinition(
            id="test",
            title="Test KPI",
            sql_value="SELECT COUNT(*) FROM t",
            sql_trend="SELECT COUNT(*) FROM t",
            sql_sparkline="SELECT d, COUNT(*) FROM t GROUP BY d",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert isinstance(result, KpiValidationResult)

    def test_ok_for_valid_kpi(self) -> None:
        """OK pour KPI valide."""
        kpi = KpiDefinition(
            id="valid-kpi",
            title="Valid KPI",
            sql_value="SELECT COUNT(*) FROM evaluations",
            sql_trend="SELECT COUNT(*) FROM evaluations WHERE d < NOW()",
            sql_sparkline="SELECT d, COUNT(*) FROM evaluations GROUP BY d",
            footer="Total evaluations",
        )
        result = validate_kpi(kpi)
        assert result.status == "OK"
        assert result.issues == []

    def test_warning_for_missing_id(self) -> None:
        """Warning pour ID manquant."""
        kpi = KpiDefinition(
            id="",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("id" in issue for issue in result.issues)

    def test_warning_for_short_id(self) -> None:
        """Warning pour ID trop court."""
        kpi = KpiDefinition(
            id="x",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"

    def test_warning_for_missing_title(self) -> None:
        """Warning pour titre manquant."""
        kpi = KpiDefinition(
            id="test",
            title="",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("title" in issue for issue in result.issues)

    def test_warning_for_invalid_sql_value(self) -> None:
        """Warning pour sql_value invalide."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="invalid query",  # Pas de SELECT
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("sql_value" in issue for issue in result.issues)

    def test_warning_for_invalid_sql_trend(self) -> None:
        """Warning pour sql_trend invalide."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="bad query",  # Pas de SELECT
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("sql_trend" in issue for issue in result.issues)

    def test_warning_for_invalid_sql_sparkline(self) -> None:
        """Warning pour sql_sparkline invalide."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="wrong query",  # Pas de SELECT
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("sql_sparkline" in issue for issue in result.issues)

    def test_warning_for_invalid_sparkline_type(self) -> None:
        """Warning pour sparkline_type invalide."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            sparkline_type="invalid",  # Doit être area ou bar
            footer="Test",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("sparkline_type" in issue for issue in result.issues)

    def test_warning_for_missing_footer(self) -> None:
        """Warning pour footer manquant."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert any("footer" in issue for issue in result.issues)

    def test_multiple_issues(self) -> None:
        """Plusieurs issues remontées."""
        kpi = KpiDefinition(
            id="",
            title="",
            sql_value="bad",
            sql_trend="bad",
            sql_sparkline="bad",
            sparkline_type="invalid",
            footer="",
        )
        result = validate_kpi(kpi)
        assert result.status == "WARNING"
        assert len(result.issues) >= 5


class TestValidateAllKpis:
    """Tests de validate_all_kpis."""

    def test_returns_summary_dict(self) -> None:
        """Retourne un dict de résumé."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = KpisGenerationResult(kpis=[kpi])
        summary = validate_all_kpis(result)

        assert "total" in summary
        assert "ok" in summary
        assert "warnings" in summary
        assert "details" in summary

    def test_counts_total_kpis(self) -> None:
        """Compte le total de KPIs."""
        kpis = [
            KpiDefinition(
                id=f"kpi-{i}",
                title=f"KPI {i}",
                sql_value="SELECT 1",
                sql_trend="SELECT 1",
                sql_sparkline="SELECT 1",
                footer="Test",
            )
            for i in range(4)
        ]
        result = KpisGenerationResult(kpis=kpis)
        summary = validate_all_kpis(result)
        assert summary["total"] == 4

    def test_counts_ok_kpis(self) -> None:
        """Compte les KPIs OK."""
        kpis = [
            KpiDefinition(
                id="valid",
                title="Valid",
                sql_value="SELECT 1",
                sql_trend="SELECT 1",
                sql_sparkline="SELECT 1",
                footer="Test",
            ),
            KpiDefinition(
                id="",  # Invalid
                title="",
                sql_value="bad",
                sql_trend="bad",
                sql_sparkline="bad",
                footer="",
            ),
        ]
        result = KpisGenerationResult(kpis=kpis)
        summary = validate_all_kpis(result)
        assert summary["ok"] == 1
        assert summary["warnings"] == 1

    def test_details_contain_validation_results(self) -> None:
        """Les détails contiennent les résultats de validation."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = KpisGenerationResult(kpis=[kpi])
        summary = validate_all_kpis(result)
        assert len(summary["details"]) == 1
        assert isinstance(summary["details"][0], KpiValidationResult)


class TestGetDataPeriod:
    """Tests de get_data_period."""

    def test_returns_period_string(self) -> None:
        """Retourne une string de période."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (
            "2024-05-01",
            "2024-05-31",
            31,
        )

        result = get_data_period(conn)
        assert isinstance(result, str)
        assert "2024-05-01" in result
        assert "2024-05-31" in result
        assert "31" in result

    def test_handles_no_data(self) -> None:
        """Gère l'absence de données."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (None, None, 0)

        result = get_data_period(conn)
        assert "non déterminée" in result.lower()

    def test_handles_db_error(self) -> None:
        """Gère les erreurs DB."""
        conn = MagicMock()
        conn.execute.side_effect = Exception("DB Error")

        result = get_data_period(conn)
        assert "non déterminée" in result.lower()


class TestGenerateKpis:
    """Tests de generate_kpis."""

    @patch("catalog_engine.kpis.get_active_prompt")
    def test_raises_if_prompt_not_configured(self, mock_prompt: MagicMock) -> None:
        """Lève erreur si prompt non configuré."""
        mock_prompt.return_value = None

        from llm_utils import KpiGenerationError

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )
        conn = MagicMock()

        with pytest.raises(KpiGenerationError):
            generate_kpis(catalog, conn)

    @patch("catalog_engine.kpis.get_active_prompt")
    def test_raises_if_prompt_empty(self, mock_prompt: MagicMock) -> None:
        """Lève erreur si prompt vide."""
        mock_prompt.return_value = {"content": ""}

        from llm_utils import KpiGenerationError

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[TableMetadata(name="t", row_count=100, columns=[])],
        )
        conn = MagicMock()

        with pytest.raises(KpiGenerationError):
            generate_kpis(catalog, conn)

    @patch("catalog_engine.kpis.call_with_retry")
    @patch("catalog_engine.kpis.get_data_period")
    @patch("catalog_engine.kpis.get_active_prompt")
    def test_returns_kpis_result(
        self,
        mock_prompt: MagicMock,
        mock_period: MagicMock,
        mock_retry: MagicMock,
    ) -> None:
        """Retourne un KpisGenerationResult."""
        mock_prompt.return_value = {"content": "{schema}{data_period}{kpi_fields}"}
        mock_period.return_value = "Du 2024-05-01 au 2024-05-31"

        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        mock_retry.return_value = KpisGenerationResult(kpis=[kpi])

        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="evaluations",
                    row_count=64000,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                )
            ],
        )
        conn = MagicMock()

        result = generate_kpis(catalog, conn)
        assert isinstance(result, KpisGenerationResult)
        assert len(result.kpis) == 1


class TestSaveKpis:
    """Tests de save_kpis."""

    @patch("catalog_engine.kpis.get_connection")
    def test_saves_kpis_to_db(self, mock_conn: MagicMock) -> None:
        """Sauvegarde les KPIs en DB."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        kpi = KpiDefinition(
            id="test-kpi",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = KpisGenerationResult(kpis=[kpi])

        stats = save_kpis(result)
        assert stats["kpis"] == 1

    @patch("catalog_engine.kpis.get_connection")
    def test_clears_old_kpis(self, mock_conn: MagicMock) -> None:
        """Vide les anciens KPIs."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = KpisGenerationResult(kpis=[])

        save_kpis(result)

        # Vérifie que DELETE a été appelé
        delete_calls = [call for call in cursor.execute.call_args_list if "DELETE" in str(call)]
        assert len(delete_calls) > 0

    @patch("catalog_engine.kpis.get_connection")
    def test_handles_insert_error(self, mock_conn: MagicMock) -> None:
        """Gère les erreurs d'insertion."""
        conn = MagicMock()
        cursor = MagicMock()
        # Première requête OK (DELETE), deuxième erreur (INSERT)
        cursor.execute.side_effect = [None, Exception("Insert error")]
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = KpisGenerationResult(kpis=[kpi])

        # Ne devrait pas lever d'erreur
        stats = save_kpis(result)
        assert stats["kpis"] == 0

    @patch("catalog_engine.kpis.get_connection")
    def test_commits_and_closes(self, mock_conn: MagicMock) -> None:
        """Commit et ferme la connexion."""
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value = cursor
        mock_conn.return_value = conn

        result = KpisGenerationResult(kpis=[])

        save_kpis(result)

        conn.commit.assert_called_once()
        conn.close.assert_called_once()
