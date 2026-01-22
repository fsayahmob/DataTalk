/**
 * Shared API types for DataTalk Angular frontend
 * Mirrors the backend API contracts
 */

// ============ Chart Types ============

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'table';
  x?: string;
  y?: string | string[];
  title?: string;
  colorScheme?: string;
  showLegend?: boolean;
}

// ============ Analysis Types ============

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

export interface AnalysisFilters {
  dateStart?: string;
  dateEnd?: string;
  noteMin?: string;
  noteMax?: string;
}

// ============ Conversation Types ============

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  sql_query: string | null;
  chart_config: ChartConfig | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface MessagesResponse {
  messages: Message[];
}

// ============ LLM Types ============

export interface LLMProvider {
  id: number;
  name: string;
  display_name: string;
  type: 'cloud' | 'self-hosted';
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
  status: 'ok' | 'error';
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
  by_hour: {
    hour: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }[];
  by_model: {
    model_name: string;
    provider_name: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }[];
  by_source: {
    source: string;
    calls: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }[];
}

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

// ============ Reports Types ============

export interface SavedReport {
  id: number;
  title: string;
  question: string;
  sql_query: string;
  chart_config: string;
  share_token: string | null;
  created_at: string;
}

export interface SavedReportsResponse {
  reports: SavedReport[];
}

export interface ExecuteReportResponse {
  report_id: number;
  title: string;
  sql: string;
  chart: ChartConfig;
  data: Record<string, unknown>[];
}

export interface SharedReportResponse {
  title: string;
  question: string;
  sql: string;
  chart: ChartConfig;
  data: Record<string, unknown>[];
}

// ============ Catalog Types ============

export interface CatalogColumn {
  id?: number;
  name: string;
  data_type: string;
  description: string | null;
  sample_values: string | null;
  full_context: string | null;
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

export interface CatalogGenerateResponse {
  status: string;
  message: string;
  tables_count: number;
  columns_count: number;
}

export interface CatalogExtractResponse {
  status: string;
  message: string;
  tables_count: number;
  columns_count: number;
}

export interface CatalogEnrichResponse {
  status: string;
  message: string;
  tables_count?: number;
  columns_count?: number;
  synonyms_count?: number;
  kpis_count?: number;
  error_type?: 'vertex_ai_schema_too_complex' | 'llm_error';
  suggestion?: string;
}

export interface ToggleTableResponse {
  status: string;
  table_id: number;
  is_enabled: boolean;
  message: string;
}

export interface CatalogJob {
  id: number;
  run_id: string;
  job_type: 'extraction' | 'enrichment';
  status: 'pending' | 'running' | 'completed' | 'failed';
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

export interface Run {
  id: number;
  run_id: string;
  job_type: 'extraction' | 'enrichment';
  started_at: string;
  completed_at: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: string | null;
  step_index: number | null;
  total_steps: number | null;
  progress: number;
  details: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
}

export interface RunResponse {
  run: CatalogJob[];
}

export interface RunsResponse {
  runs: Run[];
}

export interface CatalogJobsResponse {
  jobs: CatalogJob[];
}

// ============ Settings Types ============

export type CatalogContextMode = 'compact' | 'full';

export interface DatabaseStatus {
  status: 'connected' | 'disconnected';
  path: string | null;
  configured_path: string;
  engine: string;
}

export interface SettingValue {
  value: string;
}

export interface DuckdbPathResponse {
  success: boolean;
  error?: string;
  resolved_path?: string;
}

// ============ Widgets Types ============

export interface SuggestedQuestion {
  id: number;
  question: string;
  category: string | null;
  icon: string | null;
  business_value: string | null;
  display_order: number;
  is_enabled: boolean;
}

export interface SuggestedQuestionsResponse {
  questions: SuggestedQuestion[];
}

export interface KpiTrend {
  value: number;
  direction: 'up' | 'down';
  label?: string;
  invert?: boolean;
}

export interface KpiSparkline {
  data: number[];
  type: 'area' | 'bar';
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

// ============ Datasets Types ============

export type DatasetStatus = 'empty' | 'syncing' | 'ready' | 'error';

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  duckdb_path: string;
  status: DatasetStatus;
  is_active: boolean;
  row_count: number;
  table_count: number;
  size_bytes: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface DatasetsResponse {
  datasets: Dataset[];
  count: number;
  active_dataset_id: string | null;
}

export interface DatasetCreateRequest {
  name: string;
  description?: string;
}

export interface DatasetActivateResponse {
  dataset: Dataset;
}

// ============ Predefined Questions Types ============

export interface PredefinedQuestion {
  id: number;
  question: string;
  category: string;
  icon: string | null;
}

export interface PredefinedQuestionsResponse {
  questions: PredefinedQuestion[];
}
