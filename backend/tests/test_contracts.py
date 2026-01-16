"""
Tests de contrat - Comportement observable de l'API publique.

Ces tests vérifient que les fonctions publiques respectent leur contrat:
- Inputs acceptés
- Outputs attendus
- Comportement aux limites
"""

import pytest

# Import depuis l'API publique uniquement
from catalog_engine import (
    CatalogValidationResult,
    ColumnMetadata,
    ExtractedCatalog,
    KpiDefinition,
    KpisGenerationResult,
    TableMetadata,
    validate_all_kpis,
    validate_catalog_enrichment,
    validate_kpi,
)


class TestCatalogValidationResultContract:
    """Tests du contrat CatalogValidationResult."""

    def test_status_ok_when_no_warnings(self) -> None:
        """Status OK quand pas de warnings."""
        result = CatalogValidationResult()
        result.tables_ok = 5
        result.columns_ok = 20
        result.tables_warning = 0
        result.columns_warning = 0
        assert result.status == "OK"

    def test_status_warning_when_table_warnings(self) -> None:
        """Status WARNING quand il y a des tables avec problèmes."""
        result = CatalogValidationResult()
        result.tables_ok = 4
        result.tables_warning = 1
        assert result.status == "WARNING"

    def test_status_warning_when_column_warnings(self) -> None:
        """Status WARNING quand il y a des colonnes avec problèmes."""
        result = CatalogValidationResult()
        result.columns_ok = 19
        result.columns_warning = 1
        assert result.status == "WARNING"

    def test_to_dict_structure(self) -> None:
        """Sérialisation en dict avec structure attendue."""
        result = CatalogValidationResult()
        result.tables_ok = 3
        result.tables_warning = 1
        result.columns_ok = 10
        result.columns_warning = 2
        result.synonyms_total = 15
        result.issues = ["Issue 1", "Issue 2"]

        data = result.to_dict()

        assert "status" in data
        assert "tables" in data
        assert "columns" in data
        assert "synonyms" in data
        assert "issues" in data
        assert data["tables"]["ok"] == 3
        assert data["tables"]["warning"] == 1
        assert data["columns"]["ok"] == 10
        assert data["columns"]["warning"] == 2
        assert data["synonyms"] == 15
        assert len(data["issues"]) == 2


