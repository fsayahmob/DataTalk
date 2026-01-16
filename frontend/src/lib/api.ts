// Service API centralisé pour G7 Analytics

import { ChartConfig } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Ré-export des types depuis @/types pour centralisation
export type {
  Message,
  PredefinedQuestion,
  SavedReport,
  Conversation,
} from "@/types";

// Types spécifiques API
export interface AnalysisResponse {
  message_id: number;
  message: string;
  sql: string;
  sql_error?: string;
  data: Record<string, unknown>[];
  chart: ChartConfig;
  chart_disabled?: boolean;
  chart_disabled_reason?: string;
  model_name?: string;
  tokens_input?: number;
  tokens_output?: number;
  response_time_ms?: number;
}

// ============ API Functions ============

// ============ LLM Types ============
export interface LLMProvider {
  id: number;
  name: string;
  display_name: string;
  type: "cloud" | "self-hosted";
  base_url: string | null;
  requires_api_key: boolean;
  api_key_configured: boolean;
  api_key_hint: string | null;
  is_available: boolean;
}

export interface LLMModel {
  id: number;
  provider_id: number;
  model_id: string;
  display_name: string;
  context_window: number;
  cost_per_1m_input: number | null;
  cost_per_1m_output: number | null;
  is_default: boolean;
}

export interface LLMStatus {
  status: "ok" | "error";
  message?: string;
  model?: string;
  provider?: string;
}

export interface LLMCosts {
  period_days: number;
  total: {
    total_calls: number;
    total_tokens_input: number;
    total_tokens_output: number;
    total_cost: number;
  };
  by_hour: Array<{
    hour: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }>;
  by_model: Array<{
    model_name: string;
    provider_name: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }>;
  by_source: Array<{
    source: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }>;
}

// Health & Settings
export async function fetchLLMStatus(): Promise<LLMStatus> {
  try {
    const res = await fetch(`${API_BASE}/llm/status`);
    return await res.json();
  } catch {
    return { status: "error", message: "Connexion impossible" };
  }
}

export async function saveApiKey(
  providerName: string,
  apiKey: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_name: providerName, api_key: apiKey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function saveProviderConfig(
  providerName: string,
  baseUrl: string | null
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/llm/providers/${providerName}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: baseUrl }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// LLM Providers & Models
export async function fetchLLMProviders(): Promise<LLMProvider[]> {
  try {
    const res = await fetch(`${API_BASE}/llm/providers`);
    const data = await res.json();
    return data.providers || [];
  } catch (e) {
    console.error("Erreur chargement providers:", e);
    return [];
  }
}

export async function fetchLLMModels(
  providerName?: string
): Promise<LLMModel[]> {
  try {
    const url = providerName
      ? `${API_BASE}/llm/models?provider_name=${providerName}`
      : `${API_BASE}/llm/models`;
    const res = await fetch(url);
    const data = await res.json();
    return data.models || [];
  } catch (e) {
    console.error("Erreur chargement modèles:", e);
    return [];
  }
}

export async function fetchDefaultModel(): Promise<LLMModel | null> {
  try {
    const res = await fetch(`${API_BASE}/llm/models/default`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.model;
  } catch {
    return null;
  }
}

export async function setDefaultModel(modelId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/llm/models/default/${modelId}`, {
      method: "PUT",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLLMCosts(days = 30): Promise<LLMCosts | null> {
  try {
    const res = await fetch(`${API_BASE}/llm/costs?days=${days}`);
    return await res.json();
  } catch {
    return null;
  }
}

// Rapports
export async function fetchSavedReports(): Promise<
  import("@/types").SavedReport[]
> {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    const data = await res.json();
    return data.reports || [];
  } catch (e) {
    console.error("Erreur chargement rapports:", e);
    return [];
  }
}

export async function saveReport(
  title: string,
  question: string,
  sql_query: string,
  chart_config: string,
  message_id: number
): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, question, sql_query, chart_config, message_id }),
    });
    return true;
  } catch (e) {
    console.error("Erreur sauvegarde:", e);
    return false;
  }
}

export async function deleteReport(id: number): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/reports/${id}`, { method: "DELETE" });
    return true;
  } catch (e) {
    console.error("Erreur suppression:", e);
    return false;
  }
}

