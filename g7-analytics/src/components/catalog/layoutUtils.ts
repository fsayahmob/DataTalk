import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";
import type { CatalogTable } from "@/lib/api";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 200;

export function getLayoutedElements(
  tables: CatalogTable[]
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 150, nodesep: 80 });

  // Créer les nodes
  const nodes: Node[] = tables.map((table) => {
    const nodeId = `table-${table.name}`;
    graph.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });

    return {
      id: nodeId,
      type: "schemaNode",
      position: { x: 0, y: 0 },
      data: {
        label: table.name,
        description: table.description,
        rowCount: table.row_count,
        columns: table.columns,
        isPreview: false,
      },
    };
  });

  // Détecter les relations par colonnes communes
  const edges: Edge[] = [];
  const keyColumns = new Set(["num_course", "cod_taxi", "cod_client", "dat_course"]);

  if (tables.length >= 2) {
    const table1Cols = new Set(tables[0].columns.map((c) => c.name.toLowerCase()));
    const table2Cols = new Set(tables[1].columns.map((c) => c.name.toLowerCase()));

    for (const col of keyColumns) {
      if (table1Cols.has(col) && table2Cols.has(col)) {
        graph.setEdge(`table-${tables[0].name}`, `table-${tables[1].name}`);
        edges.push({
          id: `edge-${col}`,
          source: `table-${tables[1].name}`,
          target: `table-${tables[0].name}`,
          label: col,
          labelStyle: { fontSize: 10, fill: "hsl(260 10% 60%)" },
          labelBgStyle: { fill: "hsl(260 10% 10%)", fillOpacity: 0.8 },
          style: { stroke: "hsl(260 100% 65%)", strokeWidth: 2 },
          type: "smoothstep",
        });
        break;
      }
    }
  }

  dagre.layout(graph);

  nodes.forEach((node) => {
    const nodeWithPosition = graph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      };
    }
  });

  return { nodes, edges };
}
