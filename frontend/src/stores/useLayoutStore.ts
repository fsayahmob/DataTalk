import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ResizingZone = "zone1" | "zone3" | null;

export interface LayoutStore {
  // State
  zone1Collapsed: boolean;
  zone3Collapsed: boolean;
  zone1Width: number;
  zone3Width: number;
  isResizing: ResizingZone;

  // Actions
  setZone1Collapsed: (collapsed: boolean) => void;
  setZone3Collapsed: (collapsed: boolean) => void;
  setZone1Width: (width: number) => void;
  setZone3Width: (width: number) => void;
  setIsResizing: (resizing: ResizingZone) => void;
  toggleZone1: () => void;
  toggleZone3: () => void;
}

export const useLayoutStore = create<LayoutStore>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        zone1Collapsed: false,
        zone3Collapsed: false,
        zone1Width: 25,
        zone3Width: 20,
        isResizing: null,

        // Actions
        setZone1Collapsed: (collapsed) => set({ zone1Collapsed: collapsed }),
        setZone3Collapsed: (collapsed) => set({ zone3Collapsed: collapsed }),
        setZone1Width: (width) => set({ zone1Width: Math.min(50, Math.max(15, width)) }),
        setZone3Width: (width) => set({ zone3Width: Math.min(35, Math.max(10, width)) }),
        setIsResizing: (resizing) => set({ isResizing: resizing }),
        toggleZone1: () => set((state) => ({ zone1Collapsed: !state.zone1Collapsed })),
        toggleZone3: () => set((state) => ({ zone3Collapsed: !state.zone3Collapsed })),
      }),
      {
        name: "layout-storage",
        // Persist collapsed states and widths
        partialize: (state) => ({
          zone1Collapsed: state.zone1Collapsed,
          zone3Collapsed: state.zone3Collapsed,
          zone1Width: state.zone1Width,
          zone3Width: state.zone3Width,
        }),
      }
    ),
    { name: "LayoutStore" }
  )
);

/**
 * For usage outside React (utilities, other stores)
 */
export const layoutStoreActions = {
  getZone1Width: () => useLayoutStore.getState().zone1Width,
  getZone3Width: () => useLayoutStore.getState().zone3Width,
  isZone1Collapsed: () => useLayoutStore.getState().zone1Collapsed,
  isZone3Collapsed: () => useLayoutStore.getState().zone3Collapsed,
};
