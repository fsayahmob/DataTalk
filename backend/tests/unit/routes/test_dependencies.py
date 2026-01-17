"""Tests pour routes/dependencies.py - Modèles Pydantic partagés."""

import pytest
from pydantic import ValidationError

from routes.dependencies import (
    AnalysisFilters,
    AnalysisResponse,
    ChartConfig,
    EnrichCatalogRequest,
    PromptUpdateRequest,
    ProviderConfigRequest,
    QuestionRequest,
    SaveReportRequest,
    SetActivePromptRequest,
    SettingsUpdateRequest,
    UpdateSettingRequest,
)


class TestAnalysisFilters:
    """Tests de AnalysisFilters."""

    def test_all_fields_optional(self) -> None:
        """Tous les champs sont optionnels."""
        filters = AnalysisFilters()
        assert filters.date_start is None
        assert filters.date_end is None
        assert filters.note_min is None
        assert filters.note_max is None

    def test_accepts_camel_case_alias(self) -> None:
        """Accepte les alias camelCase."""
        filters = AnalysisFilters(dateStart="2024-01-01", dateEnd="2024-12-31")
        assert filters.date_start == "2024-01-01"
        assert filters.date_end == "2024-12-31"

    def test_accepts_snake_case(self) -> None:
        """Accepte aussi snake_case."""
        filters = AnalysisFilters(date_start="2024-01-01", note_min="3")
        assert filters.date_start == "2024-01-01"
        assert filters.note_min == "3"


class TestQuestionRequest:
    """Tests de QuestionRequest."""

    def test_question_required(self) -> None:
        """Le champ question est requis."""
        with pytest.raises(ValidationError):
            QuestionRequest()

    def test_defaults(self) -> None:
        """Valeurs par défaut correctes."""
        request = QuestionRequest(question="Test?")
        assert request.question == "Test?"
        assert request.filters is None
        assert request.use_context is False

    def test_with_filters(self) -> None:
        """Peut inclure des filtres."""
        request = QuestionRequest(
            question="Test?", filters=AnalysisFilters(date_start="2024-01-01")
        )
        assert request.filters is not None
        assert request.filters.date_start == "2024-01-01"


class TestChartConfig:
    """Tests de ChartConfig."""

    def test_type_required(self) -> None:
        """Le type est requis."""
        with pytest.raises(ValidationError):
            ChartConfig()

    def test_defaults(self) -> None:
        """Valeurs par défaut correctes."""
        config = ChartConfig(type="bar")
        assert config.type == "bar"
        assert config.x is None
        assert config.y is None
        assert config.title == ""
        assert config.color is None

    def test_y_can_be_list(self) -> None:
        """Y peut être une liste (multi-séries)."""
        config = ChartConfig(type="line", y=["col1", "col2"])
        assert config.y == ["col1", "col2"]


class TestAnalysisResponse:
    """Tests de AnalysisResponse."""

    def test_required_fields(self) -> None:
        """Champs requis correctement."""
        response = AnalysisResponse(
            message="Test",
            sql="SELECT 1",
            chart=ChartConfig(type="none"),
            data=[],
        )
        assert response.message == "Test"
        assert response.sql == "SELECT 1"
        assert response.chart.type == "none"
        assert response.data == []

    def test_optional_fields_defaults(self) -> None:
        """Champs optionnels ont les bonnes valeurs par défaut."""
        response = AnalysisResponse(
            message="Test",
            sql="SELECT 1",
            chart=ChartConfig(type="bar"),
            data=[],
        )
        assert response.chart_disabled is False
        assert response.chart_disabled_reason is None
        assert response.model_name == "unknown"
        assert response.tokens_input is None


class TestSaveReportRequest:
    """Tests de SaveReportRequest."""

    def test_required_fields(self) -> None:
        """Champs requis."""
        with pytest.raises(ValidationError):
            SaveReportRequest()

    def test_valid_request(self) -> None:
        """Requête valide."""
        request = SaveReportRequest(
            title="Mon rapport",
            question="Quelle est la note moyenne?",
            sql_query="SELECT AVG(note) FROM evaluations",
        )
        assert request.title == "Mon rapport"
        assert request.chart_config is None
        assert request.message_id is None


class TestSettingsUpdateRequest:
    """Tests de SettingsUpdateRequest."""

    def test_all_optional(self) -> None:
        """Tous les champs optionnels."""
        request = SettingsUpdateRequest()
        assert request.api_key is None
        assert request.provider_name is None
        assert request.default_model_id is None


class TestUpdateSettingRequest:
    """Tests de UpdateSettingRequest."""

    def test_value_required(self) -> None:
        """Value est requis."""
        with pytest.raises(ValidationError):
            UpdateSettingRequest()

    def test_valid(self) -> None:
        """Requête valide."""
        request = UpdateSettingRequest(value="compact")
        assert request.value == "compact"


class TestEnrichCatalogRequest:
    """Tests de EnrichCatalogRequest."""

    def test_table_ids_required(self) -> None:
        """table_ids est requis."""
        with pytest.raises(ValidationError):
            EnrichCatalogRequest()

    def test_valid(self) -> None:
        """Requête valide."""
        request = EnrichCatalogRequest(table_ids=[1, 2, 3])
        assert request.table_ids == [1, 2, 3]


class TestProviderConfigRequest:
    """Tests de ProviderConfigRequest."""

    def test_base_url_optional(self) -> None:
        """base_url est optionnel."""
        request = ProviderConfigRequest()
        assert request.base_url is None

    def test_with_base_url(self) -> None:
        """Avec base_url."""
        request = ProviderConfigRequest(base_url="http://localhost:11434")
        assert request.base_url == "http://localhost:11434"


class TestSetActivePromptRequest:
    """Tests de SetActivePromptRequest."""

    def test_version_required(self) -> None:
        """version est requis."""
        with pytest.raises(ValidationError):
            SetActivePromptRequest()

    def test_valid(self) -> None:
        """Requête valide."""
        request = SetActivePromptRequest(version="v2")
        assert request.version == "v2"


class TestPromptUpdateRequest:
    """Tests de PromptUpdateRequest."""

    def test_content_required(self) -> None:
        """content est requis."""
        with pytest.raises(ValidationError):
            PromptUpdateRequest()

    def test_valid(self) -> None:
        """Requête valide."""
        request = PromptUpdateRequest(content="New prompt content")
        assert request.content == "New prompt content"
