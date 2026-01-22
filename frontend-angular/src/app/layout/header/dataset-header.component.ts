import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { DatasetService, Dataset } from '../../core/services/dataset.service';
import { DatasetsApiService, Dataset as ApiDataset } from '../../core/services';

/**
 * DatasetHeader - Header component for dataset visualization
 *
 * Displays dataset nodes as clickable pills.
 * The active dataset is highlighted with primary color.
 *
 * Uses DatasetService for centralized state management.
 */
@Component({
  selector: 'app-dataset-header',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="h-12 border-b border-border/30 bg-sidebar/50 flex-shrink-0">
      @if (loading$ | async) {
        <!-- Loading state -->
        <div class="h-full flex items-center px-4">
          <div class="flex items-center gap-3">
            <span class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            <span class="text-xs text-muted-foreground">{{ 'common.loading' | translate }}</span>
          </div>
        </div>
      } @else if ((datasets$ | async)?.length === 0) {
        <!-- Empty state -->
        <div class="h-full flex items-center px-4">
          <a
            routerLink="/datasets"
            class="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>{{ 'datasets.create_first' | translate }}</span>
          </a>
        </div>
      } @else {
        <!-- Dataset pills -->
        <div class="h-full flex items-center gap-2 px-4 overflow-x-auto">
          @for (dataset of datasets$ | async; track dataset.id) {
            <button
              (click)="activateDataset(dataset)"
              class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
              [class.bg-primary/20]="isActive(dataset)"
              [class.text-primary]="isActive(dataset)"
              [class.border-primary/30]="isActive(dataset)"
              [class.bg-secondary/30]="!isActive(dataset)"
              [class.text-muted-foreground]="!isActive(dataset)"
              [class.border-transparent]="!isActive(dataset)"
              [class.hover:bg-secondary/50]="!isActive(dataset)"
              [class.hover:text-foreground]="!isActive(dataset)"
              [title]="dataset.description || dataset.name"
            >
              <!-- Status indicator -->
              <span
                class="w-2 h-2 rounded-full flex-shrink-0"
                [class.bg-status-success]="dataset.status === 'ready'"
                [class.bg-status-warning]="dataset.status === 'syncing'"
                [class.bg-status-error]="dataset.status === 'error'"
                [class.bg-muted-foreground/50]="dataset.status === 'empty'"
              ></span>
              <span class="truncate max-w-[120px]">{{ dataset.name }}</span>
              @if (dataset.tableCount > 0) {
                <span class="text-[10px] opacity-60">{{ dataset.tableCount }} tables</span>
              }
            </button>
          }

          <!-- Add dataset button -->
          <a
            routerLink="/datasets"
            class="flex items-center justify-center w-7 h-7 rounded-full bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
            [title]="'datasets.add' | translate"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </a>
        </div>
      }
    </div>
  `,
})
export class DatasetHeaderComponent implements OnInit, OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly datasetsApi = inject(DatasetsApiService);
  private subscription: Subscription | null = null;

  protected readonly datasets$ = this.datasetService.getDatasets$();
  protected readonly loading$ = this.datasetService.getLoading$();
  protected readonly activeDataset$ = this.datasetService.getActiveDataset$();

  private activeDatasetId: string | null = null;

  ngOnInit(): void {
    // Subscribe to active dataset changes
    this.subscription = this.activeDataset$.subscribe((dataset) => {
      this.activeDatasetId = dataset?.id ?? null;
    });

    // Load datasets from API and populate the service
    this.loadDatasets();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private loadDatasets(): void {
    this.datasetService.setLoading(true);
    this.datasetsApi.getDatasets(true).subscribe({
      next: (response) => {
        // Map from API format (snake_case) to internal format (camelCase)
        const datasets: Dataset[] = response.datasets.map((d: ApiDataset) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          status: d.status,
          isActive: d.is_active,
          rowCount: d.row_count,
          tableCount: d.table_count,
          sizeBytes: d.size_bytes,
          createdAt: d.created_at ?? '',
          updatedAt: d.updated_at ?? '',
        }));
        this.datasetService.setDatasets(datasets);
        this.datasetService.setLoading(false);
      },
      error: () => {
        this.datasetService.setDatasets([]);
        this.datasetService.setLoading(false);
      },
    });
  }

  isActive(dataset: Dataset): boolean {
    return dataset.id === this.activeDatasetId;
  }

  activateDataset(dataset: Dataset): void {
    this.datasetService.setActiveDataset(dataset);
  }
}
