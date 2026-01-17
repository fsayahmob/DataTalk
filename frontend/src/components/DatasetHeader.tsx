"use client";

import { ReactFlow, Background, ReactFlowProvider, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

/**
 * DatasetHeader - Header component with ReactFlow canvas for dataset visualization
 *
 * Future: Will display dataset nodes that can be clicked to switch between datasets.
 * Current: Empty ReactFlow canvas as placeholder.
 */
export function DatasetHeader() {
  return (
    <div className="h-12 border-b border-border/30 bg-sidebar/50 flex-shrink-0">
      <ReactFlowProvider>
        <ReactFlow
          nodes={[]}
          edges={[]}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={0.5} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
