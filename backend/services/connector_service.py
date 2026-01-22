"""
Service pour gérer les connecteurs via PyAirbyte dynamiquement.

Ce service encapsule les appels PyAirbyte pour:
- Lister les connecteurs disponibles (depuis le registry)
- Récupérer les specs de configuration (JSON Schema)
- Tester une connexion
- Découvrir le catalogue (tables/colonnes)

IMPORTANT: Pour les connecteurs courants (PostgreSQL, MySQL), on utilise des
drivers Python natifs pour éviter les problèmes de Docker-in-Docker sur macOS.
PyAirbyte est utilisé pour les autres connecteurs.
"""

import logging
from typing import Any

from i18n import t
from services.native_connectors import (
    is_native_connector,
    get_native_spec,
    test_native_connection,
    discover_native_catalog,
)

logger = logging.getLogger(__name__)

# Flag pour savoir si PyAirbyte est disponible
_AIRBYTE_AVAILABLE = False

try:
    import airbyte as ab

    _AIRBYTE_AVAILABLE = True
except ImportError:
    logger.warning("PyAirbyte not installed. Connector features will be limited.")
    ab = None  # type: ignore


# =============================================================================
# RESULT CLASSES
# =============================================================================


class ConnectionTestResult:
    """Résultat d'un test de connexion."""

    def __init__(self, success: bool, message: str, details: dict[str, Any] | None = None):
        self.success = success
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "message": self.message,
            "details": self.details,
        }


class DiscoveredStream:
    """Table/stream découvert dans la source."""

    def __init__(
        self,
        name: str,
        columns: list[dict[str, Any]],
        primary_key: list[str] | None = None,
    ):
        self.name = name
        self.columns = columns
        self.primary_key = primary_key or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "columns": self.columns,
            "primary_key": self.primary_key,
        }


class DiscoverResult:
    """Résultat de la découverte de catalogue."""

    def __init__(self, success: bool, streams: list[DiscoveredStream], error: str | None = None):
        self.success = success
        self.streams = streams
        self.error = error

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "streams": [s.to_dict() for s in self.streams],
            "stream_count": len(self.streams),
            "error": self.error,
        }


class ConnectorInfo:
    """Information sur un connecteur."""

    def __init__(
        self,
        name: str,
        latest_version: str | None = None,
        pypi_package_name: str | None = None,
        language: str | None = None,
    ):
        self.name = name
        self.latest_version = latest_version
        self.pypi_package_name = pypi_package_name
        self.language = language

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "latest_version": self.latest_version,
            "pypi_package_name": self.pypi_package_name,
            "language": self.language,
        }


# =============================================================================
# CONNECTOR LISTING (Dynamic from PyAirbyte registry)
# =============================================================================


def list_available_connectors() -> list[dict[str, Any]]:
    """
    Liste tous les connecteurs disponibles depuis le registry PyAirbyte.

    Returns:
        Liste des connecteurs avec leurs métadonnées
    """
    if not _AIRBYTE_AVAILABLE:
        logger.warning("PyAirbyte not available, returning empty connector list")
        return []

    try:
        # Récupère la liste depuis le registry (cache local, pas d'install)
        connectors = ab.get_available_connectors()

        result = []
        seen_ids = set()

        for connector in connectors:
            # PyAirbyte peut retourner des strings ou des objets ConnectorMetadata
            if isinstance(connector, str):
                # C'est un string (ex: "source-postgres")
                connector_name = connector
                connector_id = connector_name.replace("source-", "")
                seen_ids.add(connector_id)
                result.append({
                    "id": connector_id,
                    "name": _format_connector_name(connector_id),
                    "pypi_package": None,
                    "latest_version": None,
                    "language": None,
                    "category": _infer_category(connector_id),
                })
            else:
                # C'est un objet ConnectorMetadata avec attributs
                connector_id = connector.name.replace("source-", "")
                seen_ids.add(connector_id)
                result.append({
                    "id": connector_id,
                    "name": _format_connector_name(connector_id),
                    "pypi_package": getattr(connector, "pypi_package_name", None),
                    "latest_version": getattr(connector, "latest_version", None),
                    "language": getattr(connector, "language", None),
                    "category": _infer_category(connector_id),
                })

        # Trier par nom
        result.sort(key=lambda x: x["name"])
        return result

    except Exception as e:
        logger.exception("Failed to list connectors from PyAirbyte registry")
        return []


