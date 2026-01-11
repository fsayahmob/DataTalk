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

// Health & Settings
export async function checkApiStatus(): Promise<"ok" | "error"> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return data.gemini === "configured" ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function saveApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gemini_api_key: apiKey }),
    });
    return res.ok;
  } catch {
    return false;
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

// Analyse
export async function analyzeInConversation(
  conversationId: number,
  question: string
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
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

export interface CatalogRelationship {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  constraint_name?: string;
}

export interface CatalogExtractResponse {
  datasource: string;
  tables: CatalogTable[];
  relationships: CatalogRelationship[];
}

export interface CatalogEnrichResponse {
  tables: CatalogTable[];
}

export interface CatalogApplyResponse {
  status: string;
  message: string;
  stats: {
    tables: number;
    columns: number;
    synonyms: number;
  };
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

// Extraire la structure depuis DuckDB
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

// Enrichir avec LLM
export async function enrichCatalog(
  tables: CatalogTable[]
): Promise<CatalogEnrichResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur enrichissement catalogue:", e);
    return null;
  }
}

// Appliquer le catalogue
export async function applyCatalog(
  tables: CatalogTable[]
): Promise<CatalogApplyResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur application catalogue:", e);
    return null;
  }
}

// Générer le catalogue complet (extract + enrich + save)
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
