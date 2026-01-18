"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ReactFlow, ReactFlowProvider, BackgroundVariant, Background } from "@xyflow/react";
import type { Node, NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DatasetNode } from "@/components/DatasetNode";
import * as api from "@/lib/api";
import type { Dataset } from "@/lib/api";
import { toast } from "sonner";
import { t } from "@/hooks/useTranslation";
import { PlusIcon } from "@/components/icons";

// Hydration-safe mounting detection
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// Custom node types
const nodeTypes: NodeTypes = {
  dataset: DatasetNode,
};

// Convert datasets to ReactFlow nodes
function datasetsToNodes(
  datasets: Dataset[],
  onActivate: (id: string) => void
): Node[] {
  const spacing = 160;
  const startX = 20;

  return datasets.map((dataset, index) => ({
    id: dataset.id,
    type: "dataset",
    position: { x: startX + index * spacing, y: 8 },
    data: { dataset, onActivate } as Record<string, unknown>,
    draggable: false,
    selectable: false,
    connectable: false,
  }));
}

/**
 * DatasetHeader - Header component with ReactFlow canvas for dataset visualization
 *
 * Displays dataset nodes that can be clicked to switch between datasets.
 * The active dataset is highlighted with primary color.
 */
function DatasetHeaderInner() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  // Load datasets
  const loadDatasets = useCallback(async () => {
    try {
      const response = await api.fetchDatasets(false); // No stats needed for header
      setDatasets(response.datasets);
    } catch (err) {
      console.error("Failed to load datasets for header:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      void loadDatasets();
    }
  }, [mounted, loadDatasets]);

  // Handle dataset activation (async logic)
  const activateDataset = useCallback(async (datasetId: string) => {
    try {
      await api.activateDataset(datasetId);
      toast.success(t("datasets.activated"));
      // Update local state
      setDatasets((prev) =>
        prev.map((d) => ({
          ...d,
          is_active: d.id === datasetId,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }, []);

  // Sync wrapper for ReactFlow callback
  const handleActivate = useCallback(
    (datasetId: string) => {
      void activateDataset(datasetId);
    },
    [activateDataset]
  );

  // Convert to nodes
  const nodes = useMemo(
    () => datasetsToNodes(datasets, handleActivate),
    [datasets, handleActivate]
  );

  // Loading state
  if (!mounted || loading) {
    return (
      <div className="h-12 border-b border-border/30 bg-sidebar/50 flex-shrink-0 flex items-center px-4">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  // Empty state - no datasets yet
  if (datasets.length === 0) {
    return (
      <div className="h-12 border-b border-border/30 bg-sidebar/50 flex-shrink-0 flex items-center px-4">
        <a
          href="/datasets"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <PlusIcon size={14} />
          <span>{t("datasets.create_first")}</span>
        </a>
      </div>
    );
  }

  return (
    <div className="h-12 border-b border-border/30 bg-sidebar/50 flex-shrink-0">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        minZoom={1}
        maxZoom={1}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.5} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}

/**
 * DatasetHeader wrapped in ReactFlowProvider
 */
export function DatasetHeader() {
  return (
    <ReactFlowProvider>
      <DatasetHeaderInner />
    </ReactFlowProvider>
  );
}