class TestValidateCatalogEnrichmentContract:
    """Tests du contrat validate_catalog_enrichment."""

    def test_complete_enrichment_passes(self) -> None:
        """Enrichissement complet passe la validation."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="id", data_type="INTEGER"),
                        ColumnMetadata(name="email", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        enrichment = {
            "users": {
                "description": "Table des utilisateurs enregistrés dans le système",
                "columns": {
                    "id": {
                        "description": "Identifiant unique de l'utilisateur",
                        "synonyms": ["ID", "identifiant"],
                    },
                    "email": {
                        "description": "Adresse email de l'utilisateur",
                        "synonyms": ["mail", "courriel"],
                    },
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)

        assert result.status == "OK"
        assert result.tables_ok == 1
        assert result.columns_ok == 2
        assert len(result.issues) == 0

    def test_missing_table_description_warns(self) -> None:
        """Description de table manquante génère warning."""
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
        enrichment = {
            "users": {
                "description": "",  # Vide
                "columns": {
                    "id": {"description": "ID utilisateur", "synonyms": []},
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)

        assert result.status == "WARNING"
        assert result.tables_warning == 1
        assert any("users" in issue for issue in result.issues)

    def test_missing_column_description_warns(self) -> None:
        """Description de colonne manquante génère warning."""
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
        enrichment = {
            "users": {
                "description": "Table des utilisateurs",
                "columns": {
                    "id": {"description": "", "synonyms": []},  # Vide
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)

        assert result.status == "WARNING"
        assert result.columns_warning == 1

    def test_missing_enrichment_data_warns(self) -> None:
        """Enrichissement absent pour une table génère warning."""
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
        enrichment = {}  # Aucun enrichissement

        result = validate_catalog_enrichment(catalog, enrichment)

        assert result.status == "WARNING"
        assert result.tables_warning == 1
        assert result.columns_warning == 1

    def test_counts_synonyms(self) -> None:
        """Compte le nombre total de synonymes."""
        catalog = ExtractedCatalog(
            datasource="test.duckdb",
            tables=[
                TableMetadata(
                    name="users",
                    row_count=100,
                    columns=[
                        ColumnMetadata(name="id", data_type="INTEGER"),
                        ColumnMetadata(name="name", data_type="VARCHAR"),
                    ],
                )
            ],
        )
        enrichment = {
            "users": {
                "description": "Table users",
                "columns": {
                    "id": {"description": "User ID", "synonyms": ["ID", "identifiant", "user_id"]},
                    "name": {"description": "User name", "synonyms": ["nom", "prenom"]},
                },
            }
        }

        result = validate_catalog_enrichment(catalog, enrichment)

        assert result.synonyms_total == 5  # 3 + 2


class TestValidateKpiContract:
    """Tests du contrat validate_kpi."""

    def test_valid_kpi_passes(self) -> None:
        """KPI valide passe la validation."""
        kpi = KpiDefinition(
            id="total-sales",
            title="Ventes Totales",
            sql_value="SELECT SUM(amount) FROM sales",
            sql_trend="SELECT SUM(amount) FROM sales WHERE date < '2024-01-01'",
            sql_sparkline="SELECT date, SUM(amount) FROM sales GROUP BY date",
            footer="Total des ventes en euros",
        )

        result = validate_kpi(kpi)

        assert result.status == "OK"
        assert result.kpi_id == "total-sales"
        assert len(result.issues) == 0

    def test_missing_id_warns(self) -> None:
        """ID manquant génère warning."""
        kpi = KpiDefinition(
            id="",  # Vide
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )

        result = validate_kpi(kpi)

        assert result.status == "WARNING"
        assert any("id" in issue for issue in result.issues)

    def test_missing_title_warns(self) -> None:
        """Titre manquant génère warning."""
        kpi = KpiDefinition(
            id="test-kpi",
            title="",  # Vide
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )

        result = validate_kpi(kpi)

        assert result.status == "WARNING"
        assert any("title" in issue for issue in result.issues)

    def test_invalid_sql_warns(self) -> None:
        """SQL invalide (sans SELECT) génère warning."""
        kpi = KpiDefinition(
            id="test-kpi",
            title="Test",
            sql_value="INSERT INTO foo",  # Pas de SELECT
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            footer="Test",
        )

        result = validate_kpi(kpi)

        assert result.status == "WARNING"
        assert any("sql_value" in issue for issue in result.issues)

    def test_invalid_sparkline_type_warns(self) -> None:
        """Type de sparkline invalide génère warning."""
        kpi = KpiDefinition(
            id="test-kpi",
            title="Test",
            sql_value="SELECT 1",
            sql_trend="SELECT 1",
            sql_sparkline="SELECT 1",
            sparkline_type="invalid_type",  # Doit être "area" ou "bar"
            footer="Test",
        )

        result = validate_kpi(kpi)

        assert result.status == "WARNING"
        assert any("sparkline_type" in issue for issue in result.issues)


class TestValidateAllKpisContract:
    """Tests du contrat validate_all_kpis."""

    def test_all_valid_kpis(self) -> None:
        """Tous les KPIs valides."""
        result = KpisGenerationResult(
            kpis=[
                KpiDefinition(
                    id="kpi1",
                    title="KPI 1",
                    sql_value="SELECT 1",
                    sql_trend="SELECT 1",
                    sql_sparkline="SELECT 1",
                    footer="Footer 1",
                ),
                KpiDefinition(
                    id="kpi2",
                    title="KPI 2",
                    sql_value="SELECT 2",
                    sql_trend="SELECT 2",
                    sql_sparkline="SELECT 2",
                    footer="Footer 2",
                ),
            ]
        )

        validation = validate_all_kpis(result)

        assert validation["total"] == 2
        assert validation["ok"] == 2
        assert validation["warnings"] == 0

    def test_some_invalid_kpis(self) -> None:
        """Certains KPIs invalides."""
        result = KpisGenerationResult(
            kpis=[
                KpiDefinition(
                    id="valid-kpi",
                    title="Valid",
                    sql_value="SELECT 1",
                    sql_trend="SELECT 1",
                    sql_sparkline="SELECT 1",
                    footer="Footer",
                ),
                KpiDefinition(
                    id="",  # ID vide = invalide
                    title="Invalid",
                    sql_value="SELECT 1",
                    sql_trend="SELECT 1",
                    sql_sparkline="SELECT 1",
                    footer="Footer",
                ),
            ]
        )

        validation = validate_all_kpis(result)

        assert validation["total"] == 2
        assert validation["ok"] == 1
        assert validation["warnings"] == 1

    def test_empty_kpis_list(self) -> None:
        """Liste de KPIs vide."""
        result = KpisGenerationResult(kpis=[])

        validation = validate_all_kpis(result)

        assert validation["total"] == 0
        assert validation["ok"] == 0
        assert validation["warnings"] == 0
