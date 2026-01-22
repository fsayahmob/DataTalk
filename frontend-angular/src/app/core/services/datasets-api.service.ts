import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';
import {
  Dataset,
  DatasetCreateRequest,
  DatasetsResponse,
  DatasetActivateResponse,
} from './api-types';

/**
 * Datasets API Service
 *
 * Handles all dataset-related API calls (CRUD, activation, stats).
 */
@Injectable({
  providedIn: 'root',
})
export class DatasetsApiService {
  private readonly api = inject(ApiService);

  /**
   * Fetch all datasets
   */
  getDatasets(includeStats = true): Observable<DatasetsResponse> {
    return this.api.get<DatasetsResponse>(`/api/v1/datasets?include_stats=${String(includeStats)}`);
  }

  /**
   * Get a single dataset by ID
   */
  getDataset(datasetId: string): Observable<Dataset> {
    return this.api.get<Dataset>(`/api/v1/datasets/${datasetId}`);
  }

  /**
   * Create a new dataset
   */
  createDataset(request: DatasetCreateRequest): Observable<Dataset> {
    return this.api.post<Dataset>('/api/v1/datasets', request);
  }

  /**
   * Update a dataset
   */
  updateDataset(
    datasetId: string,
    updates: { name?: string; description?: string }
  ): Observable<Dataset> {
    return this.api.patch<Dataset>(`/api/v1/datasets/${datasetId}`, updates);
  }

  /**
   * Delete a dataset
   */
  deleteDataset(datasetId: string): Observable<unknown> {
    return this.api.delete<unknown>(`/api/v1/datasets/${datasetId}`);
  }

  /**
   * Activate a dataset (make it the current active dataset)
   */
  activateDataset(datasetId: string): Observable<DatasetActivateResponse> {
    return this.api.post<DatasetActivateResponse>(`/api/v1/datasets/${datasetId}/activate`);
  }

  /**
   * Get the currently active dataset
   */
  getActiveDataset(): Observable<DatasetActivateResponse> {
    return this.api.get<DatasetActivateResponse>('/api/v1/datasets/active');
  }

  /**
   * Refresh dataset statistics from DuckDB file
   */
  refreshStats(datasetId: string): Observable<Dataset> {
    return this.api.post<Dataset>(`/api/v1/datasets/${datasetId}/refresh-stats`);
  }
}
