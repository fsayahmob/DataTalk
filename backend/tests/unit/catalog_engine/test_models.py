"""Tests pour catalog_engine/models.py - Modèles Pydantic."""

import pytest

from catalog_engine.models import (
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    KpiValidationResult,
    TableMetadata,
    ValueFrequency,
)


class TestValueFrequency:
    """Tests de ValueFrequency."""

    def test_creates_with_required_fields(self) -> None:
        """Crée avec les champs requis."""
        vf = ValueFrequency(value="test", count=10, percentage=50.0)
        assert vf.value == "test"
        assert vf.count == 10
        assert vf.percentage == 50.0

    def test_model_dump(self) -> None:
        """Sérialise correctement en dict."""
        vf = ValueFrequency(value="foo", count=5, percentage=25.5)
        data = vf.model_dump()
        assert data["value"] == "foo"
        assert data["count"] == 5
        assert data["percentage"] == 25.5


class TestColumnMetadata:
    """Tests de ColumnMetadata."""

    def test_creates_with_minimal_fields(self) -> None:
        """Crée avec les champs minimaux."""
        col = ColumnMetadata(name="id", data_type="INTEGER")
        assert col.name == "id"
        assert col.data_type == "INTEGER"
        assert col.nullable is True
        assert col.is_primary_key is False

    def test_has_default_values(self) -> None:
        """A des valeurs par défaut correctes."""
        col = ColumnMetadata(name="test", data_type="VARCHAR")
        assert col.null_count == 0
        assert col.null_rate == 0.0
        assert col.distinct_count == 0
        assert col.unique_rate == 0.0
        assert col.sample_values == []
        assert col.top_values == []
        assert col.is_categorical is False
        assert col.value_range is None
        assert col.mean is None
        assert col.median is None
        assert col.min_length is None
        assert col.max_length is None
        assert col.avg_length is None
        assert col.detected_pattern is None
        assert col.pattern_match_rate is None
        assert col.potential_fk_table is None
        assert col.potential_fk_column is None

    def test_creates_with_all_fields(self) -> None:
        """Crée avec tous les champs."""
        col = ColumnMetadata(
            name="email",
            data_type="VARCHAR(255)",
            nullable=False,
            is_primary_key=False,
            null_count=5,
            null_rate=0.05,
            distinct_count=90,
            unique_rate=0.9,
            sample_values=["a@b.com", "c@d.com"],
            top_values=[ValueFrequency(value="a@b.com", count=10, percentage=10.0)],
            is_categorical=False,
            value_range=None,
            mean=None,
            median=None,
            min_length=5,
            max_length=100,
            avg_length=25.5,
            detected_pattern="email",
            pattern_match_rate=0.95,
            potential_fk_table="users",
            potential_fk_column="user_id",
        )
        assert col.name == "email"
        assert col.null_count == 5
        assert col.detected_pattern == "email"
        assert col.pattern_match_rate == 0.95

    def test_top_values_with_value_frequency(self) -> None:
        """top_values contient des ValueFrequency."""
        col = ColumnMetadata(
            name="status",
            data_type="VARCHAR",
            top_values=[
                ValueFrequency(value="active", count=50, percentage=50.0),
                ValueFrequency(value="inactive", count=30, percentage=30.0),
            ],
        )
        assert len(col.top_values) == 2
        assert col.top_values[0].value == "active"
        assert col.top_values[0].count == 50


class TestTableMetadata:
    """Tests de TableMetadata."""

    def test_creates_with_required_fields(self) -> None:
        """Crée avec les champs requis."""
        table = TableMetadata(
            name="users",
            row_count=1000,
            columns=[
                ColumnMetadata(name="id", data_type="INTEGER"),
                ColumnMetadata(name="name", data_type="VARCHAR"),
            ],
        )
        assert table.name == "users"
        assert table.row_count == 1000
        assert len(table.columns) == 2

    def test_columns_are_column_metadata(self) -> None:
        """Les colonnes sont des ColumnMetadata."""
        col = ColumnMetadata(name="id", data_type="INTEGER")
        table = TableMetadata(name="test", row_count=0, columns=[col])
        assert isinstance(table.columns[0], ColumnMetadata)


class TestExtractedCatalog:
    """Tests de ExtractedCatalog."""

    def test_creates_with_required_fields(self) -> None:
        """Crée avec les champs requis."""
        catalog = ExtractedCatalog(
            datasource="g7_analytics.duckdb",
            tables=[
                TableMetadata(
                    name="evaluations",
                    row_count=64000,
                    columns=[ColumnMetadata(name="id", data_type="INTEGER")],
                )
            ],
        )
        assert catalog.datasource == "g7_analytics.duckdb"
        assert len(catalog.tables) == 1

    def test_tables_are_table_metadata(self) -> None:
        """Les tables sont des TableMetadata."""
        table = TableMetadata(name="test", row_count=0, columns=[])
        catalog = ExtractedCatalog(datasource="test.duckdb", tables=[table])
        assert isinstance(catalog.tables[0], TableMetadata)


