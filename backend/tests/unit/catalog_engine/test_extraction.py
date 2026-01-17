"""Tests pour catalog_engine/extraction.py - Extraction métadonnées DuckDB."""

from unittest.mock import MagicMock, patch

import pytest

from catalog_engine.extraction import (
    COMMON_PATTERNS,
    build_column_full_context,
    detect_pattern,
    extract_column_stats,
    extract_metadata_from_connection,
)
from catalog_engine.models import ColumnMetadata, ValueFrequency


class TestCommonPatterns:
    """Tests de COMMON_PATTERNS."""

    def test_has_email_pattern(self) -> None:
        """A un pattern email."""
        assert "email" in COMMON_PATTERNS

    def test_has_uuid_pattern(self) -> None:
        """A un pattern UUID."""
        assert "uuid" in COMMON_PATTERNS

    def test_has_phone_pattern(self) -> None:
        """A un pattern téléphone français."""
        assert "phone_fr" in COMMON_PATTERNS

    def test_has_url_pattern(self) -> None:
        """A un pattern URL."""
        assert "url" in COMMON_PATTERNS

    def test_has_ip_pattern(self) -> None:
        """A un pattern IP."""
        assert "ip_address" in COMMON_PATTERNS

    def test_has_date_patterns(self) -> None:
        """A des patterns date."""
        assert "date_iso" in COMMON_PATTERNS
        assert "datetime_iso" in COMMON_PATTERNS

    def test_has_french_patterns(self) -> None:
        """A des patterns français."""
        assert "postal_code_fr" in COMMON_PATTERNS
        assert "siret" in COMMON_PATTERNS
        assert "siren" in COMMON_PATTERNS


class TestDetectPattern:
    """Tests de detect_pattern."""

    def test_returns_none_for_empty_list(self) -> None:
        """Retourne None pour liste vide."""
        pattern, rate = detect_pattern([])
        assert pattern is None
        assert rate is None

    def test_detects_email_pattern(self) -> None:
        """Détecte le pattern email."""
        values = ["user@example.com", "test@test.fr", "a@b.org", "x@y.io"]
        pattern, rate = detect_pattern(values)
        assert pattern == "email"
        assert rate is not None
        assert rate > 0.7

    def test_detects_uuid_pattern(self) -> None:
        """Détecte le pattern UUID."""
        values = [
            "550e8400-e29b-41d4-a716-446655440000",
            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            "123e4567-e89b-12d3-a456-426614174000",
        ]
        pattern, rate = detect_pattern(values)
        assert pattern == "uuid"

    def test_detects_url_pattern(self) -> None:
        """Détecte le pattern URL."""
        values = [
            "https://example.com",
            "http://test.fr/page",
            "https://api.service.io/v1",
        ]
        pattern, rate = detect_pattern(values)
        assert pattern == "url"

    def test_detects_date_iso_pattern(self) -> None:
        """Détecte le pattern date ISO."""
        values = ["2024-01-15", "2023-12-01", "2024-05-20"]
        pattern, rate = detect_pattern(values)
        assert pattern == "date_iso"

    def test_detects_postal_code_pattern(self) -> None:
        """Détecte le pattern code postal français."""
        values = ["75001", "69002", "33000", "13001"]
        pattern, rate = detect_pattern(values)
        assert pattern == "postal_code_fr"

    def test_no_pattern_for_random_values(self) -> None:
        """Pas de pattern pour valeurs aléatoires."""
        values = ["abc", "xyz", "123abc", "foo_bar"]
        pattern, rate = detect_pattern(values)
        assert pattern is None
        assert rate is None

    def test_requires_70_percent_match(self) -> None:
        """Requiert 70% de match minimum."""
        # 2/5 = 40% -> pas assez
        values = ["user@example.com", "test@test.fr", "not_email", "random", "text"]
        pattern, rate = detect_pattern(values)
        assert pattern is None

    def test_handles_none_values(self) -> None:
        """Gère les valeurs None."""
        values = ["user@example.com", None, "test@test.fr", None]  # type: ignore
        pattern, rate = detect_pattern(values)  # type: ignore
        # 2/4 = 50% -> pas assez mais ne crash pas
        assert pattern is None or pattern == "email"


