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
} from "./datasets";
