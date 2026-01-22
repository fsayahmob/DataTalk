import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  SavedReport,
  SavedReportsResponse,
  ExecuteReportResponse,
  SharedReportResponse,
} from './api-types';

/**
 * Reports API Service
 *
 * Handles all report-related API calls (CRUD, execution, sharing).
 */
@Injectable({
  providedIn: 'root',
})
export class ReportsApiService {
  private readonly api = inject(ApiService);

  /**
   * Fetch all saved reports
   */
  getReports(): Observable<SavedReport[]> {
    return this.api.get<SavedReportsResponse>('/reports').pipe(
      map((data) => data.reports),
      catchError(() => of([]))
    );
  }

  /**
   * Save a new report
   */
  saveReport(
    title: string,
    question: string,
    sqlQuery: string,
    chartConfig: string,
    messageId: number
  ): Observable<boolean> {
    return this.api.post<unknown>('/reports', {
      title,
      question,
      sql_query: sqlQuery,
      chart_config: chartConfig,
      message_id: messageId,
    }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Delete a report
   */
  deleteReport(reportId: number): Observable<boolean> {
    return this.api.delete<unknown>(`/reports/${String(reportId)}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Execute a saved report
   */
  executeReport(reportId: number): Observable<ExecuteReportResponse> {
    return this.api.post<ExecuteReportResponse>(`/reports/${String(reportId)}/execute`);
  }

  /**
   * Fetch a shared report by token
   */
  getSharedReport(shareToken: string): Observable<SharedReportResponse> {
    return this.api.get<SharedReportResponse>(`/reports/shared/${shareToken}`);
  }
}
