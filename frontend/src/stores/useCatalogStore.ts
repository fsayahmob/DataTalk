import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { CatalogDatasource, CatalogTable } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

export interface CatalogStore {
  // State
  catalog: CatalogDatasource[];
  selectedTable: CatalogTable | null;
  loading: boolean;
  isExtracting: boolean;
  isEnriching: boolean;
  isDeleting: boolean;
  isRunning: boolean;
  error: string | null;

  // Computed (via getters)
  allTables: () => CatalogTable[];
  enabledTablesCount: () => number;

  // Actions
  loadCatalog: () => Promise<void>;
  extractCatalog: () => Promise<boolean>;
  enrichCatalog: (tableIds: number[]) => Promise<boolean>;
  deleteCatalog: () => Promise<boolean>;
  selectTable: (table: CatalogTable | null) => void;
  toggleTable: (tableId: number, enabled: boolean) => void;
  setIsRunning: (running: boolean) => void;
  onJobCompleted: () => void;
  clearError: () => void;
}

export const useCatalogStore = create<CatalogStore>()(
  devtools(
    (set, get) => ({
      catalog: [],
      selectedTable: null,
      loading: false,
      isExtracting: false,
      isEnriching: false,
      isDeleting: false,
      isRunning: false,
      error: null,

      allTables: () => get().catalog.flatMap((ds) => ds.tables),

      enabledTablesCount: () => get().allTables().filter((t) => t.is_enabled).length,

      loadCatalog: async () => {
        set({ loading: true, error: null });
        try {
          const result = await api.fetchCatalog();
          if (result) {
            set({ catalog: result.catalog, loading: false });
          } else {
            set({ loading: false });
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("common.error");
          set({ error: errorMsg, loading: false });
        }
      },

      extractCatalog: async () => {
        set({ isExtracting: true, selectedTable: null });

        try {
          const result = await api.extractCatalog();

          // Toast info seulement après succès de l'appel API
          toast.info(t("catalog.extracting"), {
            description: t("catalog.extraction_no_llm"),
          });

          if (result) {
            // Mode async (Celery): job lancé en background
            // Le catalogue sera rechargé par le SSE quand le job termine
            if (result.status === "pending") {
              // Ne pas afficher de succès ici, attendre la fin du job
              // isExtracting reste true, sera mis à false par le SSE
              return true;
            }

            // Mode sync (fallback): résultat immédiat
            toast.success(t("catalog.schema_extracted"), {
              description: t("catalog.extraction_result", {
                tables: result.tables_count,
                columns: result.columns_count,
              }),
            });
            await get().loadCatalog();
            set({ isExtracting: false });
            return true;
          } else {
            toast.error(t("catalog.extraction_error"));
            set({ isExtracting: false });
            return false;
          }
        } catch (e) {
          // Afficher le message d'erreur métier du backend
          const errorMsg = e instanceof Error ? e.message : t("catalog.extraction_error");
          toast.error(errorMsg);
          set({ isExtracting: false });
          return false;
        }
      },

      enrichCatalog: async (tableIds: number[]) => {
        if (tableIds.length === 0) {
          toast.error(t("catalog.no_tables_selected"), {
            description: t("catalog.select_tables_hint"),
          });
          return false;
        }

        // Check LLM status
        const llmStatus = await api.fetchLLMStatus();
        if (llmStatus.status === "error") {
          toast.error(t("catalog.llm_not_configured"), {
            description: t("catalog.llm_configure_hint"),
            action: {
              label: t("catalog.configure"),
              onClick: () => (window.location.href = "/settings"),
            },
          });
          return false;
        }

        set({ isEnriching: true, selectedTable: null });
        toast.info(t("catalog.enriching"), {
          description: t("catalog.tables_selected", { count: tableIds.length }),
        });

        // Polling for real-time updates
        const pollInterval = setInterval(() => {
          void api.fetchCatalog().then((catalogResult) => {
            if (catalogResult) {
              set({ catalog: catalogResult.catalog });
            }
          });
        }, 3000);

        try {
          const result = await api.enrichCatalog(tableIds);

          if (result && result.status === "pending") {
            // Mode async (Celery): job lancé en background
            // Le catalogue sera rechargé par le SSE quand le job termine
            // isEnriching reste true, sera mis à false par onJobCompleted()
            // Le polling continue pour les mises à jour en temps réel
            return true;
          }

          // Mode sync ou résultat immédiat - arrêter le polling
          clearInterval(pollInterval);

          if (result && result.status === "ok") {
            toast.success(t("catalog.enrichment_success"), {
              description: t("catalog.enrichment_result", {
                tables: result.tables_count || 0,
                columns: result.columns_count || 0,
                kpis: result.kpis_count || 0,
              }),
            });
            await get().loadCatalog();
            localStorage.setItem("catalog-updated", Date.now().toString());
            set({ isEnriching: false });
            return true;
          } else if (result && result.status === "error") {
            if (result.error_type === "vertex_ai_schema_too_complex") {
              toast.error(t("catalog.vertex_ai_schema_complex"), {
                description: result.suggestion || t("catalog.reduce_batch_size"),
                duration: 10000,
                action: {
                  label: t("settings.title"),
                  onClick: () => (window.location.href = "/settings"),
                },
              });
            } else {
              toast.error(t("catalog.llm_error"), {
                description: result.message,
                duration: 8000,
              });
            }
            set({ isEnriching: false });
            return false;
          } else {
            toast.error(t("catalog.enrichment_error"));
            set({ isEnriching: false });
            return false;
          }
        } catch {
          clearInterval(pollInterval);
          toast.error(t("catalog.enrichment_error"));
          set({ isEnriching: false });
          return false;
        }
      },

      deleteCatalog: async () => {
        set({ isDeleting: true, selectedTable: null });

        try {
          const success = await api.deleteCatalog();

          if (success) {
            toast.success(t("catalog.deleted"));
            set({ catalog: [], isDeleting: false });
            localStorage.setItem("catalog-updated", Date.now().toString());
            return true;
          } else {
            toast.error(t("catalog.delete_error"));
            set({ isDeleting: false });
            return false;
          }
        } catch {
          toast.error(t("catalog.delete_error"));
          set({ isDeleting: false });
          return false;
        }
      },

      selectTable: (table) => {
        set({ selectedTable: table });
      },

      toggleTable: (tableId, enabled) => {
        set((state) => ({
          catalog: state.catalog.map((ds) => ({
            ...ds,
            tables: ds.tables.map((t) =>
              t.id === tableId ? { ...t, is_enabled: enabled } : t
            ),
          })),
          selectedTable:
            state.selectedTable?.id === tableId
              ? { ...state.selectedTable, is_enabled: enabled }
              : state.selectedTable,
        }));
      },

      setIsRunning: (running) => {
        set({ isRunning: running });
      },

      // Called by SSE when a job completes - reset all loading states
      onJobCompleted: () => {
        const { isExtracting, isEnriching } = get();
        // Only show toast if we were actually extracting
        if (isExtracting) {
          toast.success(t("catalog.extraction_completed"));
        }
        set({ isExtracting: false, isEnriching: false });
      },

      clearError: () => set({ error: null }),
    }),
    { name: "CatalogStore" }
  )
);

// For usage outside React
export const catalogStoreActions = {
  getCatalog: () => useCatalogStore.getState().catalog,
  getAllTables: () => useCatalogStore.getState().allTables(),
};
