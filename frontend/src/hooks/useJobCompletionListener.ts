/**
 * Hook global pour écouter la fin des jobs Celery.
 *
 * Ce hook doit être monté UNE SEULE FOIS dans le layout principal.
 * Il écoute le SSE /catalog/status-stream et rafraîchit tous les stores
 * quand un job termine, peu importe la page où se trouve l'utilisateur.
 */

import { useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { useCatalogStore } from "@/stores/useCatalogStore";
import { useRunStore } from "@/stores/useRunStore";

export function useJobCompletionListener() {
  const wasRunningRef = useRef(false);

  // Actions des stores
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const onJobCompleted = useCatalogStore((s) => s.onJobCompleted);
  const isExtracting = useCatalogStore((s) => s.isExtracting);
  const isEnriching = useCatalogStore((s) => s.isEnriching);
  const loadRuns = useRunStore((s) => s.loadRuns);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/catalog/status-stream`);

    eventSource.onmessage = (event) => {
      try {
        const status = JSON.parse(event.data);
        const isCurrentlyRunning = status.is_running;
        const wasRunning = wasRunningRef.current;

        // Détecter la transition running → stopped
        // OU si on attendait un job (isExtracting/isEnriching true) et qu'il n'y en a plus
        const jobJustFinished = wasRunning && !isCurrentlyRunning;
        const wasWaitingForJob = (isExtracting || isEnriching) && !isCurrentlyRunning;

        if (jobJustFinished || wasWaitingForJob) {
          // Job terminé - rafraîchir tous les stores
          void loadCatalog();
          void loadRuns();
          onJobCompleted();
        }

        wasRunningRef.current = isCurrentlyRunning;
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    eventSource.onerror = () => {
      // Reconnexion automatique gérée par le navigateur
      console.warn("SSE connection lost, reconnecting...");
    };

    return () => {
      eventSource.close();
    };
  }, [loadCatalog, loadRuns, onJobCompleted, isExtracting, isEnriching]);
}