def get_connector_spec(connector_id: str) -> dict[str, Any] | None:
    """
    Récupère le JSON Schema de configuration d'un connecteur.

    Utilise les connecteurs natifs (PostgreSQL, MySQL) en priorité pour éviter
    les problèmes de Docker-in-Docker. Fallback sur PyAirbyte pour les autres.

    Args:
        connector_id: ID du connecteur (ex: "postgres", "mysql")

    Returns:
        JSON Schema pour le formulaire de configuration, ou None si erreur
    """
    # Priorité aux connecteurs natifs (pas de Docker-in-Docker)
    if is_native_connector(connector_id):
        logger.info("Using native connector spec for: %s", connector_id)
        return get_native_spec(connector_id)

    # Fallback PyAirbyte pour les autres connecteurs
    if not _AIRBYTE_AVAILABLE:
        logger.warning("PyAirbyte not available, cannot get connector spec")
        return None

    try:
        source_name = f"source-{connector_id}"
        logger.info("Getting spec for connector via PyAirbyte: %s", source_name)

        source = ab.get_source(
            source_name,
            config={},
            install_if_missing=True,
            docker_image=False,
        )

        spec = source.config_spec
        return spec

    except Exception as e:
        logger.exception("Failed to get spec for connector %s", connector_id)
        return None


# =============================================================================
# CONNECTION TESTING
# =============================================================================


def test_connection(connector_id: str, config: dict[str, Any]) -> ConnectionTestResult:
    """
    Teste une connexion à une source de données.

    Utilise les connecteurs natifs en priorité pour éviter Docker-in-Docker.

    Args:
        connector_id: Type de connecteur (postgres, mysql, csv...)
        config: Configuration de connexion

    Returns:
        ConnectionTestResult avec success/message
    """
    # Priorité aux connecteurs natifs
    if is_native_connector(connector_id):
        logger.info("Testing connection with native connector: %s", connector_id)
        success, message = test_native_connection(connector_id, config)
        return ConnectionTestResult(
            success=success,
            message=message if success else t("connector.connection_error", error=message),
            details={"connector": connector_id, "native": True},
        )

    # Fallback PyAirbyte
    if not _AIRBYTE_AVAILABLE:
        return ConnectionTestResult(
            success=False,
            message=t("connector.airbyte_unavailable"),
        )

    try:
        source_name = f"source-{connector_id}"
        logger.info("Testing connection via PyAirbyte: %s", source_name)

        source = ab.get_source(
            source_name,
            config=config,
            install_if_missing=True,
            docker_image=False,
        )

        source.check()

        return ConnectionTestResult(
            success=True,
            message=t("connector.connection_success", connector_id=connector_id),
            details={"connector": connector_id},
        )

    except Exception as e:
        logger.exception("Connection test failed for %s", connector_id)
        return ConnectionTestResult(
            success=False,
            message=t("connector.connection_error", error=str(e)),
            details={"connector": connector_id, "error": str(e)},
        )


# =============================================================================
# CATALOG DISCOVERY
# =============================================================================


def discover_catalog(connector_id: str, config: dict[str, Any]) -> DiscoverResult:
    """
    Découvre le catalogue (tables/colonnes) d'une source.

    Utilise les connecteurs natifs en priorité pour éviter Docker-in-Docker.

    Args:
        connector_id: Type de connecteur
        config: Configuration de connexion

    Returns:
        DiscoverResult avec la liste des streams
    """
    # Priorité aux connecteurs natifs
    if is_native_connector(connector_id):
        logger.info("Discovering catalog with native connector: %s", connector_id)
        try:
            native_streams = discover_native_catalog(connector_id, config)
            streams = [
                DiscoveredStream(
                    name=s["name"],
                    columns=s["columns"],
                    primary_key=s.get("primary_key", []),
                )
                for s in native_streams
            ]
            logger.info("Discovered %d streams for %s (native)", len(streams), connector_id)
            return DiscoverResult(success=True, streams=streams)
        except Exception as e:
            logger.exception("Native catalog discovery failed for %s", connector_id)
            return DiscoverResult(success=False, streams=[], error=str(e))

    # Fallback PyAirbyte
    if not _AIRBYTE_AVAILABLE:
        return DiscoverResult(
            success=False,
            streams=[],
            error=t("connector.airbyte_unavailable"),
        )

    try:
        source_name = f"source-{connector_id}"
        logger.info("Discovering catalog via PyAirbyte: %s", source_name)

        source = ab.get_source(
            source_name,
            config=config,
            install_if_missing=True,
            docker_image=False,
        )

        catalog = source.discovered_catalog

        streams = []
        for stream_name, stream_info in catalog.streams.items():
            columns = _extract_columns_from_schema(stream_info.stream.json_schema)

            primary_key = []
            if stream_info.stream.source_defined_primary_key:
                primary_key = [
                    ".".join(pk) for pk in stream_info.stream.source_defined_primary_key
                ]

            streams.append(DiscoveredStream(
                name=stream_name,
                columns=columns,
                primary_key=primary_key,
            ))

        logger.info("Discovered %d streams for %s", len(streams), connector_id)

        return DiscoverResult(
            success=True,
            streams=streams,
        )

    except Exception as e:
        logger.exception("Catalog discovery failed for %s", connector_id)
        return DiscoverResult(
            success=False,
            streams=[],
            error=str(e),
        )


# =============================================================================
# HELPERS
# =============================================================================


