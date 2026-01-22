import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  LLMStatus,
  LLMProvider,
  LLMModel,
  LLMCosts,
  LLMPrompt,
} from './api-types';

/**
 * LLM API Service
 *
 * Handles all LLM-related API calls.
 */
@Injectable({
  providedIn: 'root',
})
export class LlmApiService {
  private readonly api = inject(ApiService);

  /**
   * Get LLM status
   */
  getStatus(): Observable<LLMStatus> {
    return this.api.get<LLMStatus>('/llm/status');
  }

  /**
   * Get all providers
   */
  getProviders(): Observable<LLMProvider[]> {
    return this.api.get<{ providers: LLMProvider[] }>('/llm/providers').pipe(
      map((data) => data.providers ?? []),
      catchError(() => of([]))
    );
  }

  /**
   * Get available models
   */
  getModels(providerName?: string): Observable<LLMModel[]> {
    const endpoint = providerName ? `/llm/models?provider_name=${providerName}` : '/llm/models';
    return this.api.get<{ models: LLMModel[] }>(endpoint).pipe(
      map((data) => data.models ?? []),
      catchError(() => of([]))
    );
  }

  /**
   * Get default model
   */
  getDefaultModel(): Observable<LLMModel | null> {
    return this.api.get<LLMModel>('/llm/models/default').pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Set default model
   */
  setDefaultModel(modelId: number): Observable<boolean> {
    return this.api.post<unknown>(`/llm/models/default/${String(modelId)}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Save API key for a provider
   */
  saveApiKey(providerName: string, apiKey: string): Observable<boolean> {
    return this.api.post<unknown>('/settings', {
      key: `${providerName}_api_key`,
      value: apiKey,
    }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Save provider configuration (e.g., Ollama base URL)
   */
  saveProviderConfig(providerName: string, baseUrl: string): Observable<boolean> {
    return this.api.post<unknown>(`/llm/providers/${providerName}/config`, {
      base_url: baseUrl,
    }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Get LLM usage costs
   */
  getCosts(days = 30): Observable<LLMCosts | null> {
    return this.api.get<LLMCosts>(`/llm/costs?days=${String(days)}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get all prompts
   */
  getPrompts(): Observable<LLMPrompt[]> {
    return this.api.get<{ prompts: LLMPrompt[] }>('/llm/prompts').pipe(
      map((data) => data.prompts),
      catchError(() => of([]))
    );
  }

  /**
   * Update a prompt
   */
  updatePrompt(promptId: number, content: string): Observable<boolean> {
    return this.api.patch<unknown>(`/llm/prompts/${String(promptId)}`, { content }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /**
   * Reset a prompt to default
   */
  resetPrompt(promptId: number): Observable<boolean> {
    return this.api.post<unknown>(`/llm/prompts/${String(promptId)}/reset`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
