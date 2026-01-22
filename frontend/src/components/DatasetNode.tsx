"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { Dataset } from "@/lib/api";

// Node data type with index signature for ReactFlow compatibility
export interface DatasetNodeData {
  dataset: Dataset;
  onActivate: (id: string) => void;
  [key: string]: unknown;
}

/**
 * Custom ReactFlow node for displaying a dataset
 * Shows name, status indicator, and handles click to activate
 */
function DatasetNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as DatasetNodeData;
  const { dataset, onActivate } = nodeData;
  const isActive = dataset.is_active;

  // Status indicator color
  const statusColors: Record<Dataset["status"], string> = {
    empty: "bg-muted-foreground",
    syncing: "bg-status-info",
    ready: "bg-status-success",
    error: "bg-status-error",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isActive) {
      onActivate(dataset.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{ pointerEvents: "all" }}
      className={`
        w-[130px] h-[32px] rounded-md border text-xs font-medium
        transition-all duration-150 cursor-pointer select-none
        flex items-center justify-center gap-2 px-2
        ${isActive
          ? "bg-primary/20 border-primary text-primary shadow-sm"
          : "bg-card border-border text-foreground hover:border-primary/50 hover:bg-card/80"
        }
        ${selected ? "ring-2 ring-primary/50" : ""}
      `}
    >
      {/* Status indicator */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[dataset.status]}`}
        title={dataset.status}
      />

      {/* Dataset name */}
      <span className="truncate max-w-[80px]">{dataset.name}</span>

      {/* Active indicator */}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
      )}

      {/* Hidden handles for potential future connections */}
      <Handle type="target" position={Position.Left} className="opacity-0 w-1 h-1" />
      <Handle type="source" position={Position.Right} className="opacity-0 w-1 h-1" />
    </div>
  );
}

// Memoize for performance
export const DatasetNode = memo(DatasetNodeComponent);