class TestCatalogValidationResult:
    """Tests de CatalogValidationResult."""

    def test_initializes_with_zeros(self) -> None:
        """Initialise avec des zéros."""
        result = CatalogValidationResult()
        assert result.tables_ok == 0
        assert result.tables_warning == 0
        assert result.columns_ok == 0
        assert result.columns_warning == 0
        assert result.synonyms_total == 0
        assert result.issues == []

    def test_status_ok_when_no_warnings(self) -> None:
        """Status OK quand pas de warnings."""
        result = CatalogValidationResult()
        result.tables_ok = 5
        result.columns_ok = 20
        assert result.status == "OK"

    def test_status_warning_when_table_warning(self) -> None:
        """Status WARNING quand warning sur table."""
        result = CatalogValidationResult()
        result.tables_warning = 1
        assert result.status == "WARNING"

    def test_status_warning_when_column_warning(self) -> None:
        """Status WARNING quand warning sur colonne."""
        result = CatalogValidationResult()
        result.columns_warning = 3
        assert result.status == "WARNING"

    def test_to_dict(self) -> None:
        """Sérialise correctement en dict."""
        result = CatalogValidationResult()
        result.tables_ok = 3
        result.tables_warning = 1
        result.columns_ok = 15
        result.columns_warning = 2
        result.synonyms_total = 25
        result.issues = ["Table X: description manquante"]

        data = result.to_dict()
        assert data["status"] == "WARNING"
        assert data["tables"]["ok"] == 3
        assert data["tables"]["warning"] == 1
        assert data["columns"]["ok"] == 15
        assert data["columns"]["warning"] == 2
        assert data["synonyms"] == 25
        assert len(data["issues"]) == 1


class TestKpiDefinition:
    """Tests de KpiDefinition."""

    def test_creates_with_required_fields(self) -> None:
        """Crée avec les champs requis."""
        kpi = KpiDefinition(
            id="total-evaluations",
            title="Évaluations",
            sql_value="SELECT COUNT(*) FROM evaluations",
            sql_trend="SELECT COUNT(*) FROM evaluations WHERE dat_course < '2024-05-15'",
            sql_sparkline="SELECT dat_course, COUNT(*) FROM evaluations GROUP BY dat_course",
            footer="Total depuis le début",
        )
        assert kpi.id == "total-evaluations"
        assert kpi.title == "Évaluations"
        assert kpi.sparkline_type == "area"  # Default
        assert kpi.invert_trend is False  # Default

    def test_has_default_values(self) -> None:
        """A des valeurs par défaut."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        assert kpi.sparkline_type == "area"
        assert kpi.trend_label is None
        assert kpi.invert_trend is False

    def test_get_fields_description(self) -> None:
        """get_fields_description retourne la description des champs."""
        desc = KpiDefinition.get_fields_description()
        assert "id:" in desc
        assert "title:" in desc
        assert "sql_value:" in desc
        assert "sql_trend:" in desc
        assert "sql_sparkline:" in desc
        assert "sparkline_type:" in desc
        assert "footer:" in desc
        assert "invert_trend:" in desc

    def test_get_fields_description_includes_defaults(self) -> None:
        """get_fields_description inclut les valeurs par défaut."""
        desc = KpiDefinition.get_fields_description()
        assert "défaut: area" in desc
        assert "défaut: False" in desc


class TestKpisGenerationResult:
    """Tests de KpisGenerationResult."""

    def test_creates_with_kpis_list(self) -> None:
        """Crée avec une liste de KPIs."""
        kpi = KpiDefinition(
            id="test",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )
        result = KpisGenerationResult(kpis=[kpi])
        assert len(result.kpis) == 1
        assert result.kpis[0].id == "test"

    def test_empty_kpis_list(self) -> None:
        """Accepte une liste vide."""
        result = KpisGenerationResult(kpis=[])
        assert result.kpis == []


class TestKpiValidationResult:
    """Tests de KpiValidationResult."""

    def test_creates_with_required_fields(self) -> None:
        """Crée avec les champs requis."""
        result = KpiValidationResult(kpi_id="test", status="OK")
        assert result.kpi_id == "test"
        assert result.status == "OK"
        assert result.issues == []

    def test_creates_with_issues(self) -> None:
        """Crée avec des issues."""
        result = KpiValidationResult(
            kpi_id="test",
            status="WARNING",
            issues=["sql_value invalide", "footer manquant"],
        )
        assert result.status == "WARNING"
        assert len(result.issues) == 2
