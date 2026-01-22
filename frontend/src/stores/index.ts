/**
 * Zustand Stores - Central Export
 *
 * Convention:
 * - useXxxStore: hook principal pour React components
 * - getXxx: fonction pour accès hors React (autres stores, API calls)
 */

// Phase 2
export { useLanguageStore, getLocale } from "./useLanguageStore";
export type { Locale, LanguageStore } from "./useLanguageStore";

// Phase 1
export { useDatasetStore, datasetStoreActions } from "./useDatasetStore";
export type { DatasetStore } from "./useDatasetStore";

// Phase 3
export { useThemeStore, getThemeStyle, THEME_STYLES } from "./useThemeStore";
export type { ThemeStyle, ThemeStyleConfig, ThemeStore } from "./useThemeStore";

// Phase 4
export { useConversationStore, conversationStoreActions } from "./useConversationStore";
export type { ConversationStore, Filters } from "./useConversationStore";

// Phase 5
export { useLayoutStore, layoutStoreActions } from "./useLayoutStore";
export type { LayoutStore, ResizingZone } from "./useLayoutStore";

// Phase 6 - Datasources
export { useDatasourceStore, datasourceStoreActions } from "./useDatasourceStore";
export type { DatasourceStore } from "./useDatasourceStore";

// Phase 7 - Connectors
export { useConnectorStore, connectorStoreActions } from "./useConnectorStore";
export type { ConnectorStore } from "./useConnectorStore";

// Phase 8 - Runs (jobs history)
export { useRunStore, runStoreActions } from "./useRunStore";
export type { RunStore } from "./useRunStore";

// Phase 9 - Catalog
export { useCatalogStore, catalogStoreActions } from "./useCatalogStore";
export type { CatalogStore } from "./useCatalogStore";
