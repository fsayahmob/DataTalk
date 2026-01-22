// Central export for all API modules
// Usage: import { fetchLLMStatus, LLMProvider } from "@/lib/api"

// ============ Types ============
export * from "./types";

// ============ LLM ============
export {
  fetchLLMStatus,
  saveApiKey,
  saveProviderConfig,
  fetchLLMProviders,
  fetchLLMModels,
  fetchDefaultModel,
  setDefaultModel,
  fetchLLMCosts,
  fetchLLMPrompts,
  setActivePromptVersion,
  // Legacy prompts
  fetchPrompts,
  fetchPrompt,
  updatePrompt,
} from "./llm";

// ============ Reports ============
export {
  fetchSavedReports,
  saveReport,
  deleteReport,
  executeReport,
  fetchSharedReport,
} from "./reports";

// ============ Conversations ============
export {
  fetchConversations,
  createConversation,
  fetchConversationMessages,
  deleteAllConversations,
  analyzeInConversation,
} from "./conversations";

// ============ Catalog ============
export {
  fetchCatalog,
  generateCatalog,
  extractCatalog,
  enrichCatalog,
  deleteCatalog,
  toggleTableEnabled,
  updateColumnDescription,
  fetchLatestRun,
  fetchRun,
  fetchCatalogJobs,
  fetchRuns,
  retryJob,
} from "./catalog";

// ============ Settings ============
export {
  fetchCatalogContextMode,
  setCatalogContextMode,
  fetchDatabaseStatus,
  setDuckdbPath,
  fetchMaxTablesPerBatch,
  setMaxTablesPerBatch,
  fetchMaxChartRows,
  setMaxChartRows,
} from "./settings";

// ============ Widgets ============
export {
  fetchSuggestedQuestions,
  fetchKpis,
} from "./widgets";

// ============ Datasets ============
export {
  fetchDatasets,
  fetchDataset,
  createDataset,
  updateDataset,
  deleteDataset,
  activateDataset,
  fetchActiveDataset,
  refreshDatasetStats,
  checkDatasetSyncStatus,
} from "./datasets";

// ============ Datasources ============
export {
  createDatasource,
  fetchDatasources,
  fetchDatasource,
  updateDatasource,
  deleteDatasource,
  triggerDatasourceSync,
} from "./datasources";
export type { CreateDatasourceRequest, UpdateDatasourceRequest, TriggerSyncResponse } from "./datasources";

// ============ Connectors ============
export {
  fetchConnectors,
  fetchConnectorCategories,
  fetchConnectorSpec,
  testConnection,
  discoverCatalog,
  checkAirbyteStatus,
} from "./connectors";
export type {
  Connector,
  ConnectorCategory,
  ConnectorsResponse,
  CategoriesResponse,
  ConnectorSpec,
  TestConnectionResponse,
  DiscoveredStream,
  DiscoveredColumn,
  DiscoverResponse,
} from "./connectors";

// ============ Tasks (Celery) ============
export {
  fetchTaskStatus,
  revokeTask,
  isTaskRunning,
  isTaskComplete,
} from "./tasks";
export type { TaskState, TaskStatusResponse } from "./tasks";
