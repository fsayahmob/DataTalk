/**
 * Hook pour écouter les updates de tasks Celery via SSE (Server-Sent Events).
 *
 * Architecture push temps réel:
 *   Task Celery → Redis PUBLISH → SSE endpoint → EventSource → ce hook
 *
 * Pas de polling - les updates sont pushées par le serveur.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { API_BASE, type TaskStatusResponse } from "@/lib/api";

// Re-export pour compatibilité avec les hooks existants
export type TaskStatus = TaskStatusResponse;

export interface UseTaskStreamOptions {
  /** Callback when task completes successfully */
  onSuccess?: (status: TaskStatus) => void;
  /** Callback when task fails */
  onFailure?: (status: TaskStatus) => void;
  /** Callback when task is revoked/cancelled */
  onRevoked?: (status: TaskStatus) => void;
  /** Callback on each progress update */
  onProgress?: (status: TaskStatus) => void;
  /** Callback on connection error */
  onError?: (error: Event) => void;
}

export interface UseTaskStreamReturn {
  /** Current task status */
  status: TaskStatus | null;
  /** Whether stream is connected */
  isConnected: boolean;
  /** Start streaming a task */
  startStream: (taskId: string) => void;
  /** Stop streaming */
  stopStream: () => void;
}

export function useTaskStream(
  options: UseTaskStreamOptions = {}
): UseTaskStreamReturn {
  const { onSuccess, onFailure, onRevoked, onProgress, onError } = options;

  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const taskIdRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    taskIdRef.current = null;
    setIsConnected(false);
  }, []);

  const startStream = useCallback(
    (taskId: string) => {
      // Stop any existing stream
      stopStream();

      taskIdRef.current = taskId;
      setStatus(null);

      // Create EventSource for SSE
      const url = `${API_BASE}/api/v1/tasks/${taskId}/stream`;
      const es = new EventSource(url);

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TaskStatus;
          setStatus(data);

          // Call progress callback
          onProgress?.(data);

          // Handle terminal states
          if (data.done) {
            if (data.state === "SUCCESS") {
              onSuccess?.(data);
            } else if (data.state === "FAILURE") {
              onFailure?.(data);
            } else if (data.state === "REVOKED") {
              onRevoked?.(data);
            }
            // Close the stream
            stopStream();
          }
        } catch (e) {
          console.error("Failed to parse SSE message:", e);
        }
      };

      es.onerror = (event) => {
        console.error("SSE error:", event);
        onError?.(event);
        // EventSource will auto-reconnect, but we can stop if needed
        if (es.readyState === EventSource.CLOSED) {
          setIsConnected(false);
        }
      };

      eventSourceRef.current = es;
    },
    [stopStream, onSuccess, onFailure, onRevoked, onProgress, onError]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    status,
    isConnected,
    startStream,
    stopStream,
  };
}
