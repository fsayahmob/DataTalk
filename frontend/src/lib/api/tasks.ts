// API functions for Celery task status polling
// Uses native Celery AsyncResult via backend endpoint

import { API_BASE, apiFetch } from "./types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Celery task states
 */
export type TaskState =
  | "PENDING"   // Task waiting to be picked up
  | "STARTED"   // Task started by worker
  | "PROGRESS"  // Task in progress (custom state via update_state)
  | "SUCCESS"   // Task completed successfully
  | "FAILURE"   // Task failed
  | "REVOKED";  // Task was cancelled

/**
 * Response from GET /tasks/{task_id}/status or SSE stream
 */
export interface TaskStatusResponse {
  task_id: string;
  state: TaskState;
  progress: number | null;
  step: string | null;
  message: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  job_id: number | null;
  datasource_id: number | null;
  done?: boolean; // Present in SSE stream events
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch the status of a Celery task.
 *
 * Uses Celery's native AsyncResult.state and AsyncResult.info.
 * The backend exposes this via GET /api/v1/tasks/{task_id}/status.
 *
 * @param taskId - The Celery task ID returned by trigger_sync
 * @returns Task status including state, progress, message, and result
 */
export async function fetchTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const res = await apiFetch(`${API_BASE}/api/v1/tasks/${taskId}/status`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch task status");
  }

  return data;
}

/**
 * Cancel a running Celery task.
 *
 * @param taskId - The Celery task ID to cancel
 * @param terminate - If true, send SIGTERM to the worker (for running tasks)
 */
export async function revokeTask(
  taskId: string,
  terminate: boolean = false
): Promise<{ message: string; task_id: string }> {
  const res = await apiFetch(
    `${API_BASE}/api/v1/tasks/${taskId}/revoke?terminate=${terminate}`,
    { method: "POST" }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to revoke task");
  }

  return data;
}

/**
 * Check if a task is still running (not in a terminal state).
 */
export function isTaskRunning(state: TaskState): boolean {
  return state === "PENDING" || state === "STARTED" || state === "PROGRESS";
}

/**
 * Check if a task has completed (successfully or with failure).
 */
export function isTaskComplete(state: TaskState): boolean {
  return state === "SUCCESS" || state === "FAILURE" || state === "REVOKED";
}