class TestExtractColumnStats:
    """Tests de extract_column_stats."""

    def test_returns_column_metadata(self) -> None:
        """Retourne un ColumnMetadata."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0, 10)  # null_count, distinct
        conn.execute.return_value.fetchall.return_value = []

        result = extract_column_stats(conn, "test_table", "test_col", "VARCHAR", 100)
        assert isinstance(result, ColumnMetadata)
        assert result.name == "test_col"
        assert result.data_type == "VARCHAR"

    def test_calculates_null_rate(self) -> None:
        """Calcule le taux de NULL."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (20, 50)  # 20 NULLs sur 100
        conn.execute.return_value.fetchall.return_value = []

        result = extract_column_stats(conn, "t", "c", "INT", 100)
        assert result.null_count == 20
        assert result.null_rate == 0.2

    def test_calculates_unique_rate(self) -> None:
        """Calcule le taux d'unicité."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0, 80)  # 80 distinct sur 100
        conn.execute.return_value.fetchall.return_value = []

        result = extract_column_stats(conn, "t", "c", "INT", 100)
        assert result.distinct_count == 80
        assert result.unique_rate == 0.8

    def test_detects_categorical_column(self) -> None:
        """Détecte les colonnes catégorielles (<=50 valeurs distinctes)."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0, 10)  # 10 distinct
        conn.execute.return_value.fetchall.return_value = [("val1",), ("val2",)]

        result = extract_column_stats(conn, "t", "c", "VARCHAR", 100)
        assert result.is_categorical is True

    def test_non_categorical_column(self) -> None:
        """Colonnes non catégorielles (>50 valeurs distinctes)."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0, 100)  # 100 distinct
        conn.execute.return_value.fetchall.return_value = [("val1",), ("val2",)]

        result = extract_column_stats(conn, "t", "c", "VARCHAR", 100)
        assert result.is_categorical is False

    def test_extracts_sample_values(self) -> None:
        """Extrait les valeurs d'échantillon."""
        conn = MagicMock()
        base_result = MagicMock()
        base_result.fetchone.return_value = (0, 5)  # categorical

        sample_result = MagicMock()
        sample_result.fetchall.return_value = [("A",), ("B",), ("C",)]

        top_result = MagicMock()
        top_result.fetchall.return_value = [("A", 50), ("B", 30)]

        conn.execute.side_effect = [base_result, sample_result, top_result]

        result = extract_column_stats(conn, "t", "status", "VARCHAR", 100)
        assert "A" in result.sample_values

    def test_extracts_numeric_stats(self) -> None:
        """Extrait les stats numériques."""
        conn = MagicMock()
        base_result = MagicMock()
        base_result.fetchone.return_value = (0, 100)

        sample_result = MagicMock()
        sample_result.fetchall.return_value = []

        top_result = MagicMock()
        top_result.fetchall.return_value = []

        num_result = MagicMock()
        num_result.fetchone.return_value = (1.0, 100.0, 50.5, 45.0)  # min, max, avg, median

        conn.execute.side_effect = [base_result, sample_result, top_result, num_result]

        result = extract_column_stats(conn, "t", "c", "INTEGER", 100)
        assert result.value_range == "1.0 - 100.0"
        assert result.mean == 50.5
        assert result.median == 45.0

    def test_extracts_text_stats(self) -> None:
        """Extrait les stats texte."""
        conn = MagicMock()
        base_result = MagicMock()
        base_result.fetchone.return_value = (0, 100)

        sample_result = MagicMock()
        sample_result.fetchall.return_value = [("test",)]

        top_result = MagicMock()
        top_result.fetchall.return_value = []

        text_result = MagicMock()
        text_result.fetchone.return_value = (5, 255, 50.5)  # min_len, max_len, avg_len

        conn.execute.side_effect = [base_result, sample_result, top_result, text_result]

        result = extract_column_stats(conn, "t", "c", "VARCHAR", 100)
        assert result.min_length == 5
        assert result.max_length == 255
        assert result.avg_length == 50.5

    def test_handles_zero_row_count(self) -> None:
        """Gère le cas row_count=0."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = (0, 0)
        conn.execute.return_value.fetchall.return_value = []

        result = extract_column_stats(conn, "t", "c", "INT", 0)
        assert result.null_rate == 0.0
        assert result.unique_rate == 0.0

    def test_handles_db_error(self) -> None:
        """Gère les erreurs DB."""
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = None

        result = extract_column_stats(conn, "t", "c", "INT", 100)
        # Retourne des valeurs par défaut
        assert result.name == "c"
        assert result.null_count == 0


class TestExtractMetadataFromConnection:
    """Tests de extract_metadata_from_connection."""

    def test_returns_extracted_catalog(self) -> None:
        """Retourne un ExtractedCatalog."""
        conn = MagicMock()
        conn.execute.return_value.fetchall.side_effect = [
            [("table1",)],  # tables
            [("col1", "INT"), ("col2", "VARCHAR")],  # columns
        ]
        conn.execute.return_value.fetchone.side_effect = [
            (100,),  # row count
            (0, 10),  # col1 stats
            (0, 50),  # col2 stats
        ]

        with patch("catalog_engine.extraction.extract_column_stats") as mock_stats:
            mock_stats.return_value = ColumnMetadata(name="col", data_type="INT")
            result = extract_metadata_from_connection(conn)

        assert result.datasource == "g7_analytics.duckdb"

    def test_extracts_all_tables(self) -> None:
        """Extrait toutes les tables."""
        conn = MagicMock()

        tables_result = MagicMock()
        tables_result.fetchall.return_value = [("table1",), ("table2",)]

        # Mock pour table1
        row_count_1 = MagicMock()
        row_count_1.fetchone.return_value = (100,)
        cols_1 = MagicMock()
        cols_1.fetchall.return_value = [("id", "INT")]

        # Mock pour table2
        row_count_2 = MagicMock()
        row_count_2.fetchone.return_value = (200,)
        cols_2 = MagicMock()
        cols_2.fetchall.return_value = [("name", "VARCHAR")]

        conn.execute.side_effect = [
            tables_result,
            row_count_1,
            cols_1,
            row_count_2,
            cols_2,
        ]

        with patch("catalog_engine.extraction.extract_column_stats") as mock_stats:
            mock_stats.return_value = ColumnMetadata(name="col", data_type="INT")
            result = extract_metadata_from_connection(conn)

        assert len(result.tables) == 2

    def test_extracts_row_count(self) -> None:
        """Extrait le nombre de lignes."""
        conn = MagicMock()
        tables_result = MagicMock()
        tables_result.fetchall.return_value = [("users",)]

        row_result = MagicMock()
        row_result.fetchone.return_value = (5000,)

        cols_result = MagicMock()
        cols_result.fetchall.return_value = []

        conn.execute.side_effect = [tables_result, row_result, cols_result]

        result = extract_metadata_from_connection(conn)
        assert result.tables[0].row_count == 5000


class TestBuildColumnFullContext:
    """Tests de build_column_full_context."""

    def test_returns_empty_for_minimal_column(self) -> None:
        """Retourne vide pour colonne minimale."""
        col = ColumnMetadata(name="id", data_type="INTEGER")
        context = build_column_full_context(col)
        assert context == ""

    def test_includes_null_rate(self) -> None:
        """Inclut le taux de NULL."""
        col = ColumnMetadata(name="c", data_type="INT", null_rate=0.15)
        context = build_column_full_context(col)
        assert "15.0% NULL" in context

    def test_includes_distinct_count(self) -> None:
        """Inclut le nombre de valeurs distinctes."""
        col = ColumnMetadata(name="c", data_type="INT", distinct_count=50)
        context = build_column_full_context(col)
        assert "50 valeurs distinctes" in context

    def test_includes_enum_for_categorical(self) -> None:
        """Inclut ENUM pour colonnes catégorielles."""
        col = ColumnMetadata(
            name="status",
            data_type="VARCHAR",
            is_categorical=True,
            sample_values=["active", "inactive", "pending"],
        )
        context = build_column_full_context(col)
        assert "ENUM:" in context
        assert "active" in context

    def test_includes_examples_for_non_categorical(self) -> None:
        """Inclut Exemples pour colonnes non catégorielles."""
        col = ColumnMetadata(
            name="email",
            data_type="VARCHAR",
            is_categorical=False,
            sample_values=["a@b.com", "c@d.com"],
        )
        context = build_column_full_context(col)
        assert "Exemples:" in context

    def test_includes_top_values(self) -> None:
        """Inclut les top valeurs."""
        col = ColumnMetadata(
            name="country",
            data_type="VARCHAR",
            is_categorical=False,
            top_values=[
                ValueFrequency(value="France", count=50, percentage=50.0),
                ValueFrequency(value="USA", count=30, percentage=30.0),
            ],
        )
        context = build_column_full_context(col)
        assert "Top valeurs:" in context
        assert "France" in context

    def test_includes_numeric_range(self) -> None:
        """Inclut le range numérique."""
        col = ColumnMetadata(
            name="price",
            data_type="FLOAT",
            value_range="10.0 - 500.0",
            mean=100.5,
            median=85.0,
        )
        context = build_column_full_context(col)
        assert "Range: 10.0 - 500.0" in context
        assert "Moyenne: 100.50" in context
        assert "Médiane: 85.00" in context

    def test_includes_text_length_stats(self) -> None:
        """Inclut les stats de longueur texte."""
        col = ColumnMetadata(
            name="description",
            data_type="VARCHAR",
            min_length=10,
            max_length=500,
            avg_length=150.0,
        )
        context = build_column_full_context(col)
        assert "Longueur:" in context
        assert "10-500" in context
        assert "avg: 150" in context

    def test_includes_detected_pattern(self) -> None:
        """Inclut le pattern détecté."""
        col = ColumnMetadata(
            name="email",
            data_type="VARCHAR",
            detected_pattern="email",
            pattern_match_rate=0.95,
        )
        context = build_column_full_context(col)
        assert "Pattern: email" in context
        assert "95%" in context
