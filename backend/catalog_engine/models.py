"""
Modèles Pydantic pour le catalogue.

Définit les structures de données utilisées par tous les autres modules.
"""

from typing import Any

from pydantic import BaseModel, Field
from pydantic_core import PydanticUndefined


# =============================================================================
# MODÈLES DE BASE (EXTRACTION)
# =============================================================================


class ValueFrequency(BaseModel):
    """Valeur avec sa fréquence d'apparition."""

    value: str
    count: int
    percentage: float


class ColumnMetadata(BaseModel):
    """
    Métadonnées d'une colonne extraites de la DB.

    Inspiré des data catalogs professionnels (dbt, DataHub, Amundsen):
    - Statistiques de base (null_rate, cardinality)
    - Distribution des valeurs (top_values avec fréquences)
    - Patterns détectés (email, UUID, etc.)
    - Statistiques sur les longueurs (pour VARCHAR)
    """

    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False

    # Statistiques de base
    null_count: int = 0
    null_rate: float = 0.0  # % de NULL (0.0 à 1.0)
    distinct_count: int = 0  # Cardinalité
    unique_rate: float = 0.0  # % de valeurs uniques (0.0 à 1.0)

    # Valeurs
    sample_values: list[str] = []  # Échantillon ou toutes valeurs si catégoriel
    top_values: list[ValueFrequency] = []  # Top 10 valeurs avec fréquences
    is_categorical: bool = False  # True si colonne catégorielle (≤50 valeurs distinctes)

    # Range et statistiques numériques
    value_range: str | None = None  # "min - max" pour numériques
    mean: float | None = None  # Moyenne (numériques)
    median: float | None = None  # Médiane (numériques)

    # Statistiques texte (VARCHAR)
    min_length: int | None = None
    max_length: int | None = None
    avg_length: float | None = None

    # Patterns détectés
    detected_pattern: str | None = None  # ex: "email", "uuid", "phone", "date", "url"
    pattern_match_rate: float | None = None  # % de valeurs matchant le pattern

    # Relations potentielles
    potential_fk_table: str | None = None  # Table référencée potentielle
    potential_fk_column: str | None = None  # Colonne référencée potentielle


class TableMetadata(BaseModel):
    """Métadonnées d'une table extraites de la DB."""

    name: str
    row_count: int
    columns: list[ColumnMetadata]


class ExtractedCatalog(BaseModel):
    """Catalogue complet extrait de la DB."""

    datasource: str
    tables: list[TableMetadata]


# =============================================================================
# MODÈLES DE VALIDATION
# =============================================================================


class CatalogValidationResult:
    """Résultat de validation du catalogue complet."""

    def __init__(self) -> None:
        self.tables_ok = 0
        self.tables_warning = 0
        self.columns_ok = 0
        self.columns_warning = 0
        self.synonyms_total = 0
        self.issues: list[str] = []

    @property
    def status(self) -> str:
        """Retourne OK si tout est bon, WARNING sinon."""
        if self.tables_warning == 0 and self.columns_warning == 0:
            return "OK"
        return "WARNING"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "tables": {"ok": self.tables_ok, "warning": self.tables_warning},
            "columns": {"ok": self.columns_ok, "warning": self.columns_warning},
            "synonyms": self.synonyms_total,
            "issues": self.issues,
        }


# =============================================================================
# MODÈLES KPI
# =============================================================================


class KpiDefinition(BaseModel):
    """Définition d'un KPI généré par le LLM (KpiCompactData)."""

    id: str = Field(description="Slug unique (ex: 'total-evaluations')")
    title: str = Field(description="Titre du KPI (max 20 caractères)")
    sql_value: str = Field(description="Requête SQL pour la valeur actuelle (1 ligne)")
    sql_trend: str = Field(description="Requête SQL pour la valeur de comparaison (1 ligne)")
    sql_sparkline: str = Field(description="Requête SQL pour l'historique (12-15 lignes)")
    sparkline_type: str = Field(default="area", description="Type de sparkline: area ou bar")
    footer: str = Field(description="Texte explicatif avec la période")
    trend_label: str | None = Field(
        default=None, description="Label de tendance (ex: 'vs 1ère quinzaine')"
    )
    invert_trend: bool = Field(
        default=False,
        description="Si true, baisse=positif (vert), hausse=négatif (rouge). Ex: taux d'erreur, insatisfaction",
    )

    @classmethod
    def get_fields_description(cls) -> str:
        """
        Génère automatiquement la description des champs pour le prompt LLM.
        Extrait les infos du modèle Pydantic (nom, type, description, défaut).
        """
        lines = []
        for field_name, field_info in cls.model_fields.items():
            # Type du champ
            annotation = field_info.annotation
            if annotation is None:
                type_str = "Any"
            elif hasattr(annotation, "__origin__"):  # Pour Union, Optional, etc.
                type_str = str(annotation).replace("typing.", "")
            else:
                type_str = getattr(annotation, "__name__", str(annotation))

            # Description
            desc = field_info.description or "Non documenté"

            # Valeur par défaut (ignorer PydanticUndefined = champ obligatoire)
            default = field_info.default
            if default is not None and default is not PydanticUndefined:
                default_str = f" (défaut: {default})"
            else:
                default_str = ""

            lines.append(f"- {field_name}: {type_str}{default_str} - {desc}")

        return "\n".join(lines)


class KpisGenerationResult(BaseModel):
    """Résultat de la génération de KPIs."""

    kpis: list[KpiDefinition] = Field(description="Liste des 4 KPIs")


class KpiValidationResult(BaseModel):
    """Résultat de la validation d'un KPI."""

    kpi_id: str
    status: str  # "OK" ou "WARNING"
    issues: list[str] = []