def _format_connector_name(connector_id: str) -> str:
    """
    Formate l'ID du connecteur en nom lisible.

    Ex: "postgres" -> "PostgreSQL", "google-sheets" -> "Google Sheets"
    """
    name_mapping = {
        "postgres": "PostgreSQL",
        "mysql": "MySQL",
        "mongodb": "MongoDB",
        "bigquery": "Google BigQuery",
        "snowflake": "Snowflake",
        "redshift": "Amazon Redshift",
        "s3": "Amazon S3",
        "gcs": "Google Cloud Storage",
        "salesforce": "Salesforce",
        "hubspot": "HubSpot",
        "stripe": "Stripe",
        "shopify": "Shopify",
        "facebook-marketing": "Facebook Marketing",
        "google-analytics": "Google Analytics",
        "google-ads": "Google Ads",
        "google-sheets": "Google Sheets",
        "airtable": "Airtable",
        "notion": "Notion",
        "github": "GitHub",
        "gitlab": "GitLab",
        "jira": "Jira",
        "zendesk": "Zendesk",
        "intercom": "Intercom",
        "mailchimp": "Mailchimp",
        "twilio": "Twilio",
        "slack": "Slack",
        "asana": "Asana",
        "trello": "Trello",
        "linkedin-ads": "LinkedIn Ads",
        "twitter": "Twitter",
        "instagram": "Instagram",
        "tiktok-marketing": "TikTok Marketing",
        "oracle": "Oracle",
        "mssql": "Microsoft SQL Server",
        "mariadb": "MariaDB",
        "cockroachdb": "CockroachDB",
        "clickhouse": "ClickHouse",
        "elasticsearch": "Elasticsearch",
        "dynamodb": "Amazon DynamoDB",
        "firebase-realtime-database": "Firebase Realtime Database",
        "amplitude": "Amplitude",
        "mixpanel": "Mixpanel",
        "segment": "Segment",
        "chargebee": "Chargebee",
        "recurly": "Recurly",
        "zuora": "Zuora",
        "netsuite": "NetSuite",
        "quickbooks": "QuickBooks",
        "xero": "Xero",
        "csv": "CSV File",
        "file": "Local File",
        "http": "HTTP API",
    }

    if connector_id in name_mapping:
        return name_mapping[connector_id]

    # Fallback: capitalize et remplacer les tirets
    return connector_id.replace("-", " ").title()


def _infer_category(connector_id: str) -> str:
    """
    Déduit la catégorie d'un connecteur depuis son ID.
    """
    databases = {
        "postgres", "mysql", "mongodb", "mssql", "oracle", "mariadb",
        "cockroachdb", "clickhouse", "elasticsearch", "dynamodb",
        "firebase-realtime-database", "redis", "cassandra", "couchbase",
    }
    cloud_dw = {
        "bigquery", "snowflake", "redshift", "databricks", "azure-synapse",
    }
    cloud_storage = {
        "s3", "gcs", "azure-blob-storage", "sftp", "ftp",
    }
    crm = {
        "salesforce", "hubspot", "pipedrive", "zoho-crm", "close-com",
    }
    marketing = {
        "facebook-marketing", "google-ads", "google-analytics", "linkedin-ads",
        "twitter-ads", "tiktok-marketing", "snapchat-marketing", "pinterest-ads",
        "mailchimp", "klaviyo", "braze", "amplitude", "mixpanel", "segment",
    }
    ecommerce = {
        "shopify", "stripe", "square", "woocommerce", "magento", "bigcommerce",
        "chargebee", "recurly", "zuora",
    }
    productivity = {
        "google-sheets", "airtable", "notion", "asana", "trello", "monday",
        "slack", "jira", "github", "gitlab", "confluence", "zendesk", "intercom",
    }
    files = {
        "csv", "file", "parquet", "json", "excel",
    }
    finance = {
        "quickbooks", "xero", "netsuite", "sage",
    }

    if connector_id in databases:
        return "database"
    if connector_id in cloud_dw:
        return "data_warehouse"
    if connector_id in cloud_storage:
        return "storage"
    if connector_id in crm:
        return "crm"
    if connector_id in marketing:
        return "marketing"
    if connector_id in ecommerce:
        return "ecommerce"
    if connector_id in productivity:
        return "productivity"
    if connector_id in files:
        return "file"
    if connector_id in finance:
        return "finance"

    return "other"


def _extract_columns_from_schema(json_schema: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extrait la liste des colonnes depuis un JSON Schema Airbyte.
    """
    columns = []

    properties = json_schema.get("properties", {})
    required = set(json_schema.get("required", []))

    for col_name, col_schema in properties.items():
        col_type = col_schema.get("type", "string")

        # Gérer les types array (ex: ["string", "null"])
        if isinstance(col_type, list):
            col_type = next((t for t in col_type if t != "null"), "string")

        columns.append({
            "name": col_name,
            "type": col_type,
            "nullable": col_name not in required,
            "description": col_schema.get("description"),
        })

    return columns


def is_airbyte_available() -> bool:
    """Vérifie si PyAirbyte est disponible."""
    return _AIRBYTE_AVAILABLE
