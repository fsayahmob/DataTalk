// API functions for connectors management (PyAirbyte dynamic)

import { API_BASE, apiFetch } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface Connector {
  id: string;
  name: string;
  category: string;
  pypi_package: string | null;
  latest_version: string | null;
  language: string | null;
}

export interface ConnectorCategory {
  id: string;
  name: string;
  count: number;
}

export interface ConnectorsResponse {
  connectors: Connector[];
  count: number;
  airbyte_available: boolean;
}

export interface CategoriesResponse {
  categories: ConnectorCategory[];
  total_connectors: number;
}

export interface ConnectorSpec {
  connector_id: string;
  config_schema: Record<string, unknown>;
}

export interface TestConnectionRequest {
  connector_id: string;
  config: Record<string, unknown>;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiscoveredColumn {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}

export interface ForeignKeyInfo {
  column: string;
  references_table: string;
  references_column: string;
}

export interface DiscoveredStream {
  schema?: string;
  name: string;
  columns: DiscoveredColumn[];
  primary_key?: string[];
  foreign_keys?: ForeignKeyInfo[];
  row_count?: number;
}

export interface DiscoverResponse {
  success: boolean;
  streams: DiscoveredStream[];
  tables?: DiscoveredStream[]; // Alias for streams
  stream_count: number;
  error?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch all available connectors from PyAirbyte registry
 */
export async function fetchConnectors(category?: string): Promise<ConnectorsResponse> {
  const url = category
    ? `${API_BASE}/api/v1/connectors?category=${encodeURIComponent(category)}`
    : `${API_BASE}/api/v1/connectors`;

  const res = await apiFetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch connectors");
  }

  return data;
}

/**
 * Fetch connector categories with counts
 */
export async function fetchConnectorCategories(): Promise<CategoriesResponse> {
  const res = await apiFetch(`${API_BASE}/api/v1/connectors/categories`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch categories");
  }

  return data;
}

/**
 * Get the JSON Schema spec for a specific connector
 * This can take time as it may need to install the connector
 */
export async function fetchConnectorSpec(connectorId: string): Promise<ConnectorSpec> {
  const res = await apiFetch(`${API_BASE}/api/v1/connectors/${connectorId}/spec`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch connector spec");
  }

  return data;
}

/**
 * Test a connection with given config
 */
export async function testConnection(
  connectorId: string,
  config: Record<string, unknown>
): Promise<TestConnectionResponse> {
  const res = await apiFetch(`${API_BASE}/api/v1/connectors/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: connectorId, config }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Connection test failed");
  }

  return data;
}

/**
 * Discover catalog (tables/columns) for a source
 * Returns discovered tables with schema, columns, FK, and row counts
 */
export async function discoverCatalog(
  connectorId: string,
  config: Record<string, unknown>
): Promise<{ tables: DiscoveredStream[]; stream_count: number }> {
  const res = await apiFetch(`${API_BASE}/api/v1/connectors/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: connectorId, config }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Catalog discovery failed");
  }

  // Normalize response - backend may return `streams` or `tables`
  return {
    tables: data.tables || data.streams || [],
    stream_count: data.stream_count || data.tables?.length || data.streams?.length || 0,
  };
}

/**
 * Check if PyAirbyte is available
 */
export async function checkAirbyteStatus(): Promise<{ airbyte_available: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/v1/connectors/status`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to check Airbyte status");
  }

  return data;
}
