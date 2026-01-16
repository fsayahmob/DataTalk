"""
Tests des modèles Pydantic - Contrat de données.

Ces tests vérifient que les modèles respectent leur contrat:
- Champs obligatoires vs optionnels
- Valeurs par défaut
- Sérialisation/désérialisation
"""

import pytest

# Import depuis l'API publique uniquement
from catalog_engine import (
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    KpiValidationResult,
    TableMetadata,
    ValueFrequency,
)


class TestValueFrequency:
    """Tests du modèle ValueFrequency."""

    def test_creation(self) -> None:
        """Création avec tous les champs."""
        vf = ValueFrequency(value="Paris", count=150, percentage=25.5)
        assert vf.value == "Paris"
        assert vf.count == 150
        assert vf.percentage == 25.5

    def test_serialization(self) -> None:
        """Sérialisation en dict."""
        vf = ValueFrequency(value="test", count=10, percentage=5.0)
        data = vf.model_dump()
        assert data["value"] == "test"
        assert data["count"] == 10
        assert data["percentage"] == 5.0


class TestColumnMetadata:
    """Tests du modèle ColumnMetadata."""

    def test_minimal_creation(self) -> None:
        """Création avec champs obligatoires uniquement."""
        col = ColumnMetadata(name="id", data_type="INTEGER")
        assert col.name == "id"
        assert col.data_type == "INTEGER"
        assert col.nullable is True  # Défaut
        assert col.is_primary_key is False  # Défaut
        assert col.null_count == 0  # Défaut
        assert col.sample_values == []  # Défaut

    def test_full_creation(self) -> None:
        """Création avec tous les champs."""
        col = ColumnMetadata(
            name="email",
            data_type="VARCHAR",
            nullable=True,
            is_primary_key=False,
            null_count=50,
            null_rate=0.05,
            distinct_count=1000,
            unique_rate=0.1,
            sample_values=["a@b.com", "c@d.com"],
            top_values=[ValueFrequency(value="a@b.com", count=10, percentage=1.0)],
            is_categorical=False,
            value_range=None,
            mean=None,
            median=None,
            min_length=5,
            max_length=100,
            avg_length=25.5,
            detected_pattern="email",
            pattern_match_rate=0.95,
        )
        assert col.detected_pattern == "email"
        assert col.pattern_match_rate == 0.95
        assert col.min_length == 5

    def test_serialization(self) -> None:
        """Sérialisation JSON fonctionne."""
        col = ColumnMetadata(name="id", data_type="INTEGER")
        data = col.model_dump()
        assert "name" in data
        assert "data_type" in data
        assert "nullable" in data

    def test_deserialization(self) -> None:
        """Désérialisation depuis dict."""
        data = {
            "name": "test_col",
            "data_type": "BIGINT",
            "null_rate": 0.1,
        }
        col = ColumnMetadata(**data)
        assert col.name == "test_col"
        assert col.data_type == "BIGINT"
        assert col.null_rate == 0.1


class TestTableMetadata:
    """Tests du modèle TableMetadata."""

    def test_creation(self) -> None:
        """Création avec colonnes."""
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

    def test_empty_columns(self) -> None:
        """Table sans colonnes (cas limite)."""
        table = TableMetadata(name="empty_table", row_count=0, columns=[])
        assert len(table.columns) == 0


class TestExtractedCatalog:
    """Tests du modèle ExtractedCatalog."""

    def test_creation(self) -> None:
        """Création d'un catalogue."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[ColumnMetadata(name="id", data_type="INTEGER")],
                )
            ],
        )
        assert catalog.datasource == "test.duckdb"
        assert len(catalog.tables) == 1

    def test_multiple_tables(self) -> None:
        """Catalogue avec plusieurs tables."""
        catalog = ExtractedCatalog(
            datasource="analytics.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=1000,
                    columns=[ColumnMetadata(name="id", data_type="INT")],
                ),
                TableMetadata(
                    name="orders",
                    row_count=5000,
                    columns=[ColumnMetadata(name="order_id", data_type="INT")],
                ),
            ],
        )
        assert len(catalog.tables) == 2
        assert catalog.tables[0].name == "users"
        assert catalog.tables[1].name == "orders"


class TestKpiDefinition:
    """Tests du modèle KpiDefinition."""

    def test_creation(self) -> None:
        """Création d'un KPI."""
        kpi = KpiDefinition(
            id="total-sales",
            title="Ventes",
            sql_value="SELECT SUM(amount) FROM sales",
            sql_trend="SELECT SUM(amount) FROM sales WHERE date < '2024-01-01'",
            sql_sparkline="SELECT date, SUM(amount) FROM sales GROUP BY date",
            footer="Total des ventes",
        )
        assert kpi.id == "total-sales"
        assert kpi.sparkline_type == "area"  # Défaut
        assert kpi.invert_trend is False  # Défaut

    def test_invert_trend(self) -> None:
        """KPI avec tendance inversée (baisse = positif)."""
        kpi = KpiDefinition(
            id="error-rate",
            title="Erreurs",
            sql_value="SELECT COUNT(*) FROM errors",
            sql_trend="SELECT COUNT(*) FROM errors WHERE date < '2024-01-01'",
            sql_sparkline="SELECT date, COUNT(*) FROM errors GROUP BY date",
            footer="Taux d'erreur",
            invert_trend=True,
        )
        assert kpi.invert_trend is True

    def test_get_fields_description(self) -> None:
        """Génération de la description des champs."""
        desc = KpiDefinition.get_fields_description()
        assert "id" in desc
        assert "title" in desc
        assert "sql_value" in desc


class TestKpisGenerationResult:
    """Tests du modèle KpisGenerationResult."""

    def test_creation(self) -> None:
        """Création d'un résultat de génération."""
        result = KpisGenerationResult(
            kpis=[
                KpiDefinition(
                    id="kpi1",
                    title="KPI 1",
                    sql_value="SELECT 1",
                    sql_trend="SELECT 1",
                    sql_sparkline="SELECT 1",
                    footer="Test",
                )
            ]
        )
        assert len(result.kpis) == 1

    def test_empty_kpis(self) -> None:
        """Résultat sans KPIs."""
        result = KpisGenerationResult(kpis=[])
        assert len(result.kpis) == 0


class TestKpiValidationResult:
    """Tests du modèle KpiValidationResult."""

    def test_ok_status(self) -> None:
        """Validation OK."""
        result = KpiValidationResult(kpi_id="test-kpi", status="OK")
        assert result.status == "OK"
        assert result.issues == []

    def test_warning_status(self) -> None:
        """Validation avec warnings."""
        result = KpiValidationResult(
            kpi_id="test-kpi", status="WARNING", issues=["Missing title", "Invalid SQL"]
        )
        assert result.status == "WARNING"
        assert len(result.issues) == 2
