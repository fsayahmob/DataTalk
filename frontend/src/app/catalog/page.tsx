"use client";

import { useEffect, useCallback, useMemo } from "react";
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

import {
  SchemaNode,
  CustomControls,
  TableDetailPanel,
  CatalogEmptyState,
  CatalogFooter,
  CatalogActions,
  getLayoutedElements,
} from "@/components/catalog";
import { SyncWarningBanner } from "@/components/SyncWarningBanner";
import { LoadingState } from "@/components/ui/spinner";
import { t } from "@/hooks/useTranslation";
import { useCatalogStore, useDatasetStore } from "@/stores";

const nodeTypes = { schemaNode: SchemaNode };

function CatalogPageContent() {
  // Zustand stores
  const {
    catalog,
    selectedTable,
    loading,
    isExtracting,
    isEnriching,
    isDeleting,
    isRunning,
    extractCatalog,
    enrichCatalog,
    deleteCatalog,
    selectTable,
    toggleTable,
    enabledTablesCount,
  } = useCatalogStore();

  // Dataset store (loaded by StoreProvider)
  const { activeDataset } = useDatasetStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Get store actions for refreshing after job completion
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);

  // Reload catalog when active dataset changes
  useEffect(() => {
    if (activeDataset?.id) {
      void loadCatalog();
    }
  }, [activeDataset?.id, loadCatalog]);

  // Note: SSE job completion listener is now global (in StoreProvider)
  // Note: loadCatalog() is called once by StoreProvider

  // All tables from catalog - derive from catalog state directly
  // (Using catalog as dependency ensures re-render when data changes)
  const allCurrentTables = useMemo(
    () => catalog.flatMap((ds) => ds.tables),
    [catalog]
  );

  // Handle node click
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const tableName = node.id.replace("table-", "");
      const table = allCurrentTables.find((t) => t.name === tableName);
      if (table) {
        selectTable(table);
      }
    },
    [allCurrentTables, selectTable]
  );

  // Extract handler
  const handleExtract = useCallback(() => {
    void extractCatalog();
  }, [extractCatalog]);

  // Enrich handler
  const handleEnrich = useCallback(() => {
    const selectedTableIds = allCurrentTables
      .filter((table) => table.is_enabled && table.id)
      .map((table) => table.id as number);

    void enrichCatalog(selectedTableIds);
  }, [allCurrentTables, enrichCatalog]);

  // Delete handler
  const handleDelete = useCallback(() => {
    void deleteCatalog().then((success) => {
      if (success) {
        setNodes([]);
        setEdges([]);
      }
    });
  }, [deleteCatalog, setNodes, setEdges]);

  // Update React Flow when tables change
  useEffect(() => {
    if (allCurrentTables.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(allCurrentTables);
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
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Sync warning banner */}
      <SyncWarningBanner datasetId={activeDataset?.id ?? null} />

      {/* Extraction indicator */}
      {isExtracting && (
        <div className="px-4 py-2 bg-status-info/20 border-b border-status-info/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-status-info border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-status-info">{t("catalog.extracting")}</span>
        </div>
      )}

      {/* Enrichment indicator */}
      {isEnriching && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-primary">{t("catalog.enriching_progress")}</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState message={t("catalog.loading")} />
      ) : !hasContent ? (
        <CatalogEmptyState isExtracting={isExtracting} onExtract={handleExtract} />
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
              className="bg-secondary/30"
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                className="[&>pattern>circle]:fill-muted-foreground/20"
              />
              <CustomControls />
              <MiniMap
                className="!bg-card !border-border/50"
                nodeColor={() => "hsl(var(--primary))"}
                maskColor="hsl(var(--background) / 0.8)"
              />
            </ReactFlow>

            {/* Actions toolbar */}
            <div className="absolute top-4 right-4">
              <CatalogActions
                hasContent={hasContent}
                isExtracting={isExtracting}
                isEnriching={isEnriching}
                isDeleting={isDeleting}
                onExtract={handleExtract}
                onEnrich={handleEnrich}
                onDelete={handleDelete}
                enabledTablesCount={enabledTablesCount()}
              />
            </div>

            {/* Hint */}
            {!selectedTable && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-card border border-border/50 rounded-full text-xs text-muted-foreground">
                {t("catalog.select_table")}
              </div>
            )}

            {/* Status Badge (if running) */}
            {isRunning && (
              <div className="absolute bottom-4 left-4 px-4 py-2 bg-status-running/20 border border-status-running/50 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  <span className="text-sm text-status-running">
                    {t("catalog.pipeline_running")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedTable && (
            <TableDetailPanel
              table={selectedTable}
              onClose={() => selectTable(null)}
              onTableToggle={toggleTable}
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
