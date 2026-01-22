// API functions for datasources management

import {
  API_BASE,
  apiFetch,
  Datasource,
  DatasourcesResponse,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

import { SyncMode, IngestionCatalog } from "./types";

export interface CreateDatasourceRequest {
  name: string;
  dataset_id: string;
  source_type: string;
  description?: string;
  sync_config?: Record<string, unknown>;
  sync_mode?: SyncMode;
  ingestion_catalog?: IngestionCatalog;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Create a new datasource
 */
export async function createDatasource(request: CreateDatasourceRequest): Promise<Datasource> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to create datasource");
  }

  return data;
}

/**
 * Fetch all datasources, optionally filtered by dataset
 */
export async function fetchDatasources(datasetId?: string): Promise<DatasourcesResponse> {
  const url = datasetId
    ? `${API_BASE}/api/v1/datasources?dataset_id=${datasetId}`
    : `${API_BASE}/api/v1/datasources`;

  const res = await apiFetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch datasources");
  }

  return data;
}

/**
 * Get a single datasource by ID
 */
export async function fetchDatasource(datasourceId: number): Promise<Datasource> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasources/${datasourceId}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Datasource not found");
  }

  return data;
}

/**
 * Update a datasource
 */
export interface UpdateDatasourceRequest {
  name?: string;
  description?: string;
  sync_mode?: SyncMode;
  ingestion_catalog?: IngestionCatalog;
}

export async function updateDatasource(
  datasourceId: number,
  request: UpdateDatasourceRequest
): Promise<Datasource> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasources/${datasourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to update datasource");
  }

  return data;
}

/**
 * Delete a datasource
 */
export async function deleteDatasource(datasourceId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasources/${datasourceId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to delete datasource");
  }
}

/**
 * Response from triggering a sync
 */
export interface TriggerSyncResponse {
  message: string;
  datasource_id: number;
  task_id: string;
  job_id: number;
  run_id: string;
  status: string;
}

/**
 * Trigger a sync for a datasource
 */
export async function triggerDatasourceSync(
  datasourceId: number
): Promise<TriggerSyncResponse> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasources/${datasourceId}/sync`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to trigger sync");
  }

  return data;
}
