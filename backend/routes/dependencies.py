"""
Modèles Pydantic partagés entre les routes.
"""

from typing import Any

from pydantic import BaseModel, Field


class AnalysisFilters(BaseModel):
    """Filtres structurés pour l'analyse."""

    date_start: str | None = Field(default=None, alias="dateStart")
    date_end: str | None = Field(default=None, alias="dateEnd")
    note_min: str | None = Field(default=None, alias="noteMin")
    note_max: str | None = Field(default=None, alias="noteMax")

    model_config = {"populate_by_name": True}


class QuestionRequest(BaseModel):
    question: str
    filters: AnalysisFilters | None = None
    use_context: bool = False  # Stateless par défaut


class ChartConfig(BaseModel):
    type: str
    x: str | None = None
    y: str | list[str] | None = None  # Une ou plusieurs séries Y
    title: str = ""
    color: str | None = None


class AnalysisResponse(BaseModel):
    message: str
    sql: str
    chart: ChartConfig
    data: list[dict[str, Any]]
    # Protection chart pour gros volumes
    chart_disabled: bool = False
    chart_disabled_reason: str | None = None
    # Métadonnées de performance
    model_name: str = "unknown"
    tokens_input: int | None = None
    tokens_output: int | None = None
    response_time_ms: int | None = None


class SaveReportRequest(BaseModel):
    title: str
    question: str
    sql_query: str
    chart_config: str | None = None
    message_id: int | None = None


class SettingsUpdateRequest(BaseModel):
    # API keys par provider
    api_key: str | None = None
    provider_name: str | None = None  # google, openai, anthropic, mistral
    # Modèle par défaut
    default_model_id: str | None = None


class UpdateSettingRequest(BaseModel):
    """Requête de mise à jour d'un setting."""

    value: str


class EnrichCatalogRequest(BaseModel):
    """Requête d'enrichissement avec les IDs des tables sélectionnées."""

    table_ids: list[int] = Field(description="IDs des tables à enrichir")


class ProviderConfigRequest(BaseModel):
    base_url: str | None = None


class SetActivePromptRequest(BaseModel):
    version: str


class PromptUpdateRequest(BaseModel):
    """Requête de mise à jour d'un prompt."""

    content: str = Field(description="Contenu du prompt")
