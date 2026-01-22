import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  SuggestedQuestion,
  SuggestedQuestionsResponse,
  KpiCompactData,
  KpisResponse,
  PredefinedQuestion,
  PredefinedQuestionsResponse,
} from './api-types';

/**
 * Widgets API Service
 *
 * Handles widget-related API calls (KPIs, suggested questions).
 */
@Injectable({
  providedIn: 'root',
})
export class WidgetsApiService {
  private readonly api = inject(ApiService);

  /**
   * Fetch suggested questions
   */
  getSuggestedQuestions(): Observable<SuggestedQuestion[]> {
    return this.api.get<SuggestedQuestionsResponse>('/suggested-questions').pipe(
      map((data) => data.questions),
      catchError(() => of([]))
    );
  }

  /**
   * Fetch KPIs
   */
  getKpis(): Observable<KpiCompactData[]> {
    return this.api.get<KpisResponse>('/kpis').pipe(
      map((data) => data.kpis),
      catchError(() => of([]))
    );
  }

  /**
   * Fetch predefined questions
   */
  getPredefinedQuestions(): Observable<PredefinedQuestion[]> {
    return this.api.get<PredefinedQuestionsResponse>('/predefined-questions').pipe(
      map((data) => data.questions),
      catchError(() => of([]))
    );
  }
}
