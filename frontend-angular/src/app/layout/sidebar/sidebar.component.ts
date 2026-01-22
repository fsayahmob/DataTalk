import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { LocaleService } from '../../core/services/locale.service';
import { LlmApiService } from '../../core/services/llm-api.service';

interface NavItem {
  href: string;
  labelKey: string;
  icon: string; // SVG path or icon name
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'sidebar.analytics', icon: 'chart' },
  { href: '/datasets', labelKey: 'sidebar.datasets', icon: 'database' },
  { href: '/catalog', labelKey: 'sidebar.catalog', icon: 'catalog' },
  { href: '/runs', labelKey: 'sidebar.runs', icon: 'activity' },
  { href: '/settings', labelKey: 'sidebar.settings', icon: 'settings' },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslateModule],
  template: `
    <div
      class="flex flex-col bg-sidebar border-r border-border/30 transition-all duration-300 ease-in-out"
      [class.w-14]="collapsed()"
      [class.w-48]="!collapsed()"
    >
      <!-- Logo + Title -->
      <div class="h-14 flex items-center border-b border-border/30 px-2">
        <button
          (click)="toggleCollapse()"
          class="w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden flex-shrink-0"
          [attr.title]="collapsed() ? (translate.instant('sidebar.open_menu')) : (translate.instant('sidebar.close_menu'))"
        >
          <img
            src="/logo.png"
            alt="TalkData"
            class="w-10 h-10 object-contain"
          />
        </button>
        @if (!collapsed()) {
          <span class="ml-2 font-semibold text-foreground whitespace-nowrap">
            TalkData
          </span>
        }
      </div>

      <!-- Navigation -->
      <nav class="flex-1 py-4">
        <ul class="space-y-1 px-2">
          @for (item of navItems; track item.href) {
            <li>
              <a
                [routerLink]="item.href"
                routerLinkActive="bg-primary/20 text-primary border border-primary/30"
                [routerLinkActiveOptions]="{ exact: item.href === '/' }"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                [attr.title]="collapsed() ? (item.labelKey | translate) : null"
              >
                <span class="w-[18px] h-[18px] flex-shrink-0 inline-flex items-center justify-center" [innerHTML]="getIcon(item.icon)"></span>
                @if (!collapsed()) {
                  <span class="text-sm font-medium">{{ item.labelKey | translate }}</span>
                }
              </a>
            </li>
          }
        </ul>
      </nav>

      <!-- LLM Status -->
      <div class="px-2 py-3 border-t border-border/30">
        <div
          class="relative group flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30"
          [class.justify-center]="collapsed()"
        >
          <span
            class="w-2.5 h-2.5 rounded-full flex-shrink-0"
            [class.bg-status-success]="llmConnected()"
            [class.shadow-status-success/50]="llmConnected()"
            [class.bg-status-error]="!llmConnected()"
            [class.shadow-status-error/50]="!llmConnected()"
          ></span>
          @if (!collapsed()) {
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-muted-foreground uppercase tracking-wider">
                {{ (llmConnected() ? 'common.connected' : 'common.disconnected') | translate }}
              </p>
              <p class="text-xs font-medium text-foreground truncate">
                {{ llmModel() || ('sidebar.not_configured' | translate) }}
              </p>
            </div>
          }
        </div>
      </div>

      <!-- Footer: Theme + Language + Collapse -->
      <div class="p-2 border-t border-border/30 space-y-1">
        <div class="flex items-center" [class.justify-center]="collapsed()" [class.justify-between]="!collapsed()" [class.px-2]="!collapsed()">
          @if (!collapsed()) {
            <span class="text-xs text-muted-foreground">{{ 'settings.theme' | translate }}</span>
          }
          <!-- Theme toggle -->
          <button (click)="toggleTheme()" class="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors" title="Toggle theme">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>
        </div>
        <div class="flex items-center" [class.justify-center]="collapsed()" [class.justify-between]="!collapsed()" [class.px-2]="!collapsed()">
          @if (!collapsed()) {
            <span class="text-xs text-muted-foreground">{{ 'settings.language' | translate }}</span>
          }
          <!-- Language toggle -->
          <button (click)="toggleLanguage()" class="p-2 rounded-lg hover:bg-secondary/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" title="Toggle language">
            {{ currentLang().toUpperCase() }}
          </button>
        </div>
        <button
          (click)="toggleCollapse()"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          [attr.title]="collapsed() ? (translate.instant('sidebar.open_menu')) : (translate.instant('sidebar.close_menu'))"
        >
          <svg
            class="w-4 h-4 transition-transform"
            [class.rotate-180]="collapsed()"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          @if (!collapsed()) {
            <span class="text-xs">{{ 'sidebar.collapse' | translate }}</span>
          }
        </button>
      </div>
    </div>
  `,
})
export class SidebarComponent implements OnInit {
  protected readonly translate = inject(TranslateService);
  private readonly localeService = inject(LocaleService);
  private readonly llmApiService = inject(LlmApiService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input() set collapsedInput(value: boolean) {
    this.collapsed.set(value);
  }
  @Output() collapseChange = new EventEmitter<boolean>();

  protected readonly collapsed = signal(true);
  protected readonly llmConnected = signal(false);
  protected readonly llmModel = signal<string | null>(null);
  protected readonly currentLang = signal(this.localeService.getCurrentLocale());

  protected readonly navItems = NAV_ITEMS;

  ngOnInit(): void {
    // Subscribe to locale changes
    this.localeService.getLocale$().subscribe((locale) => {
      this.currentLang.set(locale);
    });

    // Fetch LLM status
    this.llmApiService.getStatus().subscribe({
      next: (status) => {
        this.llmConnected.set(status.status === 'ok');
        this.llmModel.set(status.model ?? null);
      },
      error: () => {
        this.llmConnected.set(false);
        this.llmModel.set(null);
      },
    });
  }

  toggleCollapse(): void {
    const newValue = !this.collapsed();
    this.collapsed.set(newValue);
    this.collapseChange.emit(newValue);
  }

  toggleLanguage(): void {
    const newLocale = this.currentLang() === 'fr' ? 'en' : 'fr';
    this.localeService.setLocale(newLocale);
  }

  toggleTheme(): void {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  }

  protected getIcon(iconName: string): SafeHtml {
    const icons: Record<string, string> = {
      chart: `<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>`,
      database: `<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>`,
      catalog: `<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>`,
      activity: `<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>`,
      settings: `<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>`,
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[iconName] || '');
  }
}