// Type pour la réponse d'exécution d'un rapport
export interface ExecuteReportResponse {
  report_id: number;
  title: string;
  sql: string;
  chart: ChartConfig;
  data: Record<string, unknown>[];
}

export async function executeReport(
  reportId: number
): Promise<ExecuteReportResponse> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/execute`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Erreur exécution rapport");
  }

  return data;
}

// Type pour la réponse d'un rapport partagé
export interface SharedReportResponse {
  title: string;
  question: string;
  sql: string;
  chart: ChartConfig;
  data: Record<string, unknown>[];
}

export async function fetchSharedReport(
  shareToken: string
): Promise<SharedReportResponse> {
  const res = await fetch(`${API_BASE}/reports/shared/${shareToken}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Rapport non trouvé");
  }

  return data;
}

// Conversations
export async function fetchConversations(): Promise<
  import("@/types").Conversation[]
> {
  try {
    const res = await fetch(`${API_BASE}/conversations`);
    const data = await res.json();
    return data.conversations || [];
  } catch (e) {
    console.error("Erreur chargement conversations:", e);
    return [];
  }
}

export async function createConversation(): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, { method: "POST" });
    const data = await res.json();
    return data.id;
  } catch (e) {
    console.error("Erreur création conversation:", e);
    return null;
  }
}

export async function fetchConversationMessages(
  conversationId: number
): Promise<import("@/types").Message[]> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
    const data = await res.json();
    return data.messages || [];
  } catch (e) {
    console.error("Erreur chargement messages:", e);
    return [];
  }
}

export async function deleteAllConversations(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, { method: "DELETE" });
    const data = await res.json();
    return data.count || 0;
  } catch (e) {
    console.error("Erreur suppression conversations:", e);
    return 0;
  }
}

// Filtres structurés
export interface AnalysisFilters {
  dateStart?: string;
  dateEnd?: string;
  noteMin?: string;
  noteMax?: string;
}

// Analyse
export async function analyzeInConversation(
  conversationId: number,
  question: string,
  filters?: AnalysisFilters,
  useContext = false,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, filters, use_context: useContext }),
    signal,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Erreur serveur");
  }

  return data;
}

// ============ Catalogue de données ============

export interface CatalogColumn {
  id?: number;
  name: string;
  data_type: string;
  description: string | null;
  sample_values: string | null;
  full_context: string | null;  // Contexte complet avec ENUM, ranges, statistiques
  value_range: string | null;
  synonyms?: string[];
}

export interface CatalogTable {
  id?: number;
  name: string;
  description: string | null;
  row_count: number | null;
  is_enabled: boolean;
  columns: CatalogColumn[];
}

export interface CatalogDatasource {
  id: number;
  name: string;
  type: string;
  path: string | null;
  description: string | null;
  tables: CatalogTable[];
}

export interface CatalogResponse {
  catalog: CatalogDatasource[];
}

// Récupérer le catalogue actuel
export async function fetchCatalog(): Promise<CatalogResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur chargement catalogue:", e);
    return null;
  }
}

// Générer le catalogue complet
export interface CatalogGenerateResponse {
  status: string;
  message: string;
  tables_count: number;
  columns_count: number;
}

export async function generateCatalog(): Promise<CatalogGenerateResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/generate`, { method: "POST" });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur génération catalogue:", e);
    return null;
  }
}

// ÉTAPE 1: Extraction du schéma SANS enrichissement LLM
export interface CatalogExtractResponse {
  status: string;
  message: string;
  tables_count: number;
  columns_count: number;
}

export async function extractCatalog(): Promise<CatalogExtractResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/extract`, { method: "POST" });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur extraction catalogue:", e);
    return null;
  }
}

