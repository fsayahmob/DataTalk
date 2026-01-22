import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { CatalogApiService, Run } from '../../core/services';

@Component({
  selector: 'app-runs',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="flex-1 overflow-auto bg-background">
      <div class="max-w-6xl mx-auto px-6 py-4">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-lg font-semibold text-foreground">{{ 'runs.title' | translate }}</h1>
          <p class="text-xs text-muted-foreground">{{ 'runs.subtitle' | translate }}</p>
        </div>

        <!-- Loading state -->
        @if (loading()) {
          <div class="flex items-center justify-center py-12">
            <span class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
          </div>
        }

        <!-- Empty state -->
        @else if (runs().length === 0) {
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <div class="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p class="text-sm text-muted-foreground">{{ 'runs.no_runs' | translate }}</p>
            </div>
          </div>
        }

        <!-- Runs list -->
        @else {
          <div class="space-y-3">
            @for (run of runs(); track run.id) {
              <div class="p-4 rounded-lg border border-border">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <span
                      class="w-2.5 h-2.5 rounded-full"
                      [class.bg-status-success]="run.status === 'completed'"
                      [class.bg-status-error]="run.status === 'failed'"
                      [class.bg-status-warning]="run.status === 'running'"
                      [class.bg-secondary]="run.status === 'pending'"
                    ></span>
                    <span class="font-medium text-foreground capitalize">{{ run.job_type }}</span>
                  </div>
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full"
                    [class.bg-status-success/20]="run.status === 'completed'"
                    [class.text-status-success]="run.status === 'completed'"
                    [class.bg-status-error/20]="run.status === 'failed'"
                    [class.text-status-error]="run.status === 'failed'"
                    [class.bg-status-warning/20]="run.status === 'running'"
                    [class.text-status-warning]="run.status === 'running'"
                    [class.bg-secondary]="run.status === 'pending'"
                    [class.text-muted-foreground]="run.status === 'pending'"
                  >
                    {{ run.status }}
                  </span>
                </div>

                <div class="text-xs text-muted-foreground space-y-1">
                  <p>Started: {{ formatDate(run.started_at) }}</p>
                  @if (run.completed_at) {
                    <p>Completed: {{ formatDate(run.completed_at) }}</p>
                  }
                  @if (run.current_step) {
                    <p>Current step: {{ run.current_step }}</p>
                  }
                  @if (run.error_message) {
                    <p class="text-status-error">Error: {{ run.error_message }}</p>
                  }
                </div>

                @if (run.status === 'running' && run.progress > 0) {
                  <div class="mt-3">
                    <div class="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        class="h-full bg-primary transition-all"
                        [style.width.%]="run.progress"
                      ></div>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">{{ run.progress }}%</p>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class RunsComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);

  protected readonly loading = signal(true);
  protected readonly runs = signal<Run[]>([]);

  ngOnInit(): void {
    this.loadRuns();
  }

  private loadRuns(): void {
    this.loading.set(true);
    this.catalogApi.getRuns().subscribe({
      next: (response) => {
        this.runs.set(response.runs);
        this.loading.set(false);
      },
      error: () => {
        this.runs.set([]);
        this.loading.set(false);
      },
    });
  }

  protected formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
