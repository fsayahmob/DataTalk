import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { DatasetsApiService, Dataset, DatasetStatus } from '../../core/services';

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i)).toFixed(1);
  return `${value} ${sizes[i]}`;
}

/**
 * Format date to localized string
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

@Component({
  selector: 'app-datasets',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="flex-1 flex flex-col bg-background overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-5 border-b border-border/50">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-foreground">{{ 'datasets.title' | translate }}</h1>
            <p class="text-sm text-muted-foreground mt-0.5">{{ 'datasets.subtitle' | translate }}</p>
          </div>
          <button
            (click)="showCreateModal.set(true)"
            class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ 'datasets.create' | translate }}
          </button>
        </div>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <span class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4"></span>
            <p class="text-muted-foreground">{{ 'common.loading' | translate }}</p>
          </div>
        </div>
      }

      <!-- Empty state -->
      @else if (datasets().length === 0) {
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center max-w-sm">
            <div class="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-foreground mb-2">{{ 'datasets.empty' | translate }}</h3>
            <p class="text-sm text-muted-foreground mb-6">{{ 'datasets.empty_hint' | translate }}</p>
            <button
              (click)="showCreateModal.set(true)"
              class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              {{ 'datasets.create' | translate }}
            </button>
          </div>
        </div>
      }

      <!-- Dataset grid -->
      @else {
        <div class="flex-1 overflow-auto p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            @for (dataset of datasets(); track dataset.id) {
              <div
                class="bg-card border rounded-xl p-5 hover:border-primary/50 transition-colors cursor-pointer"
                [class.border-primary]="dataset.is_active"
                [class.ring-1]="dataset.is_active"
                [class.ring-primary/30]="dataset.is_active"
                [class.border-border]="!dataset.is_active"
              >
                <!-- Header -->
                <div class="flex items-start justify-between mb-3">
                  <div class="flex items-center gap-3">
                    <div class="p-2 rounded-lg" [class.bg-primary/20]="dataset.is_active" [class.bg-secondary]="!dataset.is_active">
                      <svg class="w-5 h-5" [class.text-primary]="dataset.is_active" [class.text-muted-foreground]="!dataset.is_active" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-semibold text-foreground flex items-center gap-2">
                        {{ dataset.name }}
                        @if (dataset.is_active) {
                          <span class="px-2 py-0.5 bg-primary/20 text-primary text-xs font-medium rounded-full">
                            {{ 'datasets.active' | translate }}
                          </span>
                        }
                      </h3>
                      @if (dataset.description) {
                        <p class="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                          {{ dataset.description }}
                        </p>
                      }
                    </div>
                  </div>
                  <!-- Status badge -->
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full"
                    [ngClass]="getStatusClasses(dataset.status)"
                  >
                    {{ getStatusLabel(dataset.status) | translate }}
                  </span>
                </div>

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-4 py-3 border-y border-border/50 my-3">
                  <div>
                    <p class="text-2xl font-semibold text-foreground">{{ dataset.table_count }}</p>
                    <p class="text-xs text-muted-foreground">{{ 'datasets.tables' | translate }}</p>
                  </div>
                  <div>
                    <p class="text-2xl font-semibold text-foreground">{{ formatNumber(dataset.row_count) }}</p>
                    <p class="text-xs text-muted-foreground">{{ 'datasets.rows' | translate }}</p>
                  </div>
                  <div>
                    <p class="text-2xl font-semibold text-foreground">{{ formatBytes(dataset.size_bytes) }}</p>
                    <p class="text-xs text-muted-foreground">{{ 'datasets.size' | translate }}</p>
                  </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground">
                    {{ 'datasets.created_at' | translate }}: {{ formatDate(dataset.created_at) }}
                  </p>

                  <div class="flex items-center gap-1">
                    <button
                      (click)="refreshStats(dataset.id, $event)"
                      class="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      [title]="'datasets.refresh_stats' | translate"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    @if (!dataset.is_active) {
                      <button
                        (click)="activateDataset(dataset.id, $event)"
                        class="p-2 rounded-lg text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        [title]="'datasets.activate' | translate"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    }
                    <button
                      (click)="confirmDelete(dataset, $event)"
                      class="p-2 rounded-lg text-muted-foreground hover:bg-status-error/20 hover:text-status-error transition-colors"
                      [title]="'common.delete' | translate"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Create Modal -->
      @if (showCreateModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <button
            type="button"
            class="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default"
            (click)="showCreateModal.set(false)"
            aria-label="Close modal"
          ></button>
          <div class="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-semibold text-foreground">{{ 'datasets.create_title' | translate }}</h2>
              <button
                type="button"
                (click)="showCreateModal.set(false)"
                class="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form (ngSubmit)="createDataset()" class="space-y-4">
              <div>
                <label for="dataset-name" class="block text-sm font-medium text-foreground mb-1.5">
                  {{ 'datasets.name' | translate }} *
                </label>
                <input
                  id="dataset-name"
                  type="text"
                  [(ngModel)]="newDatasetName"
                  name="name"
                  [placeholder]="'datasets.name_placeholder' | translate"
                  class="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label for="dataset-description" class="block text-sm font-medium text-foreground mb-1.5">
                  {{ 'datasets.description' | translate }}
                </label>
                <textarea
                  id="dataset-description"
                  [(ngModel)]="newDatasetDescription"
                  name="description"
                  [placeholder]="'datasets.description_placeholder' | translate"
                  rows="3"
                  class="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                ></textarea>
              </div>

              <div class="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  (click)="showCreateModal.set(false)"
                  class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {{ 'common.cancel' | translate }}
                </button>
                <button
                  type="submit"
                  [disabled]="!newDatasetName.trim() || creating()"
                  class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  @if (creating()) {
                    <span class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></span>
                    {{ 'common.loading' | translate }}
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    {{ 'datasets.create' | translate }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (deleteTarget()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <button
            type="button"
            class="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default"
            (click)="deleteTarget.set(null)"
            aria-label="Close modal"
          ></button>
          <div class="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-foreground">{{ 'datasets.delete_confirm_title' | translate }}</h2>
              <button
                type="button"
                (click)="deleteTarget.set(null)"
                class="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p class="text-muted-foreground mb-6">
              {{ 'datasets.delete_confirm_desc' | translate }}
            </p>

            <div class="bg-secondary/30 rounded-lg p-3 mb-6">
              <p class="font-medium text-foreground">{{ deleteTarget()?.name }}</p>
              @if (deleteTarget()?.description) {
                <p class="text-sm text-muted-foreground">{{ deleteTarget()?.description }}</p>
              }
            </div>

            <div class="flex justify-end gap-3">
              <button
                (click)="deleteTarget.set(null)"
                class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {{ 'common.cancel' | translate }}
              </button>
              <button
                (click)="deleteDataset()"
                [disabled]="deleting()"
                class="px-4 py-2 bg-status-error text-white rounded-lg text-sm font-medium hover:bg-status-error/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                @if (deleting()) {
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  {{ 'common.deleting' | translate }}
                } @else {
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {{ 'common.delete' | translate }}
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class DatasetsComponent implements OnInit {
  private readonly datasetsApi = inject(DatasetsApiService);

  // State
  protected readonly datasets = signal<Dataset[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly deleting = signal(false);

  // UI state
  protected readonly showCreateModal = signal(false);
  protected readonly deleteTarget = signal<Dataset | null>(null);

  // Form state
  protected newDatasetName = '';
  protected newDatasetDescription = '';

  ngOnInit(): void {
    this.loadDatasets();
  }

  private loadDatasets(): void {
    this.loading.set(true);
    this.datasetsApi.getDatasets(true).subscribe({
      next: (response) => {
        this.datasets.set(response.datasets);
        this.loading.set(false);
      },
      error: () => {
        this.datasets.set([]);
        this.loading.set(false);
      },
    });
  }

  createDataset(): void {
    if (!this.newDatasetName.trim() || this.creating()) return;

    this.creating.set(true);
    this.datasetsApi.createDataset({
      name: this.newDatasetName.trim(),
      description: this.newDatasetDescription.trim() || undefined,
    }).subscribe({
      next: () => {
        this.newDatasetName = '';
        this.newDatasetDescription = '';
        this.showCreateModal.set(false);
        this.creating.set(false);
        this.loadDatasets();
      },
      error: () => {
        this.creating.set(false);
      },
    });
  }

  activateDataset(datasetId: string, event: Event): void {
    event.stopPropagation();
    this.datasetsApi.activateDataset(datasetId).subscribe({
      next: () => {
        this.loadDatasets();
      },
    });
  }

  refreshStats(datasetId: string, event: Event): void {
    event.stopPropagation();
    this.datasetsApi.refreshStats(datasetId).subscribe({
      next: () => {
        this.loadDatasets();
      },
    });
  }

  confirmDelete(dataset: Dataset, event: Event): void {
    event.stopPropagation();
    this.deleteTarget.set(dataset);
  }

  deleteDataset(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;

    this.deleting.set(true);
    this.datasetsApi.deleteDataset(target.id).subscribe({
      next: () => {
        this.deleteTarget.set(null);
        this.deleting.set(false);
        this.loadDatasets();
      },
      error: () => {
        this.deleting.set(false);
      },
    });
  }

  // Helper methods
  protected formatBytes = formatBytes;
  protected formatDate = formatDate;

  protected formatNumber(num: number): string {
    return num.toLocaleString('fr-FR');
  }

  protected getStatusClasses(status: DatasetStatus): Record<string, boolean> {
    switch (status) {
      case 'ready':
        return { 'bg-status-success/20': true, 'text-status-success': true };
      case 'syncing':
        return { 'bg-status-warning/20': true, 'text-status-warning': true };
      case 'error':
        return { 'bg-status-error/20': true, 'text-status-error': true };
      case 'empty':
      default:
        return { 'bg-secondary': true, 'text-muted-foreground': true };
    }
  }

  protected getStatusLabel(status: DatasetStatus): string {
    switch (status) {
      case 'ready':
        return 'datasets.status_ready';
      case 'syncing':
        return 'datasets.status_syncing';
      case 'error':
        return 'datasets.status_error';
      case 'empty':
      default:
        return 'datasets.status_empty';
    }
  }
}
