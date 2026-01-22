"use client";

import { useEffect, useCallback } from "react";
import {
  ReactFlow,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { API_BASE, type CatalogJob, type JobType } from "@/lib/api";
import TurboNode, { type TurboNodeData } from "@/components/runs/TurboNode";
import TurboEdge from "@/components/runs/TurboEdge";
import { t } from "@/hooks/useTranslation";
import { useRetryJob } from "@/hooks/useRetryJob";
import { useRunStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/spinner";
import { RotateCcw } from "lucide-react";

const nodeTypes = {
  turbo: TurboNode,
};

const edgeTypes = {
  turbo: TurboEdge,
};

const defaultEdgeOptions = {
  type: "turbo",
};

// Status variant mapping for Badge component
const STATUS_VARIANTS = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
} as const;

const STATUS_ICONS = {
  completed: "✓",
  running: "⟳",
  failed: "✗",
  pending: "○",
} as const;

function RunsPageContent() {
  // Zustand store
  const { runs, selectedJobId, loading, loadRuns, selectJob } = useRunStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TurboNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Hook pour retry avec SSE temps réel et toasts
  const { retry, retryingJobId } = useRetryJob({
    onSuccess: (jobId) => {
      void loadRuns();
      selectJob(jobId);
    },
  });

  // Note: loadRuns() is called once by StoreProvider

  // Fonction pour construire le flow depuis un job
  const buildFlowFromJob = useCallback(
    (jobType: JobType, jobs: CatalogJob[]) => {
      const newNodes: Node<TurboNodeData>[] = [];
      const newEdges: Edge[] = [];

      const job = jobs.find((j) => j.job_type === jobType);
      if (!job) return;

      let nodeIdCounter = 0;

      // Generic step builder
      const buildSteps = (
        steps: Array<{ key: string; title: string; subtitle: string }>,
        prefix: string,
        currentStepMatcher?: (stepKey: string) => boolean
      ) => {
        let prevNodeId: string | null = null;

        steps.forEach((step, idx) => {
          const nodeId = `${prefix}-${nodeIdCounter++}`;
          let status: "pending" | "running" | "completed" | "failed" = "pending";

          const isCurrentStep = currentStepMatcher
            ? currentStepMatcher(step.key)
            : job.current_step === step.key;

          if (job.status === "failed") {
            if (isCurrentStep || (idx === 0 && !job.current_step)) {
              status = "failed";
            } else {
              const currentIdx = steps.findIndex((s) =>
                currentStepMatcher ? currentStepMatcher(s.key) : job.current_step === s.key
              );
              status = currentIdx !== -1 && idx < currentIdx ? "completed" : "pending";
            }
          } else if (job.status === "completed") {
            status = "completed";
          } else if (job.status === "running") {
            if (isCurrentStep) {
              status = "running";
            } else {
              const currentIdx = steps.findIndex((s) =>
                currentStepMatcher ? currentStepMatcher(s.key) : job.current_step === s.key
              );
              if (currentIdx === -1) {
                status = idx === 0 ? "running" : "pending";
              } else {
                status = idx < currentIdx ? "completed" : "pending";
              }
            }
          }

          newNodes.push({
            id: nodeId,
            type: "turbo",
            position: { x: idx * 160, y: 0 },
            data: {
              title: step.title,
              subtitle: step.subtitle,
              status,
              progress: status === "running" ? job.progress : undefined,
              result:
                idx === steps.length - 1 && job.status === "completed"
                  ? (job.result ?? undefined)
                  : undefined,
            },
          });

          if (prevNodeId) {
            newEdges.push({
              id: `e-${prevNodeId}-${nodeId}`,
              source: prevNodeId,
              target: nodeId,
              animated: status === "running",
              className: `run-edge run-edge-${status}`,
            });
          }

          prevNodeId = nodeId;
        });
      };

      // EXTRACTION PIPELINE
      if (jobType === "extraction") {
        buildSteps(
          [
            { key: "extract_start", title: "Start", subtitle: t("runs.step.connection") },
            { key: "extract_metadata", title: "Extract", subtitle: t("runs.step.tables_columns") },
            { key: "save_to_catalog", title: "Save", subtitle: "SQLite" },
            {
              key: "extract_end",
              title: "Done",
              subtitle: job.result ? `${job.result.tables} tables` : "",
            },
          ],
          "extraction"
        );
      }

      // ENRICHMENT PIPELINE
      if (jobType === "enrichment") {
        const batchMatch = job.current_step?.match(/llm_batch_(\d+)/);
        const batchSubtitle = batchMatch ? `Batch ${batchMatch[1]}` : t("runs.step.descriptions");

        buildSteps(
          [
            { key: "enrich_start", title: "Start", subtitle: t("runs.step.llm_prep") },
            { key: "fetch_tables", title: "Fetch", subtitle: t("runs.step.active_tables") },
            { key: "llm_batch_1", title: "LLM", subtitle: batchSubtitle },
            { key: "save_descriptions", title: "Save", subtitle: "SQLite" },
            { key: "generate_kpis", title: "KPIs", subtitle: t("runs.step.metrics") },
            { key: "generate_questions", title: "Questions", subtitle: "Prompts" },
            {
              key: "enrich_end",
              title: "Done",
              subtitle: job.result ? `${job.result.kpis || 0} KPIs` : "",
            },
          ],
          "enrichment",
          (stepKey) =>
            job.current_step === stepKey ||
            (stepKey === "llm_batch_1" && (job.current_step?.startsWith("llm_batch_") ?? false))
        );
      }

      // SYNC PIPELINE
      if (jobType === "sync") {
        const totalTables = (job.details?.table_names as string[])?.length || 0;
        const tablesSynced = (job.result?.tables_synced as number) || 0;
        const rowsSynced = (job.result?.rows_synced as number) || 0;
        const tablesInProgress =
          job.status === "running"
            ? Math.round(((job.progress || 0) * totalTables) / 100)
            : tablesSynced;

        buildSteps(
          [
            {
              key: "init",
              title: "Init",
              subtitle: `${t("runs.step.connection")} ${job.details?.source_type || ""}`,
            },
            {
              key: "syncing",
              title: "Sync",
              subtitle:
                job.status === "running" && job.current_step?.startsWith("sync_table_")
                  ? `${tablesInProgress}/${totalTables} tables`
                  : job.status === "completed"
                    ? `${tablesSynced}/${totalTables} tables`
                    : `0/${totalTables} tables`,
            },
            { key: "update_stats", title: "Stats", subtitle: "Dataset" },
            {
              key: "complete",
              title: "Done",
              subtitle:
                job.status === "completed"
                  ? `${tablesSynced} tables, ${rowsSynced.toLocaleString()} rows`
                  : "",
            },
          ],
          "sync",
          (stepKey) =>
            job.current_step === stepKey ||
            (stepKey === "syncing" && (job.current_step?.startsWith("sync_table_") ?? false))
        );
      }

      setNodes(newNodes);
      setEdges(newEdges);
    },
    [setNodes, setEdges]
  );

  // SSE for real-time job updates
  useEffect(() => {
    if (!selectedJobId || runs.length === 0) return;

    const selectedJob = runs.find((r) => r.id === selectedJobId);
    if (!selectedJob) return;

    // No SSE for finished jobs
    if (selectedJob.status === "completed" || selectedJob.status === "failed") {
      buildFlowFromJob(selectedJob.job_type, [selectedJob]);
      return;
    }

    const eventSource = new EventSource(`${API_BASE}/catalog/job-stream/${selectedJob.run_id}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.done) {
        eventSource.close();
        void loadRuns();
        return;
      }

      if (data.error) {
        console.error("SSE error:", data.error);
        eventSource.close();
        return;
      }

      buildFlowFromJob(selectedJob.job_type, data);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [selectedJobId, runs, buildFlowFromJob, loadRuns]);

  const handleRetry = useCallback(
    (jobId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      void retry(jobId);
    },
    [retry]
  );

  if (loading) {
    return (
      <div className="h-screen bg-sidebar">
        <LoadingState message={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-sidebar">
      {/* ReactFlow: Job visualization */}
      <div className="h-[40vh]">
        {selectedJobId ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            className="bg-secondary/30"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              className="[&>pattern>circle]:fill-muted-foreground/20"
            />
          </ReactFlow>
        ) : (
          <div className="flex items-center justify-center h-full bg-secondary/30 text-muted-foreground">
            {t("runs.select_job")}
          </div>
        )}
      </div>

      {/* History list */}
      <div className="border-t border-border bg-sidebar overflow-hidden">
        <div className="px-3 py-1.5 border-b border-border/30">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {t("common.history")}
          </h2>
        </div>

        {runs.length === 0 ? (
          <div className="py-3 px-4">
            <div className="text-xs text-muted-foreground italic">{t("runs.no_runs")}</div>
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto">
            {runs.map((job) => {
              const isSelected = selectedJobId === job.id;
              const jobLabel = t(`runs.job_type.${job.job_type}`);
              const dateStr = new Date(job.started_at).toLocaleString("fr-FR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              const sourceName =
                job.job_type === "sync"
                  ? String(job.details?.datasource_name ?? "-")
                  : String(job.details?.dataset_name ?? job.result?.datasource ?? "-");

              return (
                <button
                  key={job.id}
                  onClick={() => selectJob(job.id)}
                  className={`w-full px-4 py-2 grid grid-cols-[auto_140px_120px_180px_140px_1fr_auto] gap-4 items-center border-b border-border/10 transition-all ${
                    isSelected
                      ? "bg-primary/10 border-l-[3px] border-l-primary"
                      : "hover:bg-primary/5 border-l-[3px] border-l-transparent"
                  }`}
                >
                  {/* Status badge */}
                  <Badge variant={STATUS_VARIANTS[job.status] || "outline"} className="w-6 h-6 p-0 justify-center">
                    {STATUS_ICONS[job.status] || "○"}
                  </Badge>

                  {/* Job type */}
                  <span className="text-sm font-semibold text-foreground">{jobLabel}</span>

                  {/* Run ID */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">Run:</span>
                    <span className="font-mono text-foreground text-sm">
                      #{job.run_id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Source name */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">{t("runs.source")}:</span>
                    <span className="font-medium text-foreground text-sm">{sourceName}</span>
                  </div>

                  {/* Date */}
                  <span className="text-muted-foreground text-sm">{dateStr}</span>

                  {/* Results */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
                    {job.job_type === "extraction" && job.result?.tables !== undefined && (
                      <>
                        <span className="font-medium">{String(job.result.tables)} tables</span>
                        {job.result?.columns !== undefined && (
                          <span>· {String(job.result.columns)} {t("runs.columns")}</span>
                        )}
                      </>
                    )}
                    {job.job_type === "enrichment" && (
                      <>
                        {job.result?.tables !== undefined && (
                          <span className="font-medium">{String(job.result.tables)} tables</span>
                        )}
                        {job.result?.kpis !== undefined && (
                          <span>· {String(job.result.kpis)} KPIs</span>
                        )}
                      </>
                    )}
                    {job.job_type === "sync" && (
                      <>
                        {job.result?.tables_synced !== undefined && (
                          <span className="font-medium">
                            {String(job.result.tables_synced)} tables
                          </span>
                        )}
                        {job.result?.rows_synced !== undefined && (
                          <span>· {Number(job.result.rows_synced).toLocaleString()} {t("runs.rows")}</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Retry button */}
                  <div className="flex-shrink-0">
                    {job.status === "failed" ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleRetry(job.id, e)}
                        disabled={retryingJobId === job.id}
                        title={t("runs.retry")}
                        className="text-status-error hover:bg-status-error/10"
                      >
                        <RotateCcw
                          className={`w-4 h-4 ${retryingJobId === job.id ? "animate-spin" : ""}`}
                        />
                      </Button>
                    ) : (
                      <div className="w-8" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RunsPage() {
  return (
    <ReactFlowProvider>
      <RunsPageContent />
    </ReactFlowProvider>
  );
}