// ÉTAPE 2: Enrichissement LLM des tables sélectionnées
export interface CatalogEnrichResponse {
  status: string;
  message: string;
  tables_count?: number;
  columns_count?: number;
  synonyms_count?: number;
  kpis_count?: number;
  // Champs d'erreur structurée
  error_type?: "vertex_ai_schema_too_complex" | "llm_error";
  suggestion?: string;
}

export async function enrichCatalog(tableIds: number[]): Promise<CatalogEnrichResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_ids: tableIds }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur enrichissement catalogue:", e);
    return null;
  }
}

export async function deleteCatalog(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/catalog`, { method: "DELETE" });
    return res.ok;
  } catch (e) {
    console.error("Erreur suppression catalogue:", e);
    return false;
  }
}

// Toggle l'état is_enabled d'une table
export interface ToggleTableResponse {
  status: string;
  table_id: number;
  is_enabled: boolean;
  message: string;
}

export async function toggleTableEnabled(
  tableId: number
): Promise<ToggleTableResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/tables/${tableId}/toggle`, {
      method: "PATCH",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Erreur toggle table:", e);
    return null;
  }
}

// ============ Prompts LLM ============

export interface LLMPrompt {
  id: number;
  key: string;
  name: string;
  category: string;
  content: string;
  version: string;
  is_active: boolean;
  tokens_estimate: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLLMPrompts(category?: string): Promise<LLMPrompt[]> {
  try {
    const url = category
      ? `${API_BASE}/llm/prompts?category=${category}`
      : `${API_BASE}/llm/prompts`;
    const res = await fetch(url);
    const data = await res.json();
    return data.prompts || [];
  } catch (e) {
    console.error("Erreur chargement prompts:", e);
    return [];
  }
}

export async function setActivePromptVersion(
  key: string,
  version: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/llm/prompts/${key}/active`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ Settings génériques ============

export type CatalogContextMode = "compact" | "full";

export async function fetchCatalogContextMode(): Promise<CatalogContextMode> {
  try {
    const res = await fetch(`${API_BASE}/settings/catalog_context_mode`);
    if (!res.ok) return "full"; // défaut
    const data = await res.json();
    return data.value as CatalogContextMode;
  } catch {
    return "full";
  }
}

export async function setCatalogContextMode(
  mode: CatalogContextMode
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/catalog_context_mode`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: mode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ Database Status ============

export interface DatabaseStatus {
  status: "connected" | "disconnected";
  path: string | null;
  configured_path: string;
  engine: string;
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/database/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement statut DB:", e);
    return null;
  }
}

export async function setDuckdbPath(path: string): Promise<{ success: boolean; error?: string; resolved_path?: string }> {
  try {
    const res = await fetch(`${API_BASE}/settings/duckdb_path`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: path }),
    });
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.detail || "Erreur" };
    }
    const data = await res.json();
    return { success: true, resolved_path: data.resolved_path };
  } catch (e) {
    console.error("Erreur mise à jour chemin DuckDB:", e);
    return { success: false, error: String(e) };
  }
}

// ============ Settings Catalog ============

