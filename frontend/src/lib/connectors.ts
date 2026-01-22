/**
 * Centralized connector configuration.
 *
 * Single source of truth for connector display names and metadata.
 */

export const CONNECTOR_NAMES: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  "google-sheets": "Google Sheets",
  csv: "CSV",
  bigquery: "BigQuery",
  snowflake: "Snowflake",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  s3: "Amazon S3",
  gcs: "Google Cloud Storage",
  redshift: "Amazon Redshift",
  mssql: "SQL Server",
  oracle: "Oracle",
  sqlite: "SQLite",
  duckdb: "DuckDB",
};

/**
 * Get display name for a connector type.
 *
 * Falls back to title-cased type if not found in mapping.
 */
export function getConnectorName(type: string): string {
  if (CONNECTOR_NAMES[type]) {
    return CONNECTOR_NAMES[type];
  }
  // Fallback: title case with hyphen replaced by space
  return type
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
