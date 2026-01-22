import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from './api.service';
import {
  Conversation,
  ConversationsResponse,
  Message,
  MessagesResponse,
  AnalysisResponse,
  AnalysisFilters,
} from './api-types';

/**
 * Conversations API Service
 *
 * Handles all conversation-related API calls (CRUD, messages, analysis).
 */
@Injectable({
  providedIn: 'root',
})
export class ConversationsApiService {
  private readonly api = inject(ApiService);

  /**
   * Fetch all conversations
   */
  getConversations(): Observable<Conversation[]> {
    return this.api.get<ConversationsResponse>('/conversations').pipe(
      map((data) => data.conversations),
      catchError(() => of([]))
    );
  }

  /**
   * Create a new conversation
   */
  createConversation(): Observable<number | null> {
    return this.api.post<{ id: number }>('/conversations').pipe(
      map((data) => data.id),
      catchError(() => of(null))
    );
  }

  /**
   * Fetch messages for a conversation
   */
  getMessages(conversationId: number): Observable<Message[]> {
    return this.api.get<MessagesResponse>(`/conversations/${String(conversationId)}/messages`).pipe(
      map((data) => data.messages),
      catchError(() => of([]))
    );
  }

  /**
   * Delete all conversations
   */
  deleteAllConversations(): Observable<number> {
    return this.api.delete<{ count: number }>('/conversations').pipe(
      map((data) => data.count || 0),
      catchError(() => of(0))
    );
  }

  /**
   * Analyze a question in a conversation context
   */
  analyze(
    conversationId: number,
    question: string,
    filters?: AnalysisFilters,
    useContext = false
  ): Observable<AnalysisResponse> {
    return this.api.post<AnalysisResponse>(
      `/conversations/${String(conversationId)}/analyze`,
      {
        question,
        filters,
        use_context: useContext,
      }
    );
  }
}
