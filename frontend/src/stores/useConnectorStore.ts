import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type {
  Connector,
  ConnectorCategory,
  ConnectorSpec,
  DiscoveredStream,
} from "@/lib/api";
import { t } from "@/hooks/useTranslation";

export interface ConnectorStore {
  // State - Connectors list
  connectors: Connector[];
  categories: ConnectorCategory[];
  loading: boolean;
  error: string | null;
  airbyteAvailable: boolean;

  // State - Selected connector for wizard
  selectedConnector: Connector | null;
  connectorSpec: ConnectorSpec | null;
  loadingSpec: boolean;

  // State - Connection test
  testResult: { success: boolean; message: string } | null;
  testing: boolean;

  // State - Catalog discovery
  discoveredStreams: DiscoveredStream[];
  discovering: boolean;

  // Actions - Load connectors
  loadConnectors: (category?: string) => Promise<void>;
  loadCategories: () => Promise<void>;

  // Actions - Wizard flow
  selectConnector: (connector: Connector) => Promise<void>;
  testConnection: (config: Record<string, unknown>) => Promise<boolean>;
  discoverCatalog: (config: Record<string, unknown>) => Promise<boolean>;

  // Actions - Reset
  resetWizard: () => void;
  clearError: () => void;
}

export const useConnectorStore = create<ConnectorStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      connectors: [],
      categories: [],
      loading: false,
      error: null,
      airbyteAvailable: false,

      selectedConnector: null,
      connectorSpec: null,
      loadingSpec: false,

      testResult: null,
      testing: false,

      discoveredStreams: [],
      discovering: false,

      // Load all connectors
      loadConnectors: async (category?: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.fetchConnectors(category);
          set({
            connectors: response.connectors,
            loading: false,
            airbyteAvailable: response.airbyte_available,
          });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("common.error");
          set({ error: errorMsg, loading: false });
        }
      },

      // Load categories
      loadCategories: async () => {
        try {
          const response = await api.fetchConnectorCategories();
          set({ categories: response.categories });
        } catch (e) {
          // Silent fail for categories, not critical
          console.error("Failed to load categories:", e);
        }
      },

      // Select a connector and load its spec
      selectConnector: async (connector: Connector) => {
        set({
          selectedConnector: connector,
          connectorSpec: null,
          loadingSpec: true,
          testResult: null,
          discoveredStreams: [],
        });

        try {
          const spec = await api.fetchConnectorSpec(connector.id);
          set({ connectorSpec: spec, loadingSpec: false });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("connector.spec_error");
          toast.error(errorMsg);
          set({ loadingSpec: false, error: errorMsg });
        }
      },

      // Test connection with config
      testConnection: async (config: Record<string, unknown>) => {
        const { selectedConnector } = get();
        if (!selectedConnector) return false;

        set({ testing: true, testResult: null });

        try {
          const result = await api.testConnection(selectedConnector.id, config);
          set({ testResult: result, testing: false });

          if (result.success) {
            toast.success(t("connector.test_success"));
          } else {
            toast.error(result.message || t("connector.test_failed"));
          }

          return result.success;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("connector.test_error");
          set({
            testResult: { success: false, message: errorMsg },
            testing: false,
          });
          toast.error(errorMsg);
          return false;
        }
      },

      // Discover catalog
      discoverCatalog: async (config: Record<string, unknown>) => {
        const { selectedConnector } = get();
        if (!selectedConnector) return false;

        set({ discovering: true, discoveredStreams: [] });

        try {
          const result = await api.discoverCatalog(selectedConnector.id, config);
          set({ discoveredStreams: result.tables, discovering: false });

          if (result.tables.length > 0) {
            toast.success(
              t("connector.discover_success", { count: result.stream_count })
            );
            return true;
          } else {
            toast.error(t("connector.discover_failed"));
            return false;
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("connector.discover_error");
          set({ discovering: false });
          toast.error(errorMsg);
          return false;
        }
      },

      // Reset wizard state
      resetWizard: () => {
        set({
          selectedConnector: null,
          connectorSpec: null,
          loadingSpec: false,
          testResult: null,
          testing: false,
          discoveredStreams: [],
          discovering: false,
        });
      },

      clearError: () => set({ error: null }),
    }),
    { name: "ConnectorStore" }
  )
);

// For usage outside React
export const connectorStoreActions = {
  getConnectors: () => useConnectorStore.getState().connectors,
  getSelectedConnector: () => useConnectorStore.getState().selectedConnector,
  isAirbyteAvailable: () => useConnectorStore.getState().airbyteAvailable,
};
