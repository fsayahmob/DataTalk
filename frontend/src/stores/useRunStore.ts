import { create } from "zustand";
import { devtools } from "zustand/middleware";
import * as api from "@/lib/api";
import type { Run } from "@/lib/api";

export interface RunStore {
  // State
  runs: Run[];
  selectedJobId: number | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadRuns: () => Promise<void>;
  selectJob: (jobId: number | null) => void;
  clearError: () => void;
  getRunById: (id: number) => Run | undefined;
}

export const useRunStore = create<RunStore>()(
  devtools(
    (set, get) => ({
      runs: [],
      selectedJobId: null,
      loading: false,
      error: null,

      loadRuns: async () => {
        set({ loading: true, error: null });
        try {
          const runs = await api.fetchRuns();
          set((state) => ({
            runs,
            loading: false,
            // Auto-select first job if none selected
            selectedJobId: state.selectedJobId ?? (runs.length > 0 ? runs[0].id : null),
          }));
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Error loading runs";
          set({ error: errorMsg, loading: false });
        }
      },

      selectJob: (jobId: number | null) => {
        set({ selectedJobId: jobId });
      },

      clearError: () => set({ error: null }),

      getRunById: (id: number) => {
        return get().runs.find((r) => r.id === id);
      },
    }),
    { name: "RunStore" }
  )
);

// For usage outside React
export const runStoreActions = {
  getRuns: () => useRunStore.getState().runs,
  getSelectedJob: () => {
    const state = useRunStore.getState();
    return state.runs.find((r) => r.id === state.selectedJobId) ?? null;
  },
};
