import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";
import type { CatalogTable } from "@/lib/api";

const NODE_WIDTH = 300;
const BASE_NODE_HEIGHT = 120; // Hauteur de base (header + padding)
const ROW_HEIGHT = 24; // Hauteur par colonne

/**
 * Calcule la hauteur d'un nœud en fonction du nombre de colonnes.
 */
function calculateNodeHeight(columnsCount: number): number {
  // Min 3 colonnes affichées, max 12 pour éviter des nœuds trop grands
  const displayedColumns = Math.min(Math.max(columnsCount, 3), 12);
  return BASE_NODE_HEIGHT + displayedColumns * ROW_HEIGHT;
}

/**
 * Détecte les colonnes qui sont potentiellement des clés étrangères.
 * Une colonne est considérée comme FK si:
 * - Son nom correspond à un pattern id/cod/num + nom de table
 * - OU son nom existe dans une autre table comme clé primaire probable
 */
function detectForeignKeyRelations(
  tables: CatalogTable[]
): { source: string; target: string; column: string }[] {
  const relations: { source: string; target: string; column: string }[] = [];
  const addedRelations = new Set<string>();

  // Colonnes typiques de FK/PK
  const fkPatterns = [
    /^(id|cod|num|code)_(.+)$/i,  // id_client, cod_taxi, num_course
    /^(.+)_(id|cod|num|code)$/i,  // client_id, taxi_cod
    /^fk_(.+)$/i,                  // fk_client
  ];

  // Colonnes communes qui créent des relations
  const commonJoinColumns = new Set([
    "num_course", "cod_taxi", "cod_client", "dat_course",
    "id", "course_id", "taxi_id", "client_id", "chauffeur_id"
  ]);

  // Pour chaque paire de tables
  for (let i = 0; i < tables.length; i++) {
    for (let j = 0; j < tables.length; j++) {
      if (i === j) continue;

      const tableA = tables[i];
      const tableB = tables[j];
      const colsA = new Set(tableA.columns.map(c => c.name.toLowerCase()));
      const colsB = new Set(tableB.columns.map(c => c.name.toLowerCase()));

      // Trouver les colonnes communes
      for (const colA of tableA.columns) {
        const colNameLower = colA.name.toLowerCase();

        // Vérifier si c'est une colonne de jointure commune
        if (commonJoinColumns.has(colNameLower) && colsB.has(colNameLower)) {
          const relationKey = [tableA.name, tableB.name, colNameLower].sort().join("-");
          if (!addedRelations.has(relationKey)) {
            addedRelations.add(relationKey);
            relations.push({
              source: tableA.name,
              target: tableB.name,
              column: colA.name,
            });
          }
          continue;
        }

        // Vérifier les patterns de FK
        for (const pattern of fkPatterns) {
          const match = colNameLower.match(pattern);
          if (match) {
            // Extraire le nom de table potentiel du nom de colonne
            const potentialTableName = match[1] === "id" || match[1] === "cod" || match[1] === "num" || match[1] === "code" || match[1] === "fk"
              ? match[2]
              : match[1];

            // Vérifier si cette colonne existe dans l'autre table
            if (
              tableB.name.toLowerCase().includes(potentialTableName.toLowerCase()) ||
              colsB.has(colNameLower)
            ) {
              const relationKey = [tableA.name, tableB.name, colNameLower].sort().join("-");
              if (!addedRelations.has(relationKey)) {
                addedRelations.add(relationKey);
                relations.push({
                  source: tableA.name,
                  target: tableB.name,
                  column: colA.name,
                });
              }
            }
          }
        }
      }
    }
  }

  return relations;
}

export function getLayoutedElements(
  tables: CatalogTable[]
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 200,  // Espacement horizontal entre rangs
    nodesep: 100,  // Espacement vertical entre nœuds
    marginx: 50,
    marginy: 50,
  });

  // Créer les nodes avec hauteur dynamique
  const nodes: Node[] = tables.map((table) => {
    const nodeId = `table-${table.name}`;
    const nodeHeight = calculateNodeHeight(table.columns.length);
    graph.setNode(nodeId, { width: NODE_WIDTH, height: nodeHeight });

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
        isEnabled: table.is_enabled ?? true,
      },
    };
  });

  // Détecter toutes les relations FK entre tables
  const relations = detectForeignKeyRelations(tables);
  const edges: Edge[] = [];

  // Créer les edges pour chaque relation
  relations.forEach((rel, index) => {
    const sourceId = `table-${rel.source}`;
    const targetId = `table-${rel.target}`;

    // Ajouter l'edge au graphe dagre pour le layout
    graph.setEdge(sourceId, targetId);

    edges.push({
      id: `edge-${rel.source}-${rel.target}-${rel.column}-${index}`,
      source: sourceId,
      target: targetId,
      label: rel.column,
      labelStyle: { fontSize: 10, fill: "hsl(260 10% 60%)" },
      labelBgStyle: { fill: "hsl(260 10% 10%)", fillOpacity: 0.8 },
      style: { stroke: "hsl(260 100% 65%)", strokeWidth: 2 },
      type: "smoothstep",
    });
  });

  // Appliquer le layout dagre
  dagre.layout(graph);

  // Mettre à jour les positions des nœuds
  nodes.forEach((node) => {
    const nodeWithPosition = graph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      };
    }
  });

  return { nodes, edges };
}
