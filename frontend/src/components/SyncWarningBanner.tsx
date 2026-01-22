"use client";

import { useSyncExternalStore, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import * as api from "@/lib/api";

interface SyncWarningBannerProps {
  datasetId: string | null;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
}

// Simple external store for sync status
let syncStatus = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return syncStatus;
}

/**
 * Displays a warning banner when a dataset sync is in progress.
 * Polls the backend to check sync status.
 */
export function SyncWarningBanner({
  datasetId,
  pollInterval = 5000,
}: SyncWarningBannerProps) {
  const { t } = useTranslation();

  const checkAndUpdateStatus = useCallback(async () => {
    if (!datasetId) {
      if (syncStatus !== false) {
        syncStatus = false;
        notifyListeners();
      }
      return;
    }

    try {
      const status = await api.checkDatasetSyncStatus(datasetId);
      if (syncStatus !== status.is_syncing) {
        syncStatus = status.is_syncing;
        notifyListeners();
      }
    } catch {
      if (syncStatus !== false) {
        syncStatus = false;
        notifyListeners();
      }
    }
  }, [datasetId]);

  // Use useSyncExternalStore for proper React 18+ integration
  const isSyncing = useSyncExternalStore(
    useCallback((onStoreChange) => {
      // Initial check
      void checkAndUpdateStatus();

      // Poll for updates
      const interval = setInterval(() => void checkAndUpdateStatus(), pollInterval);

      // Subscribe to store changes
      const unsubscribe = subscribe(onStoreChange);

      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    }, [checkAndUpdateStatus, pollInterval]),
    getSnapshot,
    getSnapshot // Server snapshot
  );

  if (!isSyncing) {
    return null;
  }

  return (
    <div className="px-4 py-2.5 bg-status-warning/20 border-b border-status-warning/30 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-status-warning flex-shrink-0" />
      <div className="flex-1">
        <span className="text-sm font-medium text-status-warning">
          {t("datasource.sync_in_progress_warning")}
        </span>
        <span className="text-sm text-status-warning/80 ml-2">
          {t("datasource.sync_in_progress_desc")}
        </span>
      </div>
    </div>
  );
}
