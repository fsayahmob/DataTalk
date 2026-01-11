// Service API centralisé pour G7 Analytics

import { ChartConfig } from "./schema";

const API_BASE = "http://localhost:8000";

// Ré-export des types depuis @/types pour centralisation
export type {
  Message,
  PredefinedQuestion,
  SavedReport,
  Conversation,
  CategoryStat,
  SemanticStats,
  GlobalStats,
} from "@/types";

// Types spécifiques API
export interface AnalysisResponse {
  message_id: number;
  message: string;
  sql: string;
  sql_error?: string;
  data: Record<string, unknown>[];
  chart: ChartConfig;
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
}

// Health & Settings
export async function checkApiStatus(): Promise<"ok" | "error"> {
  try {
    const res = await fetch(`${API_BASE}/llm/status`);
    const data: LLMStatus = await res.json();
    return data.status === "ok" ? "ok" : "error";
  } catch {
    return "error";
  }
}

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

export async function fetchLLMCosts(days: number = 30): Promise<LLMCosts | null> {
  try {
    const res = await fetch(`${API_BASE}/llm/costs?days=${days}`);
    return await res.json();
  } catch {
    return null;
  }
}

// Questions prédéfinies
export async function fetchPredefinedQuestions(): Promise<
  import("@/types").PredefinedQuestion[]
> {
  try {
    const res = await fetch(`${API_BASE}/questions/predefined`);
    const data = await res.json();
    return data.questions || [];
  } catch (e) {
    console.error("Erreur chargement questions:", e);
    return [];
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
  useContext: boolean = false
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, filters, use_context: useContext }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Erreur serveur");
  }

  return data;
}

// Stats sémantiques
export async function fetchSemanticStats(): Promise<
  import("@/types").SemanticStats | null
> {
  try {
    const res = await fetch(`${API_BASE}/semantic-stats`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur chargement stats sémantiques:", e);
    return null;
  }
}

// Stats globales (KPIs)
export async function fetchGlobalStats(): Promise<
  import("@/types").GlobalStats | null
> {
  try {
    const res = await fetch(`${API_BASE}/stats/global`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur chargement stats globales:", e);
    return null;
  }
}

// ============ Catalogue de données ============

export interface CatalogColumn {
  id?: number;
  name: string;
  data_type: string;
  description: string | null;
  sample_values: string | null;
  value_range: string | null;
  synonyms?: string[];
}

export interface CatalogTable {
  id?: number;
  name: string;
  description: string | null;
  row_count: number | null;
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

export async function deleteCatalog(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/catalog`, { method: "DELETE" });
    return res.ok;
  } catch (e) {
    console.error("Erreur suppression catalogue:", e);
    return false;
  }
}
