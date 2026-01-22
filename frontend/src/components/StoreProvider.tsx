"use client";

/**
 * StoreProvider - Initializes global Zustand stores on app mount
 *
 * This provider loads shared data once at the app level:
 * - Datasets (active dataset used by analytics, catalog, etc.)
 * - Catalog (schema metadata)
 * - Runs (job history)
 *
 * This avoids duplicate API calls in each page component.
 */

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { useDatasetStore, useCatalogStore, useRunStore } from "@/stores";

interface StoreProviderProps {
  children: ReactNode;
}

// Hydration-safe pattern
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function StoreProvider({ children }: StoreProviderProps) {
  const { loadDatasets } = useDatasetStore();
  const { loadCatalog } = useCatalogStore();
  const { loadRuns } = useRunStore();

  // Load all global data once on app mount
  useEffect(() => {
    void loadDatasets();
    void loadCatalog();
    void loadRuns();
  }, [loadDatasets, loadCatalog, loadRuns]);

  return <>{children}</>;
}

/**
 * Hook to check if we're on the client side (hydrated)
 * Uses useSyncExternalStore to avoid SSR issues
 */
export function useStoreHydration() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}
