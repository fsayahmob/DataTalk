"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ReactFlow,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as api from "@/lib/api";
import TurboNode, { type TurboNodeData } from "@/components/runs/TurboNode";
import TurboEdge from "@/components/runs/TurboEdge";
import { t } from "@/hooks/useTranslation";

const nodeTypes = {
  turbo: TurboNode,
};

const edgeTypes = {
  turbo: TurboEdge,
};

const defaultEdgeOptions = {
  type: 'turbo',
  markerEnd: 'edge-circle',
};

// Helper functions pour le style des jobs (réduit la complexité)
function getStatusBgClass(status: string): string {
  switch (status) {
    case "completed": return "bg-green-500/20";
    case "running": return "bg-orange-500/20";
    case "failed": return "bg-red-500/20";
    default: return "bg-gray-500/20";
  }
}

function getStatusTextClass(status: string): string {
  switch (status) {
    case "completed": return "text-green-400";
    case "running": return "text-orange-400";
    case "failed": return "text-red-400";
    default: return "text-gray-400";
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed": return "✓";
    case "running": return "⟳";
    case "failed": return "✗";
    default: return "○";
  }
}

function RunsPageContent() {
  const [runs, setRuns] = useState<api.Run[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TurboNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  // Effet 1: Charger les runs (une seule fois au mount)
  const loadRuns = useCallback(async () => {
    try {
      const data = await api.fetchRuns();
      setRuns(data);
    } catch (error) {
      console.error("Error loading runs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Effet 2: Auto-sélectionner le premier job quand runs change et pas de sélection
  useEffect(() => {
    if (runs.length > 0 && selectedJobId === null) {
      setSelectedJobId(runs[0].id);
    }
  }, [runs, selectedJobId]);

  // Fonction pour construire le flow depuis un job
  const buildFlowFromJob = useCallback((jobType: "extraction" | "enrichment", jobs: api.CatalogJob[]) => {
    const newNodes: Node<TurboNodeData>[] = [];
    const newEdges: Edge[] = [];

    // Trouver le job du type demandé
    const job = jobs.find((j) => j.job_type === jobType);
    if (!job) return;

    let nodeIdCounter = 0;

    // ===== EXTRACTION PIPELINE =====
    if (jobType === "extraction") {
      const steps = [
        { key: 'extract_start', title: 'Start', subtitle: 'Connexion DB' },
        { key: 'extract_metadata', title: 'Extract Metadata', subtitle: 'Tables & Colonnes' },
        { key: 'save_to_catalog', title: 'Save Catalog', subtitle: 'SQLite' },
        { key: 'extract_end', title: 'Done', subtitle: job.result ? `${job.result.tables} tables` : '' },
      ];

      let prevNodeId: string | null = null;

      steps.forEach((step, idx) => {
        const nodeId = `extraction-${nodeIdCounter++}`;

        // Déterminer le status de ce step
        let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
        if (job.status === 'failed') {
          status = idx === 0 ? 'failed' : 'pending';
        } else if (job.status === 'completed') {
          status = 'completed';
        } else if (job.status === 'running') {
          if (job.current_step === step.key) {
            status = 'running';
          } else {
            const currentStepIndex = steps.findIndex(s => s.key === job.current_step);
            if (currentStepIndex === -1) {
              status = idx === 0 ? 'running' : 'pending';
            } else {
              status = idx < currentStepIndex ? 'completed' : 'pending';
            }
          }
        }

        newNodes.push({
          id: nodeId,
          type: 'turbo',
          position: { x: idx * 220, y: 0 },
          data: {
            title: step.title,
            subtitle: step.subtitle,
            status,
            progress: status === 'running' ? job.progress : undefined,
            result: idx === steps.length - 1 && job.status === 'completed' ? job.result ?? undefined : undefined,
          },
        });

        // Edge vers le step suivant
        if (prevNodeId) {
          newEdges.push({
            id: `e-${prevNodeId}-${nodeId}`,
            source: prevNodeId,
            target: nodeId,
            animated: status === 'running',
            style: {
              stroke: status === 'completed' ? '#22c55e' : status === 'running' ? '#3b82f6' : '#6b7280',
              strokeWidth: 2,
            },
          });
        }

        prevNodeId = nodeId;
      });
    }

    // ===== ENRICHMENT PIPELINE =====
    if (jobType === "enrichment") {
      const enrichmentSteps = [
        { key: 'enrich_start', title: 'Start', subtitle: 'Préparation LLM' },
        { key: 'fetch_tables', title: 'Fetch Tables', subtitle: 'Tables activées' },
        { key: 'llm_batch_1', title: 'LLM Batch', subtitle: 'Descriptions' },
        { key: 'save_descriptions', title: 'Save', subtitle: 'SQLite' },
        { key: 'generate_kpis', title: 'KPIs', subtitle: 'Métriques' },
        { key: 'generate_questions', title: 'Questions', subtitle: 'Prompts' },
        { key: 'enrich_end', title: 'Done', subtitle: job.result ? `${job.result.kpis || 0} KPIs` : '' },
      ];

      let prevNodeId: string | null = null;

      enrichmentSteps.forEach((step, idx) => {
        const nodeId = `enrichment-${nodeIdCounter++}`;

        let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
        let subtitle = step.subtitle;

        if (job.status === 'failed') {
          status = idx === 0 ? 'failed' : 'pending';
        } else if (job.status === 'completed') {
          status = 'completed';
        } else if (job.status === 'running') {
          // Handle llm_batch_N
          if (job.current_step?.startsWith('llm_batch_') && step.key === 'llm_batch_1') {
            status = 'running';
            // Extraire le numéro de batch
            const batchMatch = job.current_step.match(/llm_batch_(\d+)/);
            if (batchMatch) {
              subtitle = `Batch ${batchMatch[1]}`;
            }
          } else if (job.current_step === step.key) {
            status = 'running';
          } else {
            const currentStepIndex = enrichmentSteps.findIndex(s =>
              s.key === job.current_step ||
              (job.current_step?.startsWith('llm_batch_') && s.key === 'llm_batch_1')
            );
            if (currentStepIndex === -1) {
              status = idx === 0 ? 'running' : 'pending';
            } else {
              status = idx < currentStepIndex ? 'completed' : 'pending';
            }
          }
        }

        // Position centrée sur Y=0 (pas de décalage)
        newNodes.push({
          id: nodeId,
          type: 'turbo',
          position: { x: idx * 220, y: 0 },
          data: {
            title: step.title,
            subtitle: subtitle,
            status,
            progress: status === 'running' ? job.progress : undefined,
            result: idx === enrichmentSteps.length - 1 && job.status === 'completed' ? job.result ?? undefined : undefined,
          },
        });

        // Edge vers le step suivant
        if (prevNodeId) {
          newEdges.push({
            id: `e-${prevNodeId}-${nodeId}`,
            source: prevNodeId,
            target: nodeId,
            animated: status === 'running',
            style: {
              stroke: status === 'completed' ? '#22c55e' : status === 'running' ? '#3b82f6' : '#6b7280',
              strokeWidth: 2,
            },
          });
        }

        prevNodeId = nodeId;
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [setNodes, setEdges]);

  // Effet 3: Charger détails d'un job (SSE pour temps réel)
  useEffect(() => {
    if (!selectedJobId || runs.length === 0) return;

    // Trouver le job sélectionné pour récupérer son run_id
    const selectedJob = runs.find((r) => r.id === selectedJobId);
    if (!selectedJob) return;

    // Ne pas ouvrir SSE si le job est déjà terminé (completed ou failed)
    if (selectedJob.status === 'completed' || selectedJob.status === 'failed') {
      // Afficher directement le flow final
      buildFlowFromJob(selectedJob.job_type, [selectedJob]);
      return;
    }

    const eventSource = new EventSource(
      `http://localhost:8000/catalog/job-stream/${selectedJob.run_id}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.done) {
        eventSource.close();
        void loadRuns(); // Refresh liste
        return;
      }

      if (data.error) {
        console.error("SSE error:", data.error);
        eventSource.close();
        return;
      }

      // Construire le flow depuis le job (extraction OU enrichissement)
      buildFlowFromJob(selectedJob.job_type, data);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [selectedJobId, runs, buildFlowFromJob, loadRuns]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-sidebar">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-sidebar">
      {/* ReactFlow: Visualisation du job */}
      <div className="h-[40vh] bg-background">
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
          >
            <svg>
              <defs>
                <linearGradient id="edge-gradient">
                  <stop offset="0%" stopColor="#ae53ba" />
                  <stop offset="100%" stopColor="#2a8af6" />
                </linearGradient>

                <marker
                  id="edge-circle"
                  viewBox="-5 -5 10 10"
                  refX="0"
                  refY="0"
                  markerUnits="strokeWidth"
                  markerWidth="10"
                  markerHeight="10"
                  orient="auto"
                >
                  <circle stroke="#2a8af6" strokeOpacity="0.75" r="2" cx="0" cy="0" />
                </marker>
              </defs>
            </svg>
          </ReactFlow>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Sélectionnez un job dans la liste
          </div>
        )}
      </div>

      {/* Historique des runs (style GitHub) */}
      <div className="border-t border-border bg-sidebar overflow-hidden">
        <div className="px-3 py-1.5 border-b border-border/30">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("common.history")}</h2>
        </div>

        {runs.length === 0 ? (
          <div className="py-3 px-4">
            <div className="text-xs text-muted-foreground italic">
              {t("runs.no_runs")}
            </div>
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto">
            {runs.map((job) => {
              const isSelected = selectedJobId === job.id;
              const jobLabel = job.job_type === "extraction" ? "Extraction" : "Enrichissement";
              const dateStr = new Date(job.started_at).toLocaleString('fr-FR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full px-4 py-2 grid grid-cols-[auto_140px_120px_180px_140px_1fr] gap-4 items-center border-b border-border/10 transition-all ${
                    isSelected
                      ? "bg-primary/10 border-l-[3px] border-l-primary"
                      : "hover:bg-primary/5 border-l-[3px] border-l-transparent"
                  }`}
                >
                  {/* Colonne 1: Status icon */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusBgClass(job.status)}`}>
                    <span className={`text-xs ${getStatusTextClass(job.status)}`}>
                      {getStatusIcon(job.status)}
                    </span>
                  </div>

                  {/* Colonne 2: Type de job */}
                  <span className="text-sm font-semibold text-foreground">{jobLabel}</span>

                  {/* Colonne 3: Run ID */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">Run:</span>
                    <span className="font-mono text-foreground text-sm">#{job.run_id.slice(0, 8)}</span>
                  </div>

                  {/* Colonne 4: Datasource */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">Base:</span>
                    <span className="font-medium text-foreground text-sm">{String(job.result?.datasource ?? "-")}</span>
                  </div>

                  {/* Colonne 5: Date */}
                  <span className="text-muted-foreground text-sm">{dateStr}</span>

                  {/* Colonne 6: Résultats (alignés à droite) */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
                    {job.result?.tables !== undefined && (
                      <span className="font-medium">{String(job.result.tables)} tables</span>
                    )}
                    {job.result?.kpis !== undefined && (
                      <span>· {String(job.result.kpis)} KPIs</span>
                    )}
                    {job.result?.columns !== undefined && job.job_type === "extraction" && (
                      <span>· {String(job.result.columns)} colonnes</span>
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
