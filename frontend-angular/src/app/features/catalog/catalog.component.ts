import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import {
  CatalogApiService,
  LlmApiService,
  CatalogDatasource,
  CatalogTable,
  CatalogColumn,
} from '../../core/services';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="flex-1 flex flex-col overflow-hidden bg-background">
      <!-- Status bars -->
      @if (isExtracting()) {
        <div class="px-4 py-2 bg-status-info/20 border-b border-status-info/30 flex items-center gap-3">
          <span class="w-3 h-3 border-2 border-status-info border-t-transparent rounded-full animate-spin"></span>
          <span class="text-sm text-status-info">{{ 'catalog.extracting' | translate }}</span>
        </div>
      }

      @if (isEnriching()) {
        <div class="px-4 py-2 bg-primary/20 border-b border-primary/30 flex items-center gap-3">
          <span class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
          <span class="text-sm text-primary">{{ 'catalog.enriching_progress' | translate }}</span>
        </div>
      }

      <!-- Main content -->
      @if (loading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <span class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4"></span>
            <p class="text-muted-foreground">{{ 'catalog.loading' | translate }}</p>
          </div>
        </div>
      } @else if (allTables().length === 0) {
        <!-- Empty state -->
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center max-w-md">
            <div class="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-foreground mb-2">{{ 'catalog.no_catalog' | translate }}</h2>
            <p class="text-sm text-muted-foreground mb-6">
              {{ 'catalog.extraction_no_llm' | translate }}
            </p>
            <button
              type="button"
              (click)="handleExtract()"
              [disabled]="isExtracting()"
              class="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              @if (isExtracting()) {
                <span class="flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  {{ 'common.extracting' | translate }}
                </span>
              } @else {
                {{ 'catalog.extract_schema' | translate }}
              }
            </button>
          </div>
        </div>
      } @else {
        <!-- Tables grid + detail panel -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Tables grid -->
          <div class="flex-1 overflow-auto p-4">
            <!-- Actions toolbar -->
            <div class="flex items-center justify-between mb-4">
              <div>
                <h1 class="text-lg font-semibold text-foreground">{{ 'catalog.title' | translate }}</h1>
                <p class="text-xs text-muted-foreground">{{ 'catalog.subtitle' | translate }}</p>
              </div>

              <div class="flex items-center gap-2">
                <!-- Extract button -->
                <button
                  type="button"
                  (click)="handleExtract()"
                  [disabled]="isLoading()"
                  class="px-3 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  @if (isExtracting()) {
                    <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    {{ 'common.extracting' | translate }}
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    {{ 'catalog.re_extract' | translate }}
                  }
                </button>

                <!-- Enrich button -->
                <button
                  type="button"
                  (click)="handleEnrich()"
                  [disabled]="isLoading() || enabledTablesCount() === 0"
                  class="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  @if (isEnriching()) {
                    <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    {{ 'common.enriching' | translate }}
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    {{ 'catalog.enrich_tables' | translate: { count: enabledTablesCount() } }}
                  }
                </button>

                <!-- Delete button -->
                <button
                  type="button"
                  (click)="showDeleteConfirm.set(true)"
                  [disabled]="isLoading()"
                  class="px-3 py-2 border border-status-error/30 text-status-error rounded-lg text-sm font-medium hover:bg-status-error/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  @if (isDeleting()) {
                    <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
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

            <!-- Hint -->
            <div class="mb-4 px-3 py-2 bg-secondary/30 border border-border/30 rounded-lg text-xs text-muted-foreground">
              {{ 'catalog.select_table' | translate }}
            </div>

            <!-- Tables grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (table of allTables(); track table.name) {
                <button
                  type="button"
                  (click)="selectTable(table)"
                  class="text-left p-4 rounded-lg border transition-all hover:shadow-md"
                  [class.border-primary]="selectedTable()?.name === table.name"
                  [class.bg-primary/5]="selectedTable()?.name === table.name"
                  [class.border-amber-500/40]="table.is_enabled && !table.description && selectedTable()?.name !== table.name"
                  [class.bg-amber-500/5]="table.is_enabled && !table.description && selectedTable()?.name !== table.name"
                  [class.border-muted-foreground/30]="!table.is_enabled && selectedTable()?.name !== table.name"
                  [class.bg-muted]="!table.is_enabled && selectedTable()?.name !== table.name"
                  [class.opacity-60]="!table.is_enabled"
                  [class.border-border]="table.is_enabled && table.description && selectedTable()?.name !== table.name"
                >
                  <!-- Header -->
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span
                        class="w-2.5 h-2.5 rounded-full"
                        [class.bg-primary]="table.is_enabled && table.description"
                        [class.bg-amber-500]="table.is_enabled && !table.description"
                        [class.bg-muted-foreground]="!table.is_enabled"
                      ></span>
                      <span class="font-mono font-bold text-sm text-foreground">{{ table.name }}</span>
                    </div>
                    @if (!table.is_enabled) {
                      <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground uppercase">
                        {{ 'catalog.excluded' | translate }}
                      </span>
                    }
                    @if (table.is_enabled && !table.description) {
                      <span class="text-[9px] px-1.5 py-0.5 rounded bg-status-warning/20 text-status-warning uppercase">
                        {{ 'catalog.not_enriched' | translate }}
                      </span>
                    }
                  </div>

                  <!-- Description -->
                  @if (table.description) {
                    <p class="text-xs text-muted-foreground mb-2 line-clamp-2">{{ table.description }}</p>
                  }

                  <!-- Stats -->
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{{ table.columns.length }} {{ 'catalog.columns' | translate }}</span>
                    @if (table.row_count !== null) {
                      <span>{{ formatNumber(table.row_count) }} {{ 'common.rows' | translate }}</span>
                    }
                  </div>

                  <!-- Columns preview -->
                  <div class="mt-2 flex flex-wrap gap-1">
                    @for (col of table.columns.slice(0, 5); track col.name) {
                      <span class="px-1.5 py-0.5 bg-secondary/50 text-[10px] rounded text-muted-foreground font-mono">
                        {{ col.name }}
                      </span>
                    }
                    @if (table.columns.length > 5) {
                      <span class="px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        +{{ table.columns.length - 5 }}
                      </span>
                    }
                  </div>
                </button>
              }
            </div>
          </div>

          <!-- Detail panel -->
          @if (selectedTable()) {
            <div class="w-[400px] border-l border-border/30 bg-sidebar flex flex-col overflow-hidden">
              <!-- Header -->
              <div
                class="px-4 py-3 border-b border-border/30 flex items-center justify-between"
                [class.bg-muted-foreground/10]="!selectedTable()!.is_enabled"
                [class.bg-amber-500/10]="selectedTable()!.is_enabled && !selectedTable()!.description"
                [class.bg-primary/10]="selectedTable()!.is_enabled && selectedTable()!.description"
              >
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-mono font-bold text-foreground">{{ selectedTable()!.name }}</h3>
                    @if (!selectedTable()!.is_enabled) {
                      <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground uppercase">
                        {{ 'catalog.excluded' | translate }}
                      </span>
                    }
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ formatNumber(selectedTable()!.row_count ?? 0) }} {{ 'common.rows' | translate }}
                  </p>
                </div>
                <button
                  type="button"
                  (click)="selectedTable.set(null)"
                  class="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- Toggle enable/disable -->
              <div class="px-4 py-3 border-b border-border/20 flex items-center justify-between bg-secondary/20">
                <div>
                  <p class="text-sm font-medium">{{ 'catalog.include_enrichment' | translate }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ (selectedTable()!.is_enabled ? 'catalog.will_be_enriched' : 'catalog.excluded_from_enrichment') | translate }}
                  </p>
                </div>
                <button
                  type="button"
                  (click)="toggleTableEnabled(selectedTable()!)"
                  class="relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out cursor-pointer"
                  [class.bg-primary]="selectedTable()!.is_enabled"
                  [class.bg-muted-foreground/30]="!selectedTable()!.is_enabled"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ease-in-out"
                    [class.translate-x-5]="selectedTable()!.is_enabled"
                    [class.translate-x-0]="!selectedTable()!.is_enabled"
                  ></span>
                </button>
              </div>

              <!-- Warning if not enriched -->
              @if (selectedTable()!.is_enabled && !selectedTable()!.description) {
                <div class="px-4 py-3 border-b border-border/20 bg-status-warning/10">
                  <p class="text-xs text-status-warning">
                    {{ 'catalog.not_enriched_warning' | translate }}
                  </p>
                </div>
              }

              <!-- Description -->
              @if (selectedTable()!.description) {
                <div class="px-4 py-3 border-b border-border/20 bg-primary/5">
                  <p class="text-sm text-muted-foreground">{{ selectedTable()!.description }}</p>
                </div>
              }

              <!-- Columns table -->
              <div class="flex-1 overflow-auto">
                <table class="w-full text-xs">
                  <thead class="sticky top-0 bg-background border-b border-border/30">
                    <tr>
                      <th class="text-left px-3 py-2 font-medium text-muted-foreground">{{ 'catalog.column' | translate }}</th>
                      <th class="text-left px-3 py-2 font-medium text-muted-foreground">{{ 'catalog.type' | translate }}</th>
                      <th class="text-left px-3 py-2 font-medium text-muted-foreground">{{ 'catalog.description' | translate }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/10">
                    @for (col of selectedTable()!.columns; track col.name; let idx = $index) {
                      <tr
                        class="hover:bg-primary/5"
                        [class.bg-background/5]="idx % 2 === 0"
                      >
                        <td class="px-3 py-2">
                          <span class="font-mono text-foreground">{{ col.name }}</span>
                        </td>
                        <td class="px-3 py-2">
                          <span class="font-mono text-muted-foreground uppercase text-[10px]">
                            {{ getBaseType(col.data_type) }}
                          </span>
                        </td>
                        <td class="px-3 py-2">
                          @if (editingColumnId() === col.id) {
                            <div class="flex gap-1">
                              <input
                                type="text"
                                [(ngModel)]="editingDescription"
                                (keydown.enter)="saveColumnDescription(col)"
                                (keydown.escape)="cancelEdit()"
                                class="flex-1 px-2 py-1 text-xs bg-background border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <button
                                type="button"
                                (click)="saveColumnDescription(col)"
                                class="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                (click)="cancelEdit()"
                                class="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80"
                              >
                                ✗
                              </button>
                            </div>
                          } @else {
                            <button
                              type="button"
                              (click)="startEditColumn(col)"
                              class="text-left cursor-pointer hover:bg-primary/10 rounded px-1 -mx-1 py-0.5 w-full"
                              [class.text-foreground/80]="col.description"
                              [class.text-muted-foreground/50]="!col.description"
                              [class.italic]="!col.description"
                            >
                              {{ col.description || ('catalog.add_description' | translate) }}
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Value analysis footer -->
              @if (hasColumnStats(selectedTable()!)) {
                <div class="border-t border-border/30 p-3 bg-sidebar">
                  <h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    {{ 'catalog.value_analysis' | translate }}
                  </h4>
                  <div class="space-y-1.5 max-h-32 overflow-auto">
                    @for (col of getColumnsWithStats(selectedTable()!); track col.name) {
                      <div class="text-xs">
                        <span class="font-mono text-primary/80">{{ col.name }}:</span>
                        <span class="text-[11px] leading-relaxed text-muted-foreground/90 ml-1">
                          {{ col.full_context || col.sample_values || col.value_range }}
                        </span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Footer stats -->
        <div class="px-4 py-2 border-t border-border/30 bg-sidebar/50 flex items-center gap-6 text-xs text-muted-foreground">
          <span>{{ allTables().length }} {{ 'catalog.tables' | translate }}</span>
          <span>{{ totalColumns() }} {{ 'catalog.columns' | translate }}</span>
          <span>{{ columnsWithDesc() }} {{ 'catalog.with_description' | translate }}</span>
          <span>{{ formatNumber(totalRows()) }} {{ 'catalog.total_rows' | translate }}</span>
        </div>
      }

      <!-- Delete confirmation modal -->
      @if (showDeleteConfirm()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <button
            type="button"
            class="absolute inset-0 cursor-default"
            (click)="showDeleteConfirm.set(false)"
            aria-label="Close modal"
          ></button>
          <div
            class="relative bg-card border border-border rounded-lg p-6 max-w-md mx-4"
            role="dialog"
            aria-modal="true"
          >
            <h3 class="text-lg font-semibold text-foreground mb-2">
              {{ 'catalog.delete_confirm_title' | translate }}
            </h3>
            <p class="text-sm text-muted-foreground mb-6">
              {{ 'catalog.delete_confirm_desc' | translate }}
            </p>
            <div class="flex justify-end gap-3">
              <button
                type="button"
                (click)="showDeleteConfirm.set(false)"
                class="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary/50 transition-colors"
              >
                {{ 'common.cancel' | translate }}
              </button>
              <button
                type="button"
                (click)="handleDelete()"
                class="px-4 py-2 bg-status-error text-white rounded-lg text-sm font-medium hover:bg-status-error/90 transition-colors"
              >
                {{ 'common.delete' | translate }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CatalogComponent implements OnInit, OnDestroy {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly llmApi = inject(LlmApiService);

  // State
  protected readonly loading = signal(true);
  protected readonly catalog = signal<CatalogDatasource[]>([]);
  protected readonly selectedTable = signal<CatalogTable | null>(null);
  protected readonly isExtracting = signal(false);
  protected readonly isEnriching = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly showDeleteConfirm = signal(false);

  // Column editing
  protected readonly editingColumnId = signal<number | null>(null);
  protected editingDescription = '';

  // Polling interval for enrichment
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  // Computed values
  protected readonly allTables = computed(() => {
    return this.catalog().flatMap((ds) => ds.tables);
  });

  protected readonly enabledTablesCount = computed(() => {
    return this.allTables().filter((t) => t.is_enabled).length;
  });

  protected readonly isLoading = computed(() => {
    return this.isExtracting() || this.isEnriching() || this.isDeleting();
  });

  protected readonly totalColumns = computed(() => {
    return this.allTables().flatMap((t) => t.columns).length;
  });

  protected readonly columnsWithDesc = computed(() => {
    return this.allTables()
      .flatMap((t) => t.columns)
      .filter((c) => c.description).length;
  });

  protected readonly totalRows = computed(() => {
    return this.allTables().reduce((acc, t) => acc + (t.row_count ?? 0), 0);
  });

  ngOnInit(): void {
    this.loadCatalog();
  }

  ngOnDestroy(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
    }
  }

  private loadCatalog(): void {
    this.loading.set(true);
    this.catalogApi.getCatalog().subscribe({
      next: (response) => {
        if (response) {
          this.catalog.set(response.catalog);
        }
        this.loading.set(false);
      },
      error: () => {
        this.catalog.set([]);
        this.loading.set(false);
      },
    });
  }

  private refreshCatalog(): void {
    this.catalogApi.getCatalog().subscribe({
      next: (response) => {
        if (response) {
          this.catalog.set(response.catalog);
          // Update selected table if still exists
          const selected = this.selectedTable();
          if (selected) {
            const updated = this.allTables().find((t) => t.name === selected.name);
            if (updated) {
              this.selectedTable.set(updated);
            }
          }
        }
      },
    });
  }

  protected handleExtract(): void {
    this.isExtracting.set(true);
    this.selectedTable.set(null);

    this.catalogApi.extractCatalog().subscribe({
      next: (result) => {
        if (result && result.status === 'pending') {
          // Extraction is async - poll for completion
          this.pollForExtraction();
        } else if (result) {
          // Synchronous result
          this.refreshCatalog();
          this.isExtracting.set(false);
        } else {
          this.isExtracting.set(false);
        }
      },
      error: () => {
        this.isExtracting.set(false);
      },
    });
  }

  private pollForExtraction(): void {
    // Poll every 2 seconds for extraction completion
    const pollInterval = setInterval(() => {
      this.catalogApi.getLatestRun().subscribe({
        next: (response) => {
          const run = response.run?.[0];
          if (run) {
            if (run.status === 'completed') {
              clearInterval(pollInterval);
              this.refreshCatalog();
              this.isExtracting.set(false);
            } else if (run.status === 'failed') {
              clearInterval(pollInterval);
              this.isExtracting.set(false);
            }
            // Keep polling if still running/pending
          }
        },
        error: () => {
          clearInterval(pollInterval);
          this.isExtracting.set(false);
        },
      });
    }, 2000);

    // Safety timeout after 60 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
      if (this.isExtracting()) {
        this.refreshCatalog();
        this.isExtracting.set(false);
      }
    }, 60000);
  }

  protected handleEnrich(): void {
    const tableIds = this.allTables()
      .filter((t): t is CatalogTable & { id: number } => t.is_enabled && t.id !== undefined)
      .map((t) => t.id);

    if (tableIds.length === 0) {
      return;
    }

    // Check LLM status first
    this.llmApi.getStatus().subscribe({
      next: (status) => {
        if (status.status === 'error') {
          // LLM not configured
          return;
        }

        this.isEnriching.set(true);
        this.selectedTable.set(null);

        // Start polling for updates
        this.pollingInterval = setInterval(() => {
          this.refreshCatalog();
        }, 3000);

        this.catalogApi.enrichCatalog(tableIds).subscribe({
          next: () => {
            if (this.pollingInterval !== null) {
              clearInterval(this.pollingInterval);
              this.pollingInterval = null;
            }
            this.refreshCatalog();
            this.isEnriching.set(false);
          },
          error: () => {
            if (this.pollingInterval !== null) {
              clearInterval(this.pollingInterval);
              this.pollingInterval = null;
            }
            this.isEnriching.set(false);
          },
        });
      },
    });
  }

  protected handleDelete(): void {
    this.showDeleteConfirm.set(false);
    this.isDeleting.set(true);
    this.selectedTable.set(null);

    this.catalogApi.deleteCatalog().subscribe({
      next: (success) => {
        if (success) {
          this.catalog.set([]);
        }
        this.isDeleting.set(false);
      },
      error: () => {
        this.isDeleting.set(false);
      },
    });
  }

  protected selectTable(table: CatalogTable): void {
    this.selectedTable.set(table);
    this.cancelEdit();
  }

  protected toggleTableEnabled(table: CatalogTable): void {
    const tableId = table.id;
    if (tableId === undefined) return;

    // Optimistic update
    const newState = !table.is_enabled;
    this.updateTableInCatalog(tableId, { is_enabled: newState });

    // Call API (which returns the actual state)
    this.catalogApi.toggleTableEnabled(tableId).subscribe({
      next: (response) => {
        if (response) {
          this.updateTableInCatalog(response.table_id, { is_enabled: response.is_enabled });
        }
      },
      error: () => {
        // Revert on error
        this.updateTableInCatalog(tableId, { is_enabled: !newState });
      },
    });
  }

  private updateTableInCatalog(tableId: number, updates: Partial<CatalogTable>): void {
    this.catalog.update((prev) =>
      prev.map((ds) => ({
        ...ds,
        tables: ds.tables.map((t) =>
          t.id === tableId ? { ...t, ...updates } : t
        ),
      }))
    );

    // Update selected table if it's the one being modified
    const selected = this.selectedTable();
    if (selected?.id === tableId) {
      this.selectedTable.set({ ...selected, ...updates });
    }
  }

  protected startEditColumn(col: CatalogColumn): void {
    if (col.id === undefined) return;
    this.editingColumnId.set(col.id);
    this.editingDescription = col.description ?? '';
  }

  protected saveColumnDescription(col: CatalogColumn): void {
    if (col.id === undefined) return;
    const description = this.editingDescription.trim();
    if (description === '') return;

    this.catalogApi.updateColumnDescription(col.id, description).subscribe({
      next: (success) => {
        if (success) {
          // Update in catalog
          this.catalog.update((prev) =>
            prev.map((ds) => ({
              ...ds,
              tables: ds.tables.map((t) => ({
                ...t,
                columns: t.columns.map((c) =>
                  c.id === col.id ? { ...c, description } : c
                ),
              })),
            }))
          );

          // Update selected table
          const selected = this.selectedTable();
          if (selected) {
            this.selectedTable.set({
              ...selected,
              columns: selected.columns.map((c) =>
                c.id === col.id ? { ...c, description } : c
              ),
            });
          }
        }
        this.cancelEdit();
      },
      error: () => {
        this.cancelEdit();
      },
    });
  }

  protected cancelEdit(): void {
    this.editingColumnId.set(null);
    this.editingDescription = '';
  }

  protected formatNumber(num: number): string {
    return num.toLocaleString('fr-FR');
  }

  protected getBaseType(dataType: string): string {
    return dataType.split('(')[0];
  }

  protected hasColumnStats(table: CatalogTable): boolean {
    return table.columns.some(
      (c) => c.full_context !== null || c.sample_values !== null || c.value_range !== null
    );
  }

  protected getColumnsWithStats(table: CatalogTable): CatalogColumn[] {
    return table.columns.filter(
      (c) => c.full_context !== null || c.sample_values !== null || c.value_range !== null
    );
  }
}