export async function fetchMaxTablesPerBatch(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_tables_per_batch`);
    if (!res.ok) return 15;
    const data = await res.json();
    return parseInt(data.value, 10) || 15;
  } catch {
    return 15;
  }
}

export async function setMaxTablesPerBatch(value: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_tables_per_batch`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: String(value) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchMaxChartRows(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_chart_rows`);
    if (!res.ok) return 5000; // Default value
    const data = await res.json();
    return parseInt(data.value, 10) || 5000;
  } catch {
    return 5000;
  }
}

export async function setMaxChartRows(value: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_chart_rows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: String(value) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ Widgets dynamiques ============

export interface WidgetChartConfig {
  x?: string;
  y?: string | string[];
  title?: string;
}

// ============ Questions suggérées ============

export interface SuggestedQuestion {
  id: number;
  question: string;
  category: string | null;
  icon: string | null;
  business_value: string | null;
  display_order: number;
  is_enabled: boolean;
}

export async function fetchSuggestedQuestions(): Promise<SuggestedQuestion[]> {
  try {
    const res = await fetch(`${API_BASE}/suggested-questions`);
    const data = await res.json();
    return data.questions || [];
  } catch (e) {
    console.error("Erreur chargement questions suggérées:", e);
    return [];
  }
}

// ============ KPIs dynamiques ============

export interface KpiTrend {
  value: number;
  direction: "up" | "down";
  label?: string;
  invert?: boolean; // Si true, inverser les couleurs (baisse=vert, hausse=rouge)
}

export interface KpiSparkline {
  data: number[];
  type: "area" | "bar";
}

export interface KpiCompactData {
  id: string;
  title: string;
  value: number | string;
  trend?: KpiTrend;
  sparkline?: KpiSparkline;
  footer?: string;
}

export interface KpisResponse {
  kpis: KpiCompactData[];
}

export async function fetchKpis(): Promise<KpiCompactData[]> {
  try {
    const res = await fetch(`${API_BASE}/kpis`);
    const data: KpisResponse = await res.json();
    return data.kpis || [];
  } catch (e) {
    console.error("Erreur chargement KPIs:", e);
    return [];
  }
}

// ============ Catalog Jobs / Run ============

export interface CatalogJob {
  id: number;
  run_id: string;
  job_type: "extraction" | "enrichment";
  status: "pending" | "running" | "completed" | "failed";
  current_step: string | null;
  step_index: number | null;
  total_steps: number | null;
  progress: number;
  details: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface RunResponse {
  run: CatalogJob[];
}

export async function fetchLatestRun(): Promise<RunResponse> {
  try {
    const res = await fetch(`${API_BASE}/catalog/latest-run`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log("Aucune run trouvée (404)");
      } else {
        console.error(`Erreur serveur (${res.status})`);
      }
      return { run: [] };
    }
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement run:", e);
    return { run: [] };
  }
}

export async function fetchRun(runId: string): Promise<RunResponse> {
  try {
    const res = await fetch(`${API_BASE}/catalog/run/${runId}`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Run ${runId} non trouvée (404)`);
      } else {
        console.error(`Erreur serveur (${res.status})`);
      }
      return { run: [] };
    }
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement run:", e);
    return { run: [] };
  }
}

export async function fetchCatalogJobs(limit = 50): Promise<CatalogJob[]> {
  try {
    const res = await fetch(`${API_BASE}/catalog/jobs?limit=${limit}`);
    const data = await res.json();
    return data.jobs || [];
  } catch (e) {
    console.error("Erreur chargement jobs:", e);
    return [];
  }
}

// ========================================
// RUNS API
// ========================================

export interface Run {
  id: number;
  run_id: string;
  job_type: "extraction" | "enrichment";
  started_at: string;
  completed_at: string | null;
  status: "pending" | "running" | "completed" | "failed";
  current_step: string | null;
  step_index: number | null;
  total_steps: number | null;
  progress: number;
  details: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
}

export async function fetchRuns(): Promise<Run[]> {
  try {
    const res = await fetch(`${API_BASE}/catalog/runs`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.runs || [];
  } catch (e) {
    console.error("Erreur chargement runs:", e);
    return [];
  }
}

export async function updateColumnDescription(columnId: number, description: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/catalog/columns/${columnId}/description`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    return res.ok;
  } catch (e) {
    console.error("Erreur update description:", e);
    return false;
  }
}

// ========================================
// PROMPTS API
// ========================================

export interface Prompt {
  id: number;
  key: string;
  name: string;
  category: string;
  content: string;
  version: string;
  is_active: boolean;
  tokens_estimate: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchPrompts(): Promise<Prompt[]> {
  try {
    const res = await fetch(`${API_BASE}/prompts`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.prompts || [];
  } catch (e) {
    console.error("Erreur chargement prompts:", e);
    return [];
  }
}

export async function fetchPrompt(key: string): Promise<Prompt | null> {
  try {
    const res = await fetch(`${API_BASE}/prompts/${key}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`Erreur chargement prompt ${key}:`, e);
    return null;
  }
}

export async function updatePrompt(key: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/prompts/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch (e) {
    console.error(`Erreur mise à jour prompt ${key}:`, e);
    return false;
  }
}
