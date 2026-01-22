import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import {
  LlmApiService,
  SettingsApiService,
  LocaleService,
  LLMProvider,
  LLMModel,
  LLMStatus,
  LLMCosts,
  LLMPrompt,
  DatabaseStatus,
  CatalogContextMode,
  Locale,
} from '../../core/services';

type SettingsTab = 'models' | 'keys' | 'prompts' | 'usage' | 'database' | 'appearance';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="flex-1 overflow-auto bg-background">
      <div class="max-w-6xl mx-auto px-6 py-4">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
          <div>
            <h1 class="text-lg font-semibold text-foreground">{{ 'settings.title' | translate }}</h1>
            <p class="text-xs text-muted-foreground">
              LLM:
              @if (llmStatus()?.status === 'ok') {
                <span class="text-status-success">{{ llmStatus()?.model }}</span>
              } @else {
                <span class="text-status-error">{{ 'sidebar.not_configured' | translate }}</span>
              }
            </p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-4 border-b border-border/30">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              (click)="activeTab.set(tab.id)"
              class="px-4 py-2 text-sm font-medium transition-colors -mb-px"
              [class.text-primary]="activeTab() === tab.id"
              [class.border-b-2]="activeTab() === tab.id"
              [class.border-primary]="activeTab() === tab.id"
              [class.text-muted-foreground]="activeTab() !== tab.id"
            >
              {{ tab.label | translate }}
            </button>
          }
        </div>

        <!-- Tab Content -->
        @switch (activeTab()) {
          @case ('models') {
            <div class="space-y-3">
              <!-- Filters -->
              <div class="flex items-center gap-3">
                <input
                  type="text"
                  [placeholder]="'settings.search_models' | translate"
                  [ngModel]="searchQuery()"
                  (ngModelChange)="searchQuery.set($event)"
                  class="w-64 h-8 px-3 text-xs bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <select
                  [ngModel]="selectedProvider()"
                  (ngModelChange)="selectedProvider.set($event)"
                  class="w-40 h-8 px-3 text-xs bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">{{ 'settings.all_providers' | translate }}</option>
                  @for (p of providers(); track p.id) {
                    <option [value]="p.name">{{ p.display_name }}</option>
                  }
                </select>
                <span class="text-xs text-muted-foreground">
                  {{ filteredModels().length }} {{ 'common.models' | translate }}
                </span>
              </div>

              <!-- Models Table -->
              @if (loading()) {
                <div class="flex items-center justify-center py-8">
                  <span class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                </div>
              } @else {
                <div class="border border-border/30 rounded-md overflow-hidden">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b border-border/30 bg-secondary/30">
                        <th class="text-xs font-medium text-muted-foreground text-left px-4 py-2">Model</th>
                        <th class="text-xs font-medium text-muted-foreground text-left px-4 py-2">Provider</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Context</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">$/1M in</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">$/1M out</th>
                        <th class="text-xs font-medium text-muted-foreground text-center px-4 py-2 w-20">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (model of filteredModels(); track model.id) {
                        <tr
                          class="border-b border-border/20 hover:bg-secondary/20 transition-colors"
                          [class.bg-primary/5]="model.is_default"
                        >
                          <td class="px-4 py-2">
                            <code class="text-xs text-foreground">{{ model.model_id }}</code>
                          </td>
                          <td class="px-4 py-2">
                            <div class="flex items-center gap-2">
                              <span class="text-xs text-muted-foreground">{{ getProviderName(model.provider_id) }}</span>
                              @switch (getProviderStatus(model.provider_id)) {
                                @case ('ready') {
                                  <span class="text-[10px] px-1 py-0 h-4 inline-flex items-center rounded border border-status-success/30 text-status-success">
                                    ready
                                  </span>
                                }
                                @case ('missing') {
                                  <span class="text-[10px] px-1 py-0 h-4 inline-flex items-center rounded border border-status-error/30 text-status-error">
                                    no key
                                  </span>
                                }
                                @case ('unavailable') {
                                  <span class="text-[10px] px-1 py-0 h-4 inline-flex items-center rounded border border-status-warning/30 text-status-warning">
                                    offline
                                  </span>
                                }
                              }
                            </div>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">
                              {{ formatContext(model.context_window) }}
                            </span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">
                              {{ model.cost_per_1m_input ?? '—' }}
                            </span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">
                              {{ model.cost_per_1m_output ?? '—' }}
                            </span>
                          </td>
                          <td class="px-4 py-2 text-center">
                            @if (model.is_default) {
                              <span class="text-primary text-sm">●</span>
                            } @else {
                              <button
                                type="button"
                                (click)="setDefaultModel(model.id)"
                                class="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
                                [title]="'settings.set_as_default' | translate"
                              >
                                ○
                              </button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }

          @case ('keys') {
            <div class="space-y-4">
              @if (loading()) {
                <div class="flex items-center justify-center py-8">
                  <span class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                </div>
              } @else {
                @for (provider of providers(); track provider.id) {
                  <div class="p-4 rounded-lg border border-border">
                    <div class="flex items-center justify-between mb-3">
                      <div>
                        <p class="font-medium text-foreground">{{ provider.display_name }}</p>
                        <p class="text-xs text-muted-foreground">
                          {{ provider.type === 'cloud' ? 'Cloud Provider' : 'Self-hosted' }}
                        </p>
                      </div>
                      @if (provider.api_key_configured) {
                        <span class="px-2 py-1 text-xs font-medium bg-status-success/20 text-status-success rounded-full">
                          Configured
                        </span>
                      } @else {
                        <span class="px-2 py-1 text-xs font-medium bg-status-warning/20 text-status-warning rounded-full">
                          Not configured
                        </span>
                      }
                    </div>

                    @if (provider.requires_api_key) {
                      <div class="flex gap-2">
                        <input
                          type="password"
                          [placeholder]="provider.api_key_hint ?? 'Enter API key'"
                          [(ngModel)]="apiKeys[provider.name]"
                          class="flex-1 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          type="button"
                          (click)="saveApiKey(provider.name)"
                          class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                          {{ 'common.save' | translate }}
                        </button>
                      </div>
                    }

                    @if (provider.type === 'self-hosted') {
                      <div class="mt-3">
                        <label [for]="'baseUrl-' + provider.id" class="block text-xs text-muted-foreground mb-1">Base URL</label>
                        <div class="flex gap-2">
                          <input
                            [id]="'baseUrl-' + provider.id"
                            type="text"
                            placeholder="http://localhost:11434"
                            [(ngModel)]="baseUrls[provider.name]"
                            class="flex-1 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            type="button"
                            (click)="saveBaseUrl(provider.name)"
                            class="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                          >
                            {{ 'common.save' | translate }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              }
            </div>
          }

          @case ('prompts') {
            <div class="space-y-4">
              <p class="text-xs text-muted-foreground mb-4">
                {{ 'prompts.description' | translate }}
              </p>

              @if (promptsLoading()) {
                <div class="flex items-center justify-center py-8">
                  <span class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                </div>
              } @else {
                @for (prompt of activePrompts(); track prompt.key) {
                  <div class="rounded-lg border border-border/30 bg-background">
                    <div class="py-3 px-4">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <span class="text-sm font-mono text-foreground">{{ prompt.name }}</span>
                          <span [class]="getCategoryColor(prompt.category)" class="text-xs">
                            {{ getCategoryLabel(prompt.category) }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2">
                          @if (prompt.key === 'analytics_system' && expandedPrompt() !== prompt.key) {
                            <select
                              [ngModel]="contextMode()"
                              (ngModelChange)="setContextMode($event)"
                              class="w-28 h-7 px-2 text-xs bg-secondary/50 border border-border rounded text-foreground focus:outline-none"
                              [disabled]="savingPrompt() === 'catalog_context_mode'"
                            >
                              <option value="compact">compact ~800t</option>
                              <option value="full">full ~2200t</option>
                            </select>
                          }
                          @if (editingPrompt() !== prompt.key) {
                            <button
                              type="button"
                              (click)="editPrompt(prompt)"
                              class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors"
                            >
                              {{ 'common.edit' | translate }}
                            </button>
                          }
                          <button
                            type="button"
                            (click)="togglePromptExpand(prompt.key)"
                            class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors"
                          >
                            {{ expandedPrompt() === prompt.key ? ('prompts.hide' | translate) : ('prompts.show' | translate) }}
                          </button>
                        </div>
                      </div>
                      @if (prompt.description) {
                        <p class="text-xs text-muted-foreground mt-1">{{ prompt.description }}</p>
                      }
                    </div>

                    @if (expandedPrompt() === prompt.key) {
                      <div class="px-4 pb-4">
                        @if (prompt.key === 'analytics_system' && editingPrompt() !== prompt.key) {
                          <div class="mb-3 p-2 rounded bg-primary/10 border border-primary/20">
                            <p class="text-xs text-muted-foreground">
                              <strong class="text-foreground">Mode {{ contextMode() }}:</strong>
                              {{ contextMode() === 'compact' ? ('prompts.mode_compact_desc' | translate) : ('prompts.mode_full_desc' | translate) }}
                            </p>
                          </div>
                        }

                        @if (editingPrompt() === prompt.key) {
                          <div class="space-y-3">
                            <textarea
                              [(ngModel)]="editedContent"
                              class="w-full h-96 px-3 py-2 rounded-md border border-border bg-sidebar font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                            ></textarea>
                            <div class="flex gap-2">
                              <button
                                type="button"
                                (click)="savePrompt(prompt)"
                                [disabled]="savingPrompt() === prompt.key || editedContent === prompt.content"
                                class="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                              >
                                {{ savingPrompt() === prompt.key ? ('prompts.saving' | translate) : ('common.save' | translate) }}
                              </button>
                              <button
                                type="button"
                                (click)="cancelEditPrompt()"
                                class="px-3 py-1.5 bg-secondary text-foreground rounded text-sm font-medium hover:bg-secondary/80 transition-colors"
                              >
                                {{ 'common.cancel' | translate }}
                              </button>
                            </div>
                          </div>
                        } @else {
                          <div class="bg-sidebar rounded-md p-3 max-h-64 overflow-auto">
                            <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{{ prompt.content }}</pre>
                          </div>
                          <div class="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                            <span>Key: {{ prompt.key }}</span>
                            @if (prompt.tokens_estimate) {
                              <span>Tokens: {{ prompt.tokens_estimate }}</span>
                            }
                            <span>MAJ: {{ formatDate(prompt.updated_at) }}</span>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                @if (activePrompts().length === 0) {
                  <div class="text-center py-8 text-muted-foreground">
                    <p class="text-sm">{{ 'settings.no_prompts' | translate }}</p>
                    <p class="text-xs mt-1">{{ 'prompts.init_help' | translate }}</p>
                  </div>
                }
              }
            </div>
          }

          @case ('usage') {
            <div class="space-y-4">
              <!-- Header with stats and filters -->
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex gap-4 text-xs">
                  @if (costs()?.total) {
                    <div>
                      <span class="text-muted-foreground">Calls:</span>
                      <span class="font-mono text-foreground ml-1">{{ costs()!.total.total_calls }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Input:</span>
                      <span class="font-mono text-foreground ml-1">{{ formatTokens(costs()!.total.total_tokens_input) }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Output:</span>
                      <span class="font-mono text-foreground ml-1">{{ formatTokens(costs()!.total.total_tokens_output) }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Cost:</span>
                      <span class="font-mono text-primary ml-1">\${{ costs()!.total.total_cost.toFixed(4) }}</span>
                    </div>
                  }
                </div>
                <div class="flex items-center gap-2">
                  <select
                    [(ngModel)]="costsPeriod"
                    (ngModelChange)="loadCosts()"
                    class="w-24 h-7 px-2 text-xs bg-secondary/50 border border-border rounded text-foreground focus:outline-none"
                  >
                    <option [ngValue]="7">7 days</option>
                    <option [ngValue]="30">30 days</option>
                    <option [ngValue]="90">90 days</option>
                  </select>
                </div>
              </div>

              @if (costsLoading()) {
                <div class="flex items-center justify-center py-8">
                  <span class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                </div>
              } @else if (costs()?.by_model && costs()!.by_model.length > 0) {
                <!-- Usage by model table -->
                <div class="border border-border/30 rounded-md overflow-hidden">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b border-border/30 bg-secondary/30">
                        <th class="text-xs font-medium text-muted-foreground text-left px-4 py-2">Model</th>
                        <th class="text-xs font-medium text-muted-foreground text-left px-4 py-2">Provider</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Calls</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Input</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Output</th>
                        <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of costs()!.by_model; track m.model_name) {
                        <tr class="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                          <td class="px-4 py-2">
                            <code class="text-xs text-foreground">{{ m.model_name }}</code>
                          </td>
                          <td class="px-4 py-2">
                            <span class="text-xs text-muted-foreground">{{ m.provider_name }}</span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">{{ m.calls }}</span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">{{ formatTokens(m.tokens_input) }}</span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-muted-foreground">{{ formatTokens(m.tokens_output) }}</span>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <span class="text-xs font-mono text-primary">\${{ m.cost.toFixed(4) }}</span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <!-- Usage by source -->
                @if (costs()?.by_source && costs()!.by_source.length > 0) {
                  <div class="border border-border/30 rounded-md overflow-hidden">
                    <div class="px-3 py-2 border-b border-border/30 bg-secondary/30">
                      <p class="text-xs text-muted-foreground">Usage by Source</p>
                    </div>
                    <table class="w-full">
                      <thead>
                        <tr class="border-b border-border/30">
                          <th class="text-xs font-medium text-muted-foreground text-left px-4 py-2">Source</th>
                          <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Calls</th>
                          <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Input</th>
                          <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Output</th>
                          <th class="text-xs font-medium text-muted-foreground text-right px-4 py-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (s of costs()!.by_source; track s.source) {
                          <tr class="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                            <td class="px-4 py-2">
                              <code class="text-xs text-foreground">{{ s.source }}</code>
                            </td>
                            <td class="px-4 py-2 text-right">
                              <span class="text-xs font-mono text-muted-foreground">{{ s.calls }}</span>
                            </td>
                            <td class="px-4 py-2 text-right">
                              <span class="text-xs font-mono text-muted-foreground">{{ formatTokens(s.tokens_input) }}</span>
                            </td>
                            <td class="px-4 py-2 text-right">
                              <span class="text-xs font-mono text-muted-foreground">{{ formatTokens(s.tokens_output) }}</span>
                            </td>
                            <td class="px-4 py-2 text-right">
                              <span class="text-xs font-mono text-primary">\${{ s.cost.toFixed(4) }}</span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              } @else {
                <p class="text-xs text-muted-foreground text-center py-8">No usage data</p>
              }
            </div>
          }

          @case ('database') {
            <div class="space-y-4">
              <div class="p-4 rounded-lg border border-border">
                <h3 class="font-medium text-foreground mb-3">{{ 'settings.database' | translate }}</h3>

                @if (dbStatus()) {
                  <div class="space-y-3">
                    <div class="flex items-center gap-2">
                      <span
                        class="w-2.5 h-2.5 rounded-full"
                        [class.bg-status-success]="dbStatus()?.status === 'connected'"
                        [class.bg-status-error]="dbStatus()?.status !== 'connected'"
                      ></span>
                      <span class="text-sm text-foreground">
                        {{ dbStatus()?.status === 'connected' ? ('settings.connected' | translate) : ('common.disconnected' | translate) }}
                      </span>
                    </div>

                    @if (dbStatus()?.path) {
                      <p class="text-xs text-muted-foreground">
                        Path: {{ dbStatus()?.path }}
                      </p>
                    }
                  </div>
                } @else {
                  <div class="flex items-center justify-center py-4">
                    <span class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                  </div>
                }
              </div>
            </div>
          }

          @case ('appearance') {
            <div class="space-y-6">
              <!-- Language -->
              <div class="p-4 rounded-lg border border-border">
                <h3 class="font-medium text-foreground mb-1">{{ 'settings.language' | translate }}</h3>
                <p class="text-xs text-muted-foreground mb-3">{{ 'settings.language_description' | translate }}</p>

                <div class="flex gap-2">
                  <button
                    type="button"
                    (click)="setLanguage('fr')"
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    [class.bg-primary]="currentLanguage() === 'fr'"
                    [class.text-primary-foreground]="currentLanguage() === 'fr'"
                    [class.bg-secondary]="currentLanguage() !== 'fr'"
                    [class.text-foreground]="currentLanguage() !== 'fr'"
                  >
                    Français
                  </button>
                  <button
                    type="button"
                    (click)="setLanguage('en')"
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    [class.bg-primary]="currentLanguage() === 'en'"
                    [class.text-primary-foreground]="currentLanguage() === 'en'"
                    [class.bg-secondary]="currentLanguage() !== 'en'"
                    [class.text-foreground]="currentLanguage() !== 'en'"
                  >
                    English
                  </button>
                </div>
              </div>

              <!-- Theme (placeholder) -->
              <div class="p-4 rounded-lg border border-border">
                <h3 class="font-medium text-foreground mb-1">{{ 'settings.theme' | translate }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ 'datasets.coming_soon' | translate }}
                </p>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly llmApi = inject(LlmApiService);
  private readonly settingsApi = inject(SettingsApiService);
  private readonly localeService = inject(LocaleService);

  // State
  protected readonly loading = signal(true);
  protected readonly llmStatus = signal<LLMStatus | null>(null);
  protected readonly providers = signal<LLMProvider[]>([]);
  protected readonly models = signal<LLMModel[]>([]);
  protected readonly dbStatus = signal<DatabaseStatus | null>(null);
  protected readonly currentLanguage = signal<Locale>(this.localeService.getCurrentLocale());

  // Prompts state
  protected readonly promptsLoading = signal(true);
  protected readonly prompts = signal<LLMPrompt[]>([]);
  protected readonly expandedPrompt = signal<string | null>(null);
  protected readonly editingPrompt = signal<string | null>(null);
  protected readonly savingPrompt = signal<string | null>(null);
  protected readonly contextMode = signal<CatalogContextMode>('full');
  protected editedContent = '';

  // Usage/Costs state
  protected readonly costsLoading = signal(false);
  protected readonly costs = signal<LLMCosts | null>(null);
  protected costsPeriod = 30;

  // UI state
  protected readonly activeTab = signal<SettingsTab>('models');
  protected readonly searchQuery = signal('');
  protected readonly selectedProvider = signal('all');

  // Form state
  protected apiKeys: Record<string, string> = {};
  protected baseUrls: Record<string, string> = {};

  protected readonly tabs: { id: SettingsTab; label: string }[] = [
    { id: 'models', label: 'settings.llm_models' },
    { id: 'keys', label: 'settings.api_keys' },
    { id: 'prompts', label: 'settings.prompts' },
    { id: 'usage', label: 'settings.usage' },
    { id: 'database', label: 'settings.database' },
    { id: 'appearance', label: 'settings.appearance' },
  ];

  // Computed: filtered models
  protected readonly filteredModels = computed(() => {
    let result = this.models();
    const provider = this.selectedProvider();
    const query = this.searchQuery();

    // Filter by provider
    if (provider !== 'all') {
      const p = this.providers().find((pr) => pr.name === provider);
      if (p) {
        result = result.filter((m) => m.provider_id === p.id);
      }
    }

    // Filter by search query
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m) =>
          m.model_id.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q)
      );
    }

    return result;
  });

  // Computed: active prompts only
  protected readonly activePrompts = computed(() => {
    return this.prompts().filter((p) => p.is_active);
  });

  ngOnInit(): void {
    this.loadData();
    this.loadPrompts();
    this.loadCosts();

    // Subscribe to language changes
    this.localeService.getLocale$().subscribe((locale) => {
      this.currentLanguage.set(locale);
    });
  }

  private loadData(): void {
    this.loading.set(true);

    // Load LLM status
    this.llmApi.getStatus().subscribe({
      next: (status) => { this.llmStatus.set(status); },
      error: () => { this.llmStatus.set(null); },
    });

    // Load providers
    this.llmApi.getProviders().subscribe({
      next: (providers) => {
        this.providers.set(providers);
        providers.forEach((p) => {
          if (p.base_url) {
            this.baseUrls[p.name] = p.base_url;
          }
        });
      },
    });

    // Load models
    this.llmApi.getModels().subscribe({
      next: (models) => {
        this.models.set(models);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });

    // Load database status
    this.settingsApi.getDatabaseStatus().subscribe({
      next: (status) => { this.dbStatus.set(status); },
    });
  }

  private loadPrompts(): void {
    this.promptsLoading.set(true);

    // Load prompts
    this.llmApi.getPrompts().subscribe({
      next: (prompts) => {
        this.prompts.set(prompts);
        this.promptsLoading.set(false);
      },
      error: () => {
        this.promptsLoading.set(false);
      },
    });

    // Load context mode
    this.settingsApi.getCatalogContextMode().subscribe({
      next: (mode) => { this.contextMode.set(mode); },
    });
  }

  loadCosts(): void {
    this.costsLoading.set(true);
    this.llmApi.getCosts(this.costsPeriod).subscribe({
      next: (costs) => {
        this.costs.set(costs);
        this.costsLoading.set(false);
      },
      error: () => {
        this.costsLoading.set(false);
      },
    });
  }

  getProviderName(providerId: number): string {
    const provider = this.providers().find((p) => p.id === providerId);
    return provider?.display_name ?? '';
  }

  getProviderStatus(providerId: number): 'ready' | 'unavailable' | 'missing' | null {
    const provider = this.providers().find((p) => p.id === providerId);
    if (!provider) return null;
    if (provider.is_available) return 'ready';
    if (!provider.requires_api_key) return 'unavailable';
    return 'missing';
  }

  formatContext(contextWindow: number): string {
    return `${(contextWindow / 1000).toFixed(0)}k`;
  }

  formatTokens(tokens: number): string {
    return `${(tokens / 1000).toFixed(1)}k`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  setDefaultModel(modelId: number): void {
    this.llmApi.setDefaultModel(modelId).subscribe({
      next: (success) => {
        if (success) {
          this.llmApi.getModels().subscribe({
            next: (models) => { this.models.set(models); },
          });
          this.llmApi.getStatus().subscribe({
            next: (status) => { this.llmStatus.set(status); },
          });
        }
      },
    });
  }

  saveApiKey(providerName: string): void {
    const apiKey = this.apiKeys[providerName];
    if (!apiKey) return;

    this.llmApi.saveApiKey(providerName, apiKey).subscribe({
      next: (success) => {
        if (success) {
          this.apiKeys[providerName] = '';
          this.llmApi.getProviders().subscribe({
            next: (providers) => { this.providers.set(providers); },
          });
        }
      },
    });
  }

  saveBaseUrl(providerName: string): void {
    const baseUrl = this.baseUrls[providerName];
    if (!baseUrl) return;

    this.llmApi.saveProviderConfig(providerName, baseUrl).subscribe({
      next: (success) => {
        if (success) {
          this.llmApi.getProviders().subscribe({
            next: (providers) => { this.providers.set(providers); },
          });
        }
      },
    });
  }

  setLanguage(locale: Locale): void {
    this.localeService.setLocale(locale);
  }

  // Prompts methods
  getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      analytics: 'text-blue-400',
      catalog: 'text-purple-400',
      enrichment: 'text-amber-400',
      widgets: 'text-green-400',
    };
    return colors[category] || 'text-gray-400';
  }

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      analytics: 'Analytics',
      catalog: 'Catalogue',
      enrichment: 'Enrichissement',
      widgets: 'Widgets',
    };
    return labels[category] || category;
  }

  togglePromptExpand(key: string): void {
    this.expandedPrompt.set(this.expandedPrompt() === key ? null : key);
  }

  editPrompt(prompt: LLMPrompt): void {
    this.editingPrompt.set(prompt.key);
    this.editedContent = prompt.content;
    this.expandedPrompt.set(prompt.key);
  }

  cancelEditPrompt(): void {
    this.editingPrompt.set(null);
    this.editedContent = '';
  }

  savePrompt(prompt: LLMPrompt): void {
    this.savingPrompt.set(prompt.key);
    this.llmApi.updatePrompt(prompt.id, this.editedContent).subscribe({
      next: (success) => {
        if (success) {
          this.editingPrompt.set(null);
          this.loadPrompts();
        }
        this.savingPrompt.set(null);
      },
      error: () => {
        this.savingPrompt.set(null);
      },
    });
  }

  setContextMode(mode: CatalogContextMode): void {
    this.savingPrompt.set('catalog_context_mode');
    this.settingsApi.setCatalogContextMode(mode).subscribe({
      next: (success) => {
        if (success) {
          this.contextMode.set(mode);
        }
        this.savingPrompt.set(null);
      },
      error: () => {
        this.savingPrompt.set(null);
      },
    });
  }
}
