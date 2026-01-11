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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTable, setSelectedTable] = useState<api.CatalogTable | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { setActions } = useHeaderActions();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Charger le catalogue au montage
  useEffect(() => {
    (async () => {
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

  // Générer le catalogue
  const handleGenerate = useCallback(async () => {
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

    setIsGenerating(true);
    setSelectedTable(null);
    toast.info("Génération du catalogue en cours...", {
      description: "Extraction + Enrichissement LLM",
    });

    // Polling pour mises à jour en temps réel
    pollingRef.current = setInterval(async () => {
      const result = await api.fetchCatalog();
      if (result) {
        setCurrentCatalog(result.catalog);
      }
    }, 2000);

    const result = await api.generateCatalog();

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (result) {
      toast.success("Catalogue généré", {
        description: `${result.tables_count} tables, ${result.columns_count} colonnes`,
      });
      await refreshCatalog();
    } else {
      toast.error("Erreur lors de la génération");
    }

    setIsGenerating(false);
  }, []);

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
    } else {
      toast.error("Erreur lors de la suppression");
    }

    setIsDeleting(false);
  }, [setNodes, setEdges]);

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Actions du header
  useEffect(() => {
    const hasContent = currentCatalog.flatMap((ds) => ds.tables).length > 0;

    setActions(
      <CatalogActions
        hasContent={hasContent}
        isGenerating={isGenerating}
        isDeleting={isDeleting}
        onGenerate={handleGenerate}
        onDelete={handleDelete}
      />
    );

    return () => setActions(null);
  }, [setActions, handleGenerate, handleDelete, isGenerating, isDeleting, currentCatalog]);

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
      {/* Indicateur de génération */}
      {isGenerating && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-primary">
            Génération en cours... Les tables apparaissent au fur et à mesure
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
        <CatalogEmptyState isGenerating={isGenerating} onGenerate={handleGenerate} />
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
          </div>

          {/* Panel de détails */}
          {selectedTable && (
            <TableDetailPanel
              table={selectedTable}
              onClose={() => setSelectedTable(null)}
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
