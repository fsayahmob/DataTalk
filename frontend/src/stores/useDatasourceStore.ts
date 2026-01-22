/**
 * Store Zustand pour les datasources.
 *
 * Gère uniquement l'état des datasources.
 * Le polling Celery est délégué au hook useTaskPolling dans les composants.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { Datasource } from "@/lib/api";
import { t } from "@/hooks/useTranslation";
import { useRunStore } from "./useRunStore";

export interface DatasourceStore {
  // State
  datasources: Datasource[];
  loading: boolean;
  error: string | null;
  loadedDatasetId: string | null;

  // Actions
  loadDatasources: (datasetId: string, force?: boolean) => Promise<void>;
  deleteDatasource: (id: number) => Promise<boolean>;
  triggerSync: (id: number) => Promise<api.TriggerSyncResponse | null>;
  updateDatasourceStatus: (id: number, status: Datasource["sync_status"]) => void;
  clearDatasources: () => void;
  clearError: () => void;
}

export const useDatasourceStore = create<DatasourceStore>()(
  devtools(
    (set, get) => ({
      datasources: [],
      loading: false,
      error: null,
      loadedDatasetId: null,

      loadDatasources: async (datasetId: string, force = false) => {
        // Skip si déjà chargé pour ce dataset (sauf si force)
        if (
          !force &&
          get().loadedDatasetId === datasetId &&
          get().datasources.length > 0
        ) {
          return;
        }

        set({ loading: true, error: null });
        try {
          const response = await api.fetchDatasources(datasetId);
          set({
            datasources: response.datasources,
            loading: false,
            loadedDatasetId: datasetId,
          });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : t("common.error");
          set({ error: errorMsg, loading: false });
        }
      },

      deleteDatasource: async (id: number) => {
        try {
          await api.deleteDatasource(id);
          toast.success(t("datasource.deleted"));

          set((state) => ({
            datasources: state.datasources.filter((d) => d.id !== id),
          }));

          return true;
        } catch (e) {
          const errorMsg =
            e instanceof Error ? e.message : t("datasource.delete_error");
          toast.error(errorMsg);
          return false;
        }
      },

      triggerSync: async (id: number) => {
        try {
          // Optimistic update
          set((state) => ({
            datasources: state.datasources.map((d) =>
              d.id === id ? { ...d, sync_status: "running" as const } : d
            ),
          }));

          const response = await api.triggerDatasourceSync(id);

          // Refresh RunStore so /runs page shows the new job immediately
          void useRunStore.getState().loadRuns();

          // Toast avec lien vers Runs
          toast.success(
            t("datasource.sync_started_with_run", {
              runId: response.run_id.slice(0, 8),
            }),
            {
              description: t("datasource.sync_track_in_runs"),
              action: {
                label: t("common.view"),
                onClick: () => {
                  window.location.href = "/runs";
                },
              },
              duration: 5000,
            }
          );

          // Return response so caller can use task_id for polling
          return response;
        } catch (e) {
          // Revert optimistic update
          set((state) => ({
            datasources: state.datasources.map((d) =>
              d.id === id ? { ...d, sync_status: "error" as const } : d
            ),
          }));

          const errorMsg =
            e instanceof Error ? e.message : t("datasource.sync_error");
          toast.error(errorMsg);
          return null;
        }
      },

      updateDatasourceStatus: (id: number, status: Datasource["sync_status"]) => {
        set((state) => ({
          datasources: state.datasources.map((d) =>
            d.id === id ? { ...d, sync_status: status } : d
          ),
        }));
      },

      clearDatasources: () => {
        set({ datasources: [], loadedDatasetId: null });
      },

      clearError: () => set({ error: null }),
    }),
    { name: "DatasourceStore" }
  )
);

// For usage outside React
export const datasourceStoreActions = {
  getDatasources: () => useDatasourceStore.getState().datasources,
  getDatasourceById: (id: number) =>
    useDatasourceStore.getState().datasources.find((d) => d.id === id),
};
