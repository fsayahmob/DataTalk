import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { WidgetsApiService, SavedReport, ReportsApiService } from '../../core/services';

interface KpiData {
  id: string;
  title: string;
  value: string | number;
  footer?: string;
}

const FALLBACK_KPIS: KpiData[] = [
  { id: 'total-evaluations', title: 'Total Évaluations', value: '—', footer: 'Chargement...' },
  { id: 'note-moyenne', title: 'Note Moyenne', value: '—', footer: 'Chargement...' },
  { id: 'commentaires', title: 'Commentaires', value: '—', footer: 'Chargement...' },
  { id: 'sentiment', title: 'Sentiment', value: '—', footer: 'Chargement...' },
];

@Component({
  selector: 'app-analytics-zone',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div
      class="flex flex-col bg-background transition-all duration-300 ease-in-out"
      [class.w-14]="collapsed()"
      [style.width]="collapsed() ? null : width() + '%'"
    >
      @if (collapsed()) {
        <div class="flex-1 flex flex-col items-center pt-3">
          <button
            (click)="toggleCollapse()"
            class="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
            [title]="'analytics.open' | translate"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      } @else {
        <!-- Header -->
        <div class="h-12 px-3 border-b border-border/50 bg-secondary/30 flex items-center justify-between flex-shrink-0">
          <h3 class="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {{ 'analytics.title' | translate }}
          </h3>
          <button
            (click)="toggleCollapse()"
            class="h-7 w-7 p-0 hover:bg-amber-500/20 rounded flex items-center justify-center"
            [title]="'common.collapse' | translate"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="flex-1 overflow-y-auto p-2 space-y-3">
          <!-- Saved Reports -->
          @if (savedReports().length > 0) {
            <div class="pb-2 border-b border-amber-500/10">
              <h4 class="text-[9px] text-amber-400/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {{ 'analytics.reports' | translate }}
              </h4>
              <div class="space-y-1">
                @for (report of savedReports().slice(0, 5); track report.id) {
                  <div
                    class="p-1.5 rounded border border-border/30 hover:bg-secondary/50 hover:border-primary/30 transition-all group cursor-pointer"
                    (click)="onReportClick.emit(report)"
                  >
                    <div class="flex items-center justify-between">
                      <p class="text-[10px] truncate text-foreground/80 flex-1">
                        {{ report.title }}
                      </p>
                      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          (click)="deleteReport(report, $event)"
                          class="text-[8px] text-destructive"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- KPIs -->
          <div class="flex flex-col gap-2">
            @for (kpi of kpis(); track kpi.id) {
              <div class="bg-secondary/30 border border-border/50 rounded-xl p-4">
                <p class="text-xs text-muted-foreground mb-2">{{ kpi.title }}</p>
                <p class="text-2xl font-bold text-foreground tabular-nums mb-3">
                  {{ formatValue(kpi.value) }}
                </p>
                @if (kpi.footer) {
                  <p class="text-xs text-muted-foreground">{{ kpi.footer }}</p>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AnalyticsZoneComponent implements OnInit {
  private readonly widgetsApi = inject(WidgetsApiService);
  private readonly reportsApi = inject(ReportsApiService);

  @Input() set collapsedInput(value: boolean) {
    this.collapsed.set(value);
  }
  @Input() set widthInput(value: number) {
    this.width.set(value);
  }

  @Output() collapseChange = new EventEmitter<boolean>();
  @Output() onReportClick = new EventEmitter<SavedReport>();
  @Output() onReportDelete = new EventEmitter<number>();

  protected readonly collapsed = signal(false);
  protected readonly width = signal(20);
  protected readonly kpis = signal<KpiData[]>(FALLBACK_KPIS);
  protected readonly savedReports = signal<SavedReport[]>([]);

  ngOnInit(): void {
    this.loadKpis();
    this.loadReports();
  }

  private loadKpis(): void {
    this.widgetsApi.getKpis().subscribe({
      next: (data) => {
        if (data.length > 0) {
          this.kpis.set(data.map(k => ({
            id: k.id,
            title: k.title,
            value: k.value,
            footer: k.footer,
          })));
        }
      },
    });
  }

  private loadReports(): void {
    this.reportsApi.getReports().subscribe({
      next: (reports: SavedReport[]) => {
        this.savedReports.set(reports);
      },
    });
  }

  toggleCollapse(): void {
    const newValue = !this.collapsed();
    this.collapsed.set(newValue);
    this.collapseChange.emit(newValue);
  }

  deleteReport(report: SavedReport, event: Event): void {
    event.stopPropagation();
    this.onReportDelete.emit(report.id);
  }

  formatValue(value: string | number): string {
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR');
    }
    return value;
  }
}
