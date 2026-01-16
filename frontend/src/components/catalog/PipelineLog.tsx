"use client";

import { useEffect, useState, startTransition } from "react";
import type { CatalogJob } from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

interface PipelineLogProps {
  runId?: string | null;
}

export function PipelineLog({ runId }: PipelineLogProps) {
  const [runJobs, setPipeline] = useState<CatalogJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      startTransition(() => setLoading(false));
      return;
    }

    // SSE connection pour le run
    const eventSource = new EventSource(`${API_BASE}/catalog/job-stream/${runId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.done) {
        eventSource.close();
        startTransition(() => setLoading(false));
        return;
      }

      if (data.error) {
        console.error("SSE error:", data.error);
        eventSource.close();
        startTransition(() => setLoading(false));
        return;
      }

      // Update jobs
      startTransition(() => {
        setPipeline(data);
        setLoading(false);
      });
    };

    eventSource.onerror = () => {
      console.log("SSE disconnected");
      eventSource.close();
      startTransition(() => setLoading(false));
    };

    return () => eventSource.close();
  }, [runId]);

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground animate-pulse">
        {t("catalog.loading_run")}
      </div>
    );
  }

  if (runJobs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {t("catalog.no_run_executed")}
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      case "running":
        return "⟳";
      case "pending":
        return "○";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "failed":
        return "text-red-400";
      case "running":
        return "text-blue-400 animate-spin";
      case "pending":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  const formatDuration = (started: string, completed: string | null) => {
    const start = new Date(started);
    const end = completed ? new Date(completed) : new Date();
    const durationMs = end.getTime() - start.getTime();

    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
    return `${(durationMs / 60000).toFixed(1)}m`;
  };

  const getStepLabel = (step: string | null): string => {
    if (!step) return "";

    const stepLabels: Record<string, string> = {
      extract_metadata: "Extraction des métadonnées",
      save_to_catalog: "Sauvegarde du catalogue",
      update_enabled: "Activation des tables",
      fetch_tables: "Récupération des tables",
      save_descriptions: "Sauvegarde des descriptions",
      generate_kpis: "Génération des KPIs",
      generate_questions: "Génération des questions",
    };

    // Handle llm_batch_N
    if (step.startsWith("llm_batch_")) {
      const batchNum = step.split("_")[2];
      return `Enrichissement LLM batch ${batchNum}`;
    }

    return stepLabels[step] || step;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Pipeline Actif
      </h3>

      {runJobs.map((job, idx) => (
        <div key={job.id} className="space-y-2">
          {/* Job Header */}
          <div className="flex items-center gap-2">
            <span className={`text-sm ${getStatusColor(job.status)}`}>
              {getStatusIcon(job.status)}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {job.job_type === "extraction" ? "Extraction" : "Enrichissement"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  #{job.id}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatDuration(job.started_at, job.completed_at)}
              </div>
            </div>

            {/* Progress Bar */}
            {job.status === "running" && job.progress > 0 && (
              <div className="w-32">
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="text-[9px] text-muted-foreground text-right mt-0.5">
                  {job.progress}%
                </div>
              </div>
            )}
          </div>

          {/* Current Step */}
          {job.current_step && job.status === "running" && (
            <div className="ml-6 text-xs text-muted-foreground">
              → {getStepLabel(job.current_step)}{" "}
              {job.step_index !== null && job.total_steps && (
                <span className="text-[10px]">
                  ({job.step_index + 1}/{job.total_steps})
                </span>
              )}
            </div>
          )}

          {/* Error Message */}
          {job.status === "failed" && job.error_message && (
            <div className="ml-6 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
              {job.error_message}
            </div>
          )}

          {/* Result Summary */}
          {job.status === "completed" && job.result && (
            <div className="ml-6 flex flex-wrap gap-2 text-[10px]">
              {job.result.tables !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {String(job.result.tables)} tables
                </span>
              )}
              {job.result.columns !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {String(job.result.columns)} colonnes
                </span>
              )}
              {job.result.synonyms !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                  {String(job.result.synonyms)} synonymes
                </span>
              )}
              {job.result.kpis !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  {String(job.result.kpis)} KPIs
                </span>
              )}
              {job.result.questions !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  {String(job.result.questions)} questions
                </span>
              )}
            </div>
          )}

          {/* Separator between jobs */}
          {idx < runJobs.length - 1 && (
            <div className="ml-2 h-4 w-0.5 bg-border/30" />
          )}
        </div>
      ))}
    </div>
  );
}
