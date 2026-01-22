/**
 * Hook pour synchroniser une datasource avec SSE temps réel.
 *
 * Combine:
 * - useDatasourceStore pour les actions
 * - useTaskStream pour le suivi temps réel via Redis Pub/Sub
 *
 * Usage:
 * ```tsx
 * const { sync, progress, isStreaming, message } = useSyncDatasource(datasource.id);
 *
 * <Button onClick={sync} disabled={isStreaming}>
 *   {isStreaming ? `${progress}%` : "Sync"}
 * </Button>
 * ```
 */

import { useCallback } from "react";
import { toast } from "sonner";
import { useDatasourceStore } from "@/stores/useDatasourceStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useTaskStream, type TaskStatus } from "@/hooks/useTaskStream";
// Note: useDatasetStore used via .getState() for fresh state in callbacks
import { t } from "@/hooks/useTranslation";

export interface UseSyncDatasourceReturn {
  /** Trigger sync and start streaming */
  sync: () => Promise<void>;
  /** Whether SSE stream is active */
  isStreaming: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current step */
  step: string | null;
  /** Status message */
  message: string | null;
  /** Stop streaming (cancel watching, not the task itself) */
  stopWatching: () => void;
}

export function useSyncDatasource(datasourceId: number): UseSyncDatasourceReturn {
  const { triggerSync, updateDatasourceStatus } = useDatasourceStore();

  const handleSuccess = useCallback(
    (status: TaskStatus) => {
      // Update local state immediately
      updateDatasourceStatus(datasourceId, "success");

      const result = status.result as { records_synced?: number } | null;
      const recordsCount = result?.records_synced ?? 0;

      toast.success(t("datasource.sync_completed"), {
        description: t("datasource.sync_records_synced", { count: recordsCount }),
      });

      // Get fresh state from stores at execution time (not closure time)
      // This avoids stale closure issues when loadedDatasetId was null at render
      const { loadedDatasetId, loadDatasources } = useDatasourceStore.getState();
      const { refreshStats } = useDatasetStore.getState();

      if (loadedDatasetId) {
        void loadDatasources(loadedDatasetId, true);
        void refreshStats(loadedDatasetId);
      }
    },
    [datasourceId, updateDatasourceStatus]
  );

  const handleFailure = useCallback(
    (status: TaskStatus) => {
      updateDatasourceStatus(datasourceId, "error");
      toast.error(t("datasource.sync_failed"), {
        description: status.error ?? status.message ?? t("common.error"),
      });
    },
    [datasourceId, updateDatasourceStatus]
  );

  const handleRevoked = useCallback(
    (_status: TaskStatus) => {
      updateDatasourceStatus(datasourceId, "idle");
      toast.info(t("datasource.sync_cancelled"));
    },
    [datasourceId, updateDatasourceStatus]
  );

  const { status, isConnected, startStream, stopStream } = useTaskStream({
    onSuccess: handleSuccess,
    onFailure: handleFailure,
    onRevoked: handleRevoked,
  });

  const sync = useCallback(async () => {
    const response = await triggerSync(datasourceId);
    if (response) {
      startStream(response.task_id);
    }
  }, [datasourceId, triggerSync, startStream]);

  return {
    sync,
    isStreaming: isConnected,
    progress: status?.progress ?? 0,
    step: status?.step ?? null,
    message: status?.message ?? null,
    stopWatching: stopStream,
  };
}
