/**
 * Hook pour retry un job failed avec SSE temps réel.
 *
 * Combine:
 * - retryJob API pour reset + relancer la task Celery
 * - useTaskStream pour le suivi temps réel via Redis Pub/Sub
 * - Sonner toast pour le feedback utilisateur
 *
 * Usage:
 * ```tsx
 * const { retry, isRetrying, progress, step } = useRetryJob({
 *   onSuccess: () => loadRuns(),
 * });
 *
 * <Button onClick={() => retry(job.id)} disabled={isRetrying}>
 *   {isRetrying ? `${progress}%` : "Retry"}
 * </Button>
 * ```
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { retryJob } from "@/lib/api";
import { useTaskStream, type TaskStatus } from "@/hooks/useTaskStream";
import { t } from "@/hooks/useTranslation";

export interface UseRetryJobOptions {
  /** Callback when retry completes successfully */
  onSuccess?: (jobId: number, status: TaskStatus) => void;
  /** Callback when retry fails */
  onFailure?: (jobId: number, status: TaskStatus) => void;
}

export interface UseRetryJobReturn {
  /** Trigger retry for a job */
  retry: (jobId: number) => Promise<boolean>;
  /** Job ID currently being retried (null if none) */
  retryingJobId: number | null;
  /** Whether a retry is in progress */
  isRetrying: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current step */
  step: string | null;
  /** Status message */
  message: string | null;
}

export function useRetryJob(options: UseRetryJobOptions = {}): UseRetryJobReturn {
  const { onSuccess, onFailure } = options;

  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);

  const handleSuccess = useCallback(
    (status: TaskStatus) => {
      const jobId = retryingJobId;
      setRetryingJobId(null);

      toast.success(t("runs.retry_success"), {
        description: status.message ?? t("common.success"),
      });

      if (jobId !== null) {
        onSuccess?.(jobId, status);
      }
    },
    [retryingJobId, onSuccess]
  );

  const handleFailure = useCallback(
    (status: TaskStatus) => {
      const jobId = retryingJobId;
      setRetryingJobId(null);

      toast.error(t("runs.retry_failed"), {
        description: status.error ?? status.message ?? t("common.error"),
      });

      if (jobId !== null) {
        onFailure?.(jobId, status);
      }
    },
    [retryingJobId, onFailure]
  );

  const { status, startStream } = useTaskStream({
    onSuccess: handleSuccess,
    onFailure: handleFailure,
  });

  const retry = useCallback(
    async (jobId: number): Promise<boolean> => {
      // Prevent double retry
      if (retryingJobId !== null) {
        return false;
      }

      setRetryingJobId(jobId);

      try {
        const response = await retryJob(jobId);

        if (!response) {
          // API returned null (error logged in retryJob)
          toast.error(t("runs.retry_failed"), {
            description: t("job.not_retriable"),
          });
          setRetryingJobId(null);
          return false;
        }

        // Start SSE stream to follow task progress
        if (response.task_id) {
          startStream(response.task_id);
        }

        return true;
      } catch (error) {
        console.error("Retry error:", error);
        toast.error(t("runs.retry_failed"), {
          description: error instanceof Error ? error.message : t("common.error"),
        });
        setRetryingJobId(null);
        return false;
      }
    },
    [retryingJobId, startStream]
  );

  return {
    retry,
    retryingJobId,
    isRetrying: retryingJobId !== null,
    progress: status?.progress ?? 0,
    step: status?.step ?? null,
    message: status?.message ?? null,
  };
}
