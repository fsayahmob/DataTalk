import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  CatalogResponse,
  CatalogGenerateResponse,
  CatalogExtractResponse,
  CatalogEnrichResponse,
  ToggleTableResponse,
  RunResponse,
  RunsResponse,
  CatalogJobsResponse,
} from './api-types';

/**
 * Catalog API Service
 *
 * Handles all catalog-related API calls (CRUD, extraction, enrichment, jobs).
 */
@Injectable({
  providedIn: 'root',
})
export class CatalogApiService {
  private readonly api = inject(ApiService);

  // ============ Catalog CRUD ============

  /**
   * Fetch the full catalog
   */
  getCatalog(): Observable<CatalogResponse | null> {
    return this.api.get<CatalogResponse>('/catalog').pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Generate catalog (extract + enrich)
   */
  generateCatalog(): Observable<CatalogGenerateResponse | null> {
    return this.api.post<CatalogGenerateResponse>('/catalog/generate').pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Extract catalog (metadata only)
   */
  extractCatalog(): Observable<CatalogExtractResponse | null> {
    return this.api.post<CatalogExtractResponse>('/catalog/extract').pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Enrich catalog with LLM
   */
  enrichCatalog(tableIds: number[]): Observable<CatalogEnrichResponse | null> {
    return this.api.post<CatalogEnrichResponse>('/catalog/enrich', { table_ids: tableIds }).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Delete catalog
   */
  deleteCatalog(): Observable<boolean> {
    return this.api.delete<boolean>('/catalog').pipe(
      catchError(() => of(false))
    );
  }

  // ============ Table Management ============

  /**
   * Toggle table enabled/disabled
   */
  toggleTableEnabled(tableId: number): Observable<ToggleTableResponse | null> {
    return this.api.patch<ToggleTableResponse>(`/catalog/tables/${String(tableId)}/toggle`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Update column description
   */
  updateColumnDescription(columnId: number, description: string): Observable<boolean> {
    return this.api.patch<boolean>(
      `/catalog/columns/${String(columnId)}/description`,
      { description }
    ).pipe(
      catchError(() => of(false))
    );
  }

  // ============ Catalog Jobs & Runs ============

  /**
   * Fetch latest run
   */
  getLatestRun(): Observable<RunResponse> {
    return this.api.get<RunResponse>('/catalog/latest-run').pipe(
      catchError(() => of({ run: [] }))
    );
  }

  /**
   * Fetch a specific run by ID
   */
  getRun(runId: string): Observable<RunResponse> {
    return this.api.get<RunResponse>(`/catalog/run/${runId}`).pipe(
      catchError(() => of({ run: [] }))
    );
  }

  /**
   * Fetch all runs
   */
  getRuns(): Observable<RunsResponse> {
    return this.api.get<RunsResponse>('/catalog/runs').pipe(
      catchError(() => of({ runs: [] }))
    );
  }

  /**
   * Fetch catalog jobs
   */
  getJobs(limit = 50): Observable<CatalogJobsResponse> {
    return this.api.get<CatalogJobsResponse>(`/catalog/jobs?limit=${String(limit)}`).pipe(
      catchError(() => of({ jobs: [] }))
    );
  }
}
