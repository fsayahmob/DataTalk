"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge, NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useHeaderActions } from "@/components/AppShell";
import {
  SchemaNode,
  CustomControls,
  TableDetailPanel,
  CatalogEmptyState,
  CatalogFooter,
  CatalogActions,
  getLayoutedElements,
} from "@/components/catalog";
import * as api from "@/lib/api";

const nodeTypes = { schemaNode: SchemaNode };

function CatalogPageContent() {
  const [currentCatalog, setCurrentCatalog] = useState<api.CatalogDatasource[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTable, setSelectedTable] = useState<api.CatalogTable | null>(null);
  const [isRunning, setIsRunning] = useState(false); // SSE status

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { setActions } = useHeaderActions();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // SSE: Écouter l'état global (running ou pas)
  useEffect(() => {
    const eventSource = new EventSource("http://localhost:8000/catalog/status-stream");

    eventSource.onmessage = (event) => {
      const status = JSON.parse(event.data);
      setIsRunning(status.is_running);
    };

    eventSource.onerror = () => {
      console.log("SSE status-stream disconnected");
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  // Charger le catalogue au montage
  useEffect(() => {
    void (async () => {
      const result = await api.fetchCatalog();
      if (result) {
        setCurrentCatalog(result.catalog);
      }
      setLoadingCatalog(false);
    })();
  }, []);

  // Fonction utilitaire pour recharger le catalogue
  const refreshCatalog = async () => {
    const result = await api.fetchCatalog();
    if (result) {
      setCurrentCatalog(result.catalog);
    }
  };

  // Combiner les tables pour l'affichage
  const allCurrentTables = useMemo(
    () => currentCatalog.flatMap((ds) => ds.tables),
    [currentCatalog]
  );

  // Gérer le clic sur une table
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const tableName = node.id.replace("table-", "");
      const table = allCurrentTables.find((t) => t.name === tableName);
      if (table) {
        setSelectedTable(table);
      }
    },
    [allCurrentTables]
  );

  // ÉTAPE 1: Extraire le schéma (sans LLM)
  const handleExtract = useCallback(async () => {
    setIsExtracting(true);
    setSelectedTable(null);
    toast.info("Extraction du schéma en cours...", {
      description: "Sans enrichissement LLM",
    });

    const result = await api.extractCatalog();

    if (result) {
      toast.success("Schéma extrait", {
        description: `${result.tables_count} tables, ${result.columns_count} colonnes. Sélectionnez les tables à enrichir.`,
      });
      await refreshCatalog();
    } else {
      toast.error("Erreur lors de l'extraction");
    }

    setIsExtracting(false);
  }, []);

  // ÉTAPE 2: Enrichir les tables sélectionnées (avec LLM)
  const handleEnrich = useCallback(async () => {
    // Récupérer les IDs des tables activées (sélection locale)
    const selectedTableIds = allCurrentTables
      .filter((t) => t.is_enabled && t.id)
      .map((t) => t.id as number);

    if (selectedTableIds.length === 0) {
      toast.error("Aucune table sélectionnée", {
        description: "Cochez au moins une table avant d'enrichir",
      });
      return;
    }

    const llmStatus = await api.fetchLLMStatus();
    if (llmStatus.status === "error") {
      toast.error("LLM non configuré", {
        description: "Configurez une clé API dans Paramètres > Modèles LLM",
        action: {
          label: "Configurer",
          onClick: () => window.location.href = "/settings",
        },
      });
      return;
    }

    setIsEnriching(true);
    setSelectedTable(null);
    toast.info("Enrichissement LLM en cours...", {
      description: `${selectedTableIds.length} table(s) sélectionnée(s)`,
    });

    // Polling pour mises à jour en temps réel
    const pollInterval = setInterval(() => {
      void api.fetchCatalog().then((catalogResult) => {
        if (catalogResult) {
          setCurrentCatalog(catalogResult.catalog);
        }
      });
    }, 3000);
    pollingRef.current = pollInterval;

    try {
      // Passer les IDs des tables sélectionnées
      const result = await api.enrichCatalog(selectedTableIds);

      // Arrêter le polling immédiatement
      clearInterval(pollInterval);
      if (pollingRef.current === pollInterval) {
        pollingRef.current = null;
      }

      if (result && result.status === "ok") {
        toast.success("Catalogue enrichi", {
          description: `${result.tables_count || 0} tables, ${result.columns_count || 0} colonnes, ${result.kpis_count || 0} KPIs`,
        });
        await refreshCatalog();
        // Notifier les autres pages/onglets de recharger les questions
        localStorage.setItem("catalog-updated", Date.now().toString());
      } else if (result && result.status === "error") {
        // Erreur structurée du backend
        if (result.error_type === "vertex_ai_schema_too_complex") {
          toast.error("Schéma trop complexe pour Vertex AI", {
            description: result.suggestion || "Réduisez le Batch Size dans Settings > Database",
            duration: 10000,
            action: {
              label: "Settings",
              onClick: () => window.location.href = "/settings",
            },
          });
        } else {
          toast.error("Erreur LLM", {
            description: result.message,
            duration: 8000,
          });
        }
      } else {
        toast.error("Erreur lors de l'enrichissement");
      }
    } catch {
      clearInterval(pollInterval);
      if (pollingRef.current === pollInterval) {
        pollingRef.current = null;
      }
      toast.error("Erreur lors de l'enrichissement");
    }

    setIsEnriching(false);
  }, [allCurrentTables]);

  // Supprimer le catalogue
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setSelectedTable(null);
    const success = await api.deleteCatalog();

    if (success) {
      toast.success("Catalogue supprimé");
      setCurrentCatalog([]);
      setNodes([]);
      setEdges([]);
      // Notifier les autres pages/onglets de recharger les questions
      localStorage.setItem("catalog-updated", Date.now().toString());
    } else {
      toast.error("Erreur lors de la suppression");
    }

    setIsDeleting(false);
  }, [setNodes, setEdges]);

  // Callback quand une table est togglée (enable/disable)
  const handleTableToggle = useCallback(
    (tableId: number, newState: boolean) => {
      // Mettre à jour le catalogue local
      setCurrentCatalog((prev) =>
        prev.map((ds) => ({
          ...ds,
          tables: ds.tables.map((t) =>
            t.id === tableId ? { ...t, is_enabled: newState } : t
          ),
        }))
      );

      // Mettre à jour la table sélectionnée si c'est celle qui a été togglée
      setSelectedTable((prev) =>
        prev && prev.id === tableId ? { ...prev, is_enabled: newState } : prev
      );
    },
    []
  );

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Compter les tables activées
  const enabledTablesCount = useMemo(
    () => allCurrentTables.filter((t) => t.is_enabled).length,
    [allCurrentTables]
  );

  // Actions du header
  useEffect(() => {
    const hasContent = currentCatalog.flatMap((ds) => ds.tables).length > 0;

    setActions(
      <CatalogActions
        hasContent={hasContent}
        isExtracting={isExtracting}
        isEnriching={isEnriching}
        isDeleting={isDeleting}
        onExtract={() => void handleExtract()}
        onEnrich={() => void handleEnrich()}
        onDelete={() => void handleDelete()}
        enabledTablesCount={enabledTablesCount}
      />
    );

    return () => setActions(null);
  }, [setActions, handleExtract, handleEnrich, handleDelete, isExtracting, isEnriching, isDeleting, currentCatalog, enabledTablesCount]);

  // Mettre à jour React Flow
  useEffect(() => {
    if (allCurrentTables.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allCurrentTables);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [allCurrentTables, setNodes, setEdges]);

  const hasContent = nodes.length > 0;

  // Stats
  const descriptionStats = useMemo(() => {
    const allCols = allCurrentTables.flatMap((t) => t.columns);
    const withDesc = allCols.filter((c) => c.description);
    return { total: allCols.length, withDesc: withDesc.length };
  }, [allCurrentTables]);

  const totalRows = useMemo(
    () => allCurrentTables.reduce((acc, t) => acc + (t.row_count || 0), 0),
    [allCurrentTables]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(260_10%_6%)]">
      {/* Indicateur d'extraction */}
      {isExtracting && (
        <div className="px-4 py-2 bg-blue-500/20 border-b border-blue-500/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-400">
            Extraction du schéma en cours...
          </span>
        </div>
      )}

      {/* Indicateur d'enrichissement */}
      {isEnriching && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-primary">
            Enrichissement LLM en cours... Les descriptions apparaissent au fur et à mesure
          </span>
        </div>
      )}

      {/* Content */}
      {loadingCatalog ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
            <p className="text-muted-foreground">Chargement du catalogue...</p>
          </div>
        </div>
      ) : !hasContent ? (
        <CatalogEmptyState isExtracting={isExtracting} onExtract={() => void handleExtract()} />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* ERD Canvas */}
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              className="bg-[hsl(260_10%_4%)]"
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="hsl(260 10% 20%)"
              />
              <CustomControls />
              <MiniMap
                className="!bg-[hsl(260_10%_8%)] !border-border/50"
                nodeColor={() => "hsl(260 100% 65%)"}
                maskColor="hsl(260 10% 5% / 0.8)"
              />
            </ReactFlow>

            {/* Hint */}
            {!selectedTable && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[hsl(260_10%_12%)] border border-border/50 rounded-full text-xs text-muted-foreground">
                Cliquez sur une table pour voir les détails
              </div>
            )}

            {/* Status Badge (si running) */}
            {isRunning && (
              <div className="absolute bottom-4 left-4 px-4 py-2 bg-orange-500/20 border border-orange-500/50 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  <span className="text-sm text-orange-400">Pipeline en cours...</span>
                </div>
              </div>
            )}
          </div>

          {/* Panel de détails */}
          {selectedTable && (
            <TableDetailPanel
              table={selectedTable}
              onClose={() => setSelectedTable(null)}
              onTableToggle={handleTableToggle}
            />
          )}
        </div>
      )}

      {/* Footer stats */}
      {hasContent && (
        <CatalogFooter
          tableCount={nodes.length}
          columnCount={descriptionStats.total}
          columnsWithDesc={descriptionStats.withDesc}
          totalRows={totalRows}
        />
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <ReactFlowProvider>
      <CatalogPageContent />
    </ReactFlowProvider>
  );
}
