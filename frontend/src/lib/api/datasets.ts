// API functions for datasets management

import { API_BASE, apiFetch, Dataset, DatasetCreateRequest, DatasetsResponse } from "./types";

/**
 * Fetch all datasets
 */
export async function fetchDatasets(includeStats = true): Promise<DatasetsResponse> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets?include_stats=${includeStats}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch datasets");
  }

  return data;
}

/**
 * Get a single dataset by ID
 */
export async function fetchDataset(datasetId: string): Promise<Dataset> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Dataset not found");
  }

  return data;
}

/**
 * Create a new dataset
 */
export async function createDataset(request: DatasetCreateRequest): Promise<Dataset> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to create dataset");
  }

  return data;
}

/**
 * Update a dataset
 */
export async function updateDataset(
  datasetId: string,
  updates: { name?: string; description?: string }
): Promise<Dataset> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to update dataset");
  }

  return data;
}

/**
 * Delete a dataset
 */
export async function deleteDataset(datasetId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to delete dataset");
  }
}

/**
 * Activate a dataset (make it the current active dataset)
 */
export async function activateDataset(datasetId: string): Promise<Dataset> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}/activate`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to activate dataset");
  }

  return data.dataset;
}

/**
 * Get the currently active dataset
 */
export async function fetchActiveDataset(): Promise<Dataset | null> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/active`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch active dataset");
  }

  return data.dataset || null;
}

/**
 * Refresh dataset statistics from DuckDB file
 */
export async function refreshDatasetStats(datasetId: string): Promise<Dataset> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}/refresh-stats`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to refresh stats");
  }

  return data;
}

/**
 * Check if a sync is running on the dataset
 */
export async function checkDatasetSyncStatus(datasetId: string): Promise<{ is_syncing: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/v1/datasets/${datasetId}/sync-status`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to check sync status");
  }

  return data;
}
