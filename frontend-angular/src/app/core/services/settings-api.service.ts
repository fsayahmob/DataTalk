import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  CatalogContextMode,
  DatabaseStatus,
  SettingValue,
  DuckdbPathResponse,
} from './api-types';

/**
 * Settings API Service
 *
 * Handles all settings-related API calls.
 */
@Injectable({
  providedIn: 'root',
})
export class SettingsApiService {
  private readonly api = inject(ApiService);

  // ============ Catalog Context Mode ============

  /**
   * Get catalog context mode
   */
  getCatalogContextMode(): Observable<CatalogContextMode> {
    return this.api.get<SettingValue>('/settings/catalog_context_mode').pipe(
      map((data) => data.value as CatalogContextMode),
      catchError(() => of('full' as CatalogContextMode))
    );
  }

  /**
   * Set catalog context mode
   */
  setCatalogContextMode(mode: CatalogContextMode): Observable<boolean> {
    return this.api.put<unknown>('/settings/catalog_context_mode', { value: mode }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // ============ Database Status ============

  /**
   * Get database status
   */
  getDatabaseStatus(): Observable<DatabaseStatus | null> {
    return this.api.get<DatabaseStatus>('/database/status').pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Set DuckDB path
   */
  setDuckdbPath(path: string): Observable<DuckdbPathResponse> {
    return this.api.put<{ resolved_path?: string }>('/settings/duckdb_path', { value: path }).pipe(
      map((data) => ({ success: true, resolved_path: data.resolved_path })),
      catchError((error: Error) => of({ success: false, error: error.message }))
    );
  }

  // ============ Catalog Settings ============

  /**
   * Get max tables per batch
   */
  getMaxTablesPerBatch(): Observable<number> {
    return this.api.get<SettingValue>('/settings/max_tables_per_batch').pipe(
      map((data) => parseInt(data.value, 10) || 15),
      catchError(() => of(15))
    );
  }

  /**
   * Set max tables per batch
   */
  setMaxTablesPerBatch(value: number): Observable<boolean> {
    return this.api.put<unknown>('/settings/max_tables_per_batch', { value: String(value) }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Get max chart rows
   */
  getMaxChartRows(): Observable<number> {
    return this.api.get<SettingValue>('/settings/max_chart_rows').pipe(
      map((data) => parseInt(data.value, 10) || 5000),
      catchError(() => of(5000))
    );
  }

  /**
   * Set max chart rows
   */
  setMaxChartRows(value: number): Observable<boolean> {
    return this.api.put<unknown>('/settings/max_chart_rows', { value: String(value) }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // ============ Generic Settings ============

  /**
   * Get a setting by key
   */
  getSetting(key: string): Observable<string | null> {
    return this.api.get<SettingValue>(`/settings/${key}`).pipe(
      map((data) => data.value),
      catchError(() => of(null))
    );
  }

  /**
   * Set a setting
   */
  setSetting(key: string, value: string): Observable<boolean> {
    return this.api.post<unknown>('/settings', { key, value }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
