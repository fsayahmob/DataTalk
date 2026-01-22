import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '@env';

/**
 * API Base URL injection token
 * - Development: 'http://localhost:8000' (direct to backend)
 * - Production/Docker: '' (nginx proxies /api/ to backend)
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/**
 * API Error response shape
 */
interface ApiErrorBody {
  detail?: string;
  message?: string;
}

/**
 * Base API Service
 *
 * Provides common HTTP methods with error handling.
 * All feature services should extend or use this service.
 *
 * Note: Interceptors already add:
 * - Accept-Language header (via localeInterceptor)
 * - dataset_id query param (via datasetInterceptor)
 */
@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Error handler as arrow function to preserve 'this' context
   */
  private readonly handleError = (error: HttpErrorResponse): Observable<never> => {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error - safely access error body
      const errorBody = error.error as ApiErrorBody | null;
      errorMessage = errorBody?.detail ?? errorBody?.message ?? `Error ${String(error.status)}`;
    }

    console.error('API Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  };

  /**
   * GET request
   */
  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`).pipe(catchError(this.handleError));
  }

  /**
   * POST request
   */
  post<T>(endpoint: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body).pipe(catchError(this.handleError));
  }

  /**
   * PUT request
   */
  put<T>(endpoint: string, body: unknown = {}): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, body).pipe(catchError(this.handleError));
  }

  /**
   * PATCH request
   */
  patch<T>(endpoint: string, body: unknown = {}): Observable<T> {
    return this.http
      .patch<T>(`${this.baseUrl}${endpoint}`, body)
      .pipe(catchError(this.handleError));
  }

  /**
   * DELETE request
   */
  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`).pipe(catchError(this.handleError));
  }
}
