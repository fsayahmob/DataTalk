import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { Dataset } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

export interface DatasetStore {
  // State
  datasets: Dataset[];
  activeDataset: Dataset | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadDatasets: (includeStats?: boolean) => Promise<void>;
  loadDatasetById: (id: string) => Promise<Dataset | null>;
  activateDataset: (id: string) => Promise<boolean>;
  createDataset: (name: string, description?: string) => Promise<Dataset | null>;
  deleteDataset: (id: string) => Promise<boolean>;
  refreshStats: (id: string) => Promise<void>;
  setActiveDataset: (dataset: Dataset | null) => void;
  clearError: () => void;
  getDatasetById: (id: string) => Dataset | undefined;
}

export const useDatasetStore = create<DatasetStore>()(
  devtools(
    persist(
      (set, get) => ({
        datasets: [],
        activeDataset: null,
        loading: false,
        error: null,

        loadDatasets: async (includeStats = true) => {
          set({ loading: true, error: null });
          try {
            const response = await api.fetchDatasets(includeStats);
            const active = response.datasets.find((d) => d.is_active) || null;
            set({
              datasets: response.datasets,
              activeDataset: active,
              loading: false,
            });
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("common.error");
            set({ error: errorMsg, loading: false });
          }
        },

        loadDatasetById: async (id: string) => {
          // Check if already in store
          const existing = get().datasets.find((d) => d.id === id);
          if (existing) return existing;

          set({ loading: true, error: null });
          try {
            const dataset = await api.fetchDataset(id);
            // Add to datasets if not present, or update if present
            set((state) => {
              const exists = state.datasets.some((d) => d.id === id);
              return {
                datasets: exists
                  ? state.datasets.map((d) => (d.id === id ? dataset : d))
                  : [...state.datasets, dataset],
                loading: false,
              };
            });
            return dataset;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("common.error");
            set({ error: errorMsg, loading: false });
            return null;
          }
        },

        getDatasetById: (id: string) => {
          return get().datasets.find((d) => d.id === id);
        },

        activateDataset: async (id: string) => {
          try {
            await api.activateDataset(id);
            toast.success(t("datasets.activated"));

            // Update local state
            const { datasets } = get();
            const updatedDatasets = datasets.map((d) => ({
              ...d,
              is_active: d.id === id,
            }));
            const active = updatedDatasets.find((d) => d.id === id) || null;

            set({
              datasets: updatedDatasets,
              activeDataset: active,
            });
            return true;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("datasets.activation_error");
            toast.error(errorMsg);
            return false;
          }
        },

        createDataset: async (name: string, description?: string) => {
          try {
            const dataset = await api.createDataset({ name, description });
            toast.success(t("datasets.created"));

            // Add to local state
            set((state) => ({
              datasets: [dataset, ...state.datasets],
            }));

            return dataset;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("datasets.creation_error");
            toast.error(errorMsg);
            return null;
          }
        },

        deleteDataset: async (id: string) => {
          try {
            await api.deleteDataset(id);
            toast.success(t("datasets.deleted"));

            // Remove from local state
            set((state) => {
              const updatedDatasets = state.datasets.filter((d) => d.id !== id);
              const activeDataset =
                state.activeDataset?.id === id ? null : state.activeDataset;
              return { datasets: updatedDatasets, activeDataset };
            });

            return true;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("datasets.deletion_error");
            toast.error(errorMsg);
            return false;
          }
        },

        refreshStats: async (id: string) => {
          try {
            const updated = await api.refreshDatasetStats(id);

            // Update in local state
            set((state) => ({
              datasets: state.datasets.map((d) => (d.id === id ? updated : d)),
              activeDataset:
                state.activeDataset?.id === id ? updated : state.activeDataset,
            }));
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : t("datasets.refresh_error");
            toast.error(errorMsg);
          }
        },

        setActiveDataset: (dataset: Dataset | null) => {
          set({ activeDataset: dataset });
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: "dataset-storage",
        // Only persist activeDataset to avoid stale data
        partialize: (state) => ({ activeDataset: state.activeDataset }),
      }
    ),
    { name: "DatasetStore" }
  )
);

// For usage outside React (other stores, utilities)
export const datasetStoreActions = {
  getActiveDataset: () => useDatasetStore.getState().activeDataset,
  getDatasets: () => useDatasetStore.getState().datasets,
};
