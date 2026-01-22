import { Component, inject, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import {
  ConversationsApiService,
  WidgetsApiService,
  LlmApiService,
  ReportsApiService,
  Conversation,
  SuggestedQuestion,
  AnalysisResponse,
  ChartConfig,
  SavedReport,
} from '../../core/services';
import { AnalyticsZoneComponent } from './analytics-zone.component';

interface DisplayMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  chart?: ChartConfig;
  data?: Record<string, unknown>[];
  loading?: boolean;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AnalyticsZoneComponent],
  template: `
    <div class="flex-1 flex overflow-hidden bg-background">
      <!-- Zone 1: Chat (left) -->
      <div
        class="flex flex-col border-r border-border/30 transition-all duration-300"
        [class.w-14]="chatCollapsed()"
        [style.width]="chatCollapsed() ? null : chatWidth() + '%'"
      >
        @if (chatCollapsed()) {
          <div class="flex-1 flex flex-col items-center pt-3">
            <button
              (click)="chatCollapsed.set(false)"
              class="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
              title="Open chat"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          </div>
        } @else {
          <!-- Header -->
          <div class="h-12 px-3 border-b border-border/50 bg-secondary/30 flex items-center justify-between flex-shrink-0">
            <h3 class="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {{ 'chat.title' | translate }}
            </h3>
            <div class="flex items-center gap-1">
              <button
                type="button"
                (click)="showHistory.set(!showHistory())"
                class="h-7 w-7 p-0 hover:bg-cyan-500/20 rounded flex items-center justify-center"
                [class.bg-cyan-500/20]="showHistory()"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                (click)="handleNewConversation()"
                class="h-7 w-7 p-0 hover:bg-cyan-500/20 rounded flex items-center justify-center"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                (click)="chatCollapsed.set(true)"
                class="h-7 w-7 p-0 hover:bg-cyan-500/20 rounded flex items-center justify-center"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- LLM Status -->
          <div class="px-3 py-2 border-b border-border/30 bg-sidebar/50">
            <p class="text-xs text-muted-foreground">
              @if (llmStatus()) {
                <span class="text-status-success">● {{ llmStatus() }}</span>
              } @else {
                <span class="text-status-error">● {{ 'sidebar.not_configured' | translate }}</span>
              }
            </p>
          </div>

          <!-- History panel -->
          @if (showHistory()) {
            <div class="border-b border-border/30 p-2 max-h-48 overflow-auto bg-sidebar/50">
              @if (conversations().length === 0) {
                <p class="text-xs text-muted-foreground text-center py-4">
                  {{ 'chat.no_conversations' | translate }}
                </p>
              } @else {
                @for (conv of conversations(); track conv.id) {
                  <button
                    type="button"
                    (click)="loadConversation(conv)"
                    class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                    [class.bg-primary/20]="currentConversationId() === conv.id"
                    [class.text-primary]="currentConversationId() === conv.id"
                    [class.hover:bg-secondary/50]="currentConversationId() !== conv.id"
                  >
                    <p class="truncate text-xs">{{ conv.title || ('chat.untitled_conversation' | translate) }}</p>
                    <p class="text-[10px] text-muted-foreground">{{ formatDate(conv.updated_at) }}</p>
                  </button>
                }
              }
            </div>
          }

          <!-- Messages area -->
          <div #messagesContainer class="flex-1 overflow-auto p-3 space-y-3">
            @if (messages().length === 0) {
              <!-- Empty state -->
              <div class="flex-1 flex flex-col items-center justify-center py-6">
                <div class="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg class="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p class="text-sm text-foreground font-medium mb-1">{{ 'chat.ask_natural_language' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'chat.or_select_suggestion' | translate }}</p>

                @if (suggestedQuestions().length > 0) {
                  <div class="w-full space-y-1 mt-4">
                    @for (q of suggestedQuestions().slice(0, 4); track q.id) {
                      <button
                        type="button"
                        (click)="selectQuestion(q.question)"
                        class="w-full text-left px-3 py-2 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-xs"
                      >
                        <span class="mr-1">{{ q.icon || '💬' }}</span>
                        {{ q.question }}
                      </button>
                    }
                  </div>
                }
              </div>
            } @else {
              @for (msg of messages(); track msg.id) {
                <div class="flex" [class.justify-end]="msg.role === 'user'">
                  <div
                    class="max-w-[90%] rounded-lg px-3 py-2 text-xs"
                    [class.bg-primary]="msg.role === 'user'"
                    [class.text-primary-foreground]="msg.role === 'user'"
                    [class.bg-secondary/50]="msg.role === 'assistant'"
                    [class.text-foreground]="msg.role === 'assistant'"
                  >
                    @if (msg.loading) {
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        <span>{{ 'chat.analyzing' | translate }}...</span>
                      </div>
                    } @else {
                      <p class="whitespace-pre-wrap">{{ msg.content }}</p>
                      @if (msg.role === 'assistant' && msg.sql) {
                        <div class="mt-1.5 pt-1.5 border-t border-border/30">
                          <button
                            type="button"
                            (click)="selectMessage(msg)"
                            class="text-[10px] text-primary hover:underline flex items-center gap-1"
                          >
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            {{ 'visualization.view' | translate }}
                          </button>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            }
          </div>

          <!-- Input area -->
          <form (submit)="handleSubmit($event)" class="p-3 border-t border-border/30">
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="question"
                name="question"
                [placeholder]="'chat.placeholder' | translate"
                [disabled]="loading()"
                class="flex-1 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <button
                type="submit"
                [disabled]="loading() || question.trim() === ''"
                class="px-3 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p class="text-[10px] text-muted-foreground mt-1.5 text-center">
              {{ 'chat.enter_to_send' | translate }}
            </p>
          </form>
        }
      </div>

      <!-- Zone 2: Visualization (center) -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Filters bar -->
        <div class="h-12 px-4 border-b border-border/50 bg-secondary/30 flex items-center gap-4 flex-shrink-0">
          <h3 class="text-xs font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {{ 'visualization.title' | translate }}
          </h3>
          <div class="flex items-center gap-2 ml-auto">
            <button class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {{ 'visualization.filters' | translate }}
            </button>
          </div>
        </div>

        @if (selectedMessage()) {
          <!-- SQL display -->
          @if (selectedMessage()!.sql) {
            <div class="px-4 py-2 bg-secondary/20 border-b border-border/30">
              <details class="text-xs">
                <summary class="cursor-pointer text-muted-foreground hover:text-foreground">SQL Query</summary>
                <pre class="mt-2 p-2 bg-background rounded overflow-x-auto font-mono text-foreground text-[10px]">{{ selectedMessage()!.sql }}</pre>
              </details>
            </div>
          }

          <!-- Data table -->
          @if (selectedMessage()!.data && selectedMessage()!.data!.length > 0) {
            <div class="flex-1 overflow-auto p-4">
              <div class="border border-border rounded-lg overflow-hidden">
                <table class="w-full text-xs">
                  <thead class="bg-secondary/50 sticky top-0">
                    <tr>
                      @for (col of getColumns(selectedMessage()!.data!); track col) {
                        <th class="px-3 py-2 text-left font-medium text-muted-foreground border-b border-border">
                          {{ col }}
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/50">
                    @for (row of selectedMessage()!.data!.slice(0, 100); track $index) {
                      <tr class="hover:bg-secondary/30">
                        @for (col of getColumns(selectedMessage()!.data!); track col) {
                          <td class="px-3 py-2 text-foreground">
                            {{ formatCellValue(row[col]) }}
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="flex-1 flex items-center justify-center">
              <p class="text-muted-foreground text-sm">{{ 'visualization.no_data' | translate }}</p>
            </div>
          }
        } @else {
          <!-- Empty visualization state -->
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 class="text-lg font-semibold text-foreground mb-2">TalkData</h2>
              <p class="text-sm text-muted-foreground">{{ 'home.ask_question' | translate }}</p>
            </div>
          </div>
        }
      </div>

      <!-- Zone 3: Analytics (right) -->
      <app-analytics-zone
        [collapsedInput]="analyticsCollapsed()"
        [widthInput]="analyticsWidth()"
        (collapseChange)="analyticsCollapsed.set($event)"
        (onReportClick)="handleReportClick($event)"
        (onReportDelete)="handleReportDelete($event)"
      />
    </div>
  `,
})
export class AnalyticsComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer: ElementRef<HTMLDivElement> | undefined;

  private readonly conversationsApi = inject(ConversationsApiService);
  private readonly widgetsApi = inject(WidgetsApiService);
  private readonly llmApi = inject(LlmApiService);
  private readonly reportsApi = inject(ReportsApiService);

  // Layout state
  protected readonly chatCollapsed = signal(false);
  protected readonly chatWidth = signal(28);
  protected readonly analyticsCollapsed = signal(false);
  protected readonly analyticsWidth = signal(20);

  // State
  protected readonly loading = signal(false);
  protected readonly messages = signal<DisplayMessage[]>([]);
  protected readonly selectedMessage = signal<DisplayMessage | null>(null);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly currentConversationId = signal<number | null>(null);
  protected readonly suggestedQuestions = signal<SuggestedQuestion[]>([]);
  protected readonly showHistory = signal(false);
  protected readonly llmStatus = signal<string | null>(null);

  // Form state
  protected question = '';

  ngOnInit(): void {
    this.loadLlmStatus();
    this.loadConversations();
    this.loadSuggestedQuestions();
  }

  private loadLlmStatus(): void {
    this.llmApi.getStatus().subscribe({
      next: (status) => {
        if (status.status === 'ok') {
          this.llmStatus.set(status.model ?? 'Connected');
        } else {
          this.llmStatus.set(null);
        }
      },
    });
  }

  private loadConversations(): void {
    this.conversationsApi.getConversations().subscribe({
      next: (convs) => {
        this.conversations.set(convs);
      },
    });
  }

  private loadSuggestedQuestions(): void {
    this.widgetsApi.getSuggestedQuestions().subscribe({
      next: (questions) => {
        this.suggestedQuestions.set(questions);
      },
    });
  }

  protected loadConversation(conv: Conversation): void {
    this.currentConversationId.set(conv.id);
    this.showHistory.set(false);

    this.conversationsApi.getMessages(conv.id).subscribe({
      next: (msgs) => {
        const displayMsgs: DisplayMessage[] = msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sql: m.sql_query ?? undefined,
          chart: m.chart_config ?? undefined,
        }));
        this.messages.set(displayMsgs);
      },
    });
  }

  protected handleNewConversation(): void {
    this.currentConversationId.set(null);
    this.messages.set([]);
    this.selectedMessage.set(null);
    this.question = '';
  }

  protected selectQuestion(q: string): void {
    this.question = q;
  }

  protected selectMessage(msg: DisplayMessage): void {
    this.selectedMessage.set(msg);
  }

  protected handleReportClick(report: SavedReport): void {
    this.reportsApi.executeReport(report.id).subscribe({
      next: (result) => {
        const reportMessage: DisplayMessage = {
          id: Date.now(),
          role: 'assistant',
          content: result.title,
          sql: result.sql,
          chart: result.chart,
          data: result.data,
        };
        this.selectedMessage.set(reportMessage);
      },
    });
  }

  protected handleReportDelete(reportId: number): void {
    this.reportsApi.deleteReport(reportId).subscribe();
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    const q = this.question.trim();
    if (q === '' || this.loading()) return;

    this.question = '';
    this.loading.set(true);

    const userMsgId = Date.now();
    const userMsg: DisplayMessage = {
      id: userMsgId,
      role: 'user',
      content: q,
    };

    const assistantMsgId = userMsgId + 1;
    const loadingMsg: DisplayMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      loading: true,
    };

    this.messages.update((msgs) => [...msgs, userMsg, loadingMsg]);
    this.scrollToBottom();

    const convId = this.currentConversationId();
    if (convId !== null) {
      this.sendAnalysis(convId, q, assistantMsgId);
    } else {
      this.conversationsApi.createConversation().subscribe({
        next: (newId) => {
          if (newId !== null) {
            this.currentConversationId.set(newId);
            this.sendAnalysis(newId, q, assistantMsgId);
          } else {
            this.handleError(assistantMsgId, 'Failed to create conversation');
          }
        },
        error: () => {
          this.handleError(assistantMsgId, 'Failed to create conversation');
        },
      });
    }
  }

  private sendAnalysis(convId: number, question: string, msgId: number): void {
    this.conversationsApi.analyze(convId, question).subscribe({
      next: (response: AnalysisResponse) => {
        this.messages.update((msgs) =>
          msgs.map((m) =>
            m.id === msgId
              ? {
                  id: response.message_id,
                  role: 'assistant' as const,
                  content: response.message,
                  sql: response.sql,
                  chart: response.chart,
                  data: response.data,
                  loading: false,
                }
              : m
          )
        );

        const newMsg: DisplayMessage = {
          id: response.message_id,
          role: 'assistant',
          content: response.message,
          sql: response.sql,
          chart: response.chart,
          data: response.data,
        };
        this.selectedMessage.set(newMsg);

        this.loading.set(false);
        this.loadConversations();
        this.scrollToBottom();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        const errorMsg = err.error?.message ?? err.message ?? 'Analysis failed';
        this.handleError(msgId, errorMsg);
      },
    });
  }

  private handleError(msgId: number, error: string): void {
    this.messages.update((msgs) =>
      msgs.map((m) =>
        m.id === msgId
          ? { ...m, content: `Error: ${error}`, loading: false }
          : m
      )
    );
    this.loading.set(false);
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const container = this.messagesContainer;
      if (container !== undefined) {
        const el = container.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }

  protected formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected getColumns(data: Record<string, unknown>[]): string[] {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }

  protected formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toLocaleString('fr-FR');
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return JSON.stringify(value);
  }
}
