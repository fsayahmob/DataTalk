"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge, NodeMouseHandler } from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";

import { useHeaderActions } from "@/components/AppShell";
import { SchemaNode } from "@/components/catalog/SchemaNode";
import * as api from "@/lib/api";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 200;

function getLayoutedElements(
  tables: api.CatalogTable[]
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

const nodeTypes = { schemaNode: SchemaNode };

// Composant de contrôles custom
function CustomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-[hsl(260_10%_12%)] border border-border/50 rounded-lg p-1 shadow-xl">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => zoomIn()}
        title="Zoom +"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => zoomOut()}
        title="Zoom -"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14" />
        </svg>
      </Button>
      <div className="h-px bg-border/50 my-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => fitView({ padding: 0.2 })}
        title="Ajuster la vue"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </Button>
    </div>
  );
}

// Panel de détails d'une table
interface TableDetailPanelProps {
  table: api.CatalogTable;
  onClose: () => void;
}

function TableDetailPanel({ table, onClose }: TableDetailPanelProps) {
  return (
    <div className="w-[400px] border-l border-border/30 bg-[hsl(260_10%_8%)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
        <div>
          <h3 className="font-mono font-bold text-foreground">{table.name}</h3>
          <p className="text-xs text-muted-foreground">
            {table.row_count?.toLocaleString() || 0} lignes
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>

      {/* Description de la table */}
      {table.description && (
        <div className="px-4 py-3 border-b border-border/20 bg-primary/5">
          <p className="text-sm text-muted-foreground">{table.description}</p>
        </div>
      )}

      {/* Tableau des colonnes */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[hsl(260_10%_10%)] border-b border-border/30">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colonne</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {table.columns.map((col, idx) => (
              <tr
                key={col.name}
                className={`hover:bg-primary/5 ${idx % 2 === 0 ? "bg-background/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-foreground">{col.name}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-muted-foreground uppercase text-[10px]">
                    {col.data_type.split("(")[0]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {col.description ? (
                    <span className="text-foreground/80">{col.description}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exemples de valeurs */}
      <div className="border-t border-border/30 p-3 bg-[hsl(260_10%_6%)]">
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Exemples de valeurs
        </h4>
        <div className="space-y-1 max-h-32 overflow-auto">
          {table.columns
            .filter((col) => col.sample_values)
            .slice(0, 5)
            .map((col) => (
              <div key={col.name} className="text-xs">
                <span className="font-mono text-primary/80">{col.name}:</span>{" "}
                <span className="text-muted-foreground">{col.sample_values}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

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

  // Charger le catalogue
  const loadCatalog = useCallback(async () => {
    const result = await api.fetchCatalog();
    if (result) {
      setCurrentCatalog(result.catalog);
    }
    setLoadingCatalog(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

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

  // Générer le catalogue (un seul bouton)
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setSelectedTable(null);
    toast.info("Génération du catalogue en cours...", {
      description: "Extraction + Enrichissement LLM",
    });

    // Démarrer le polling pour voir les mises à jour en temps réel
    pollingRef.current = setInterval(async () => {
      const result = await api.fetchCatalog();
      if (result) {
        setCurrentCatalog(result.catalog);
      }
    }, 2000);

    const result = await api.generateCatalog();

    // Arrêter le polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (result) {
      toast.success("Catalogue généré", {
        description: `${result.tables_count} tables, ${result.columns_count} colonnes`,
      });
      // Recharger une dernière fois
      await loadCatalog();
    } else {
      toast.error("Erreur lors de la génération");
    }

    setIsGenerating(false);
  }, [loadCatalog]);

  // Supprimer le catalogue
  const handleDelete = useCallback(async () => {
    if (!confirm("Voulez-vous vraiment supprimer le catalogue ?")) return;

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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Mettre à jour les actions du header
  useEffect(() => {
    const allTables = currentCatalog.flatMap((ds) => ds.tables);
    const hasContent = allTables.length > 0;

    setActions(
      <div className="flex items-center gap-2">
        {hasContent && (
          <Button
            onClick={handleDelete}
            disabled={isDeleting || isGenerating}
            variant="outline"
            size="sm"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
          >
            {isDeleting ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Suppression...
              </span>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Supprimer
              </>
            )}
          </Button>
        )}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || isDeleting}
          variant={hasContent ? "outline" : "default"}
          size="sm"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Génération...
            </span>
          ) : hasContent ? (
            "Régénérer"
          ) : (
            "Générer le catalogue"
          )}
        </Button>
      </div>
    );

    return () => setActions(null);
  }, [setActions, handleGenerate, handleDelete, isGenerating, isDeleting, currentCatalog]);

  // Mettre à jour React Flow quand le catalogue change
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

  // Compter les colonnes avec description
  const descriptionStats = useMemo(() => {
    const allCols = allCurrentTables.flatMap((t) => t.columns);
    const withDesc = allCols.filter((c) => c.description);
    return { total: allCols.length, withDesc: withDesc.length };
  }, [allCurrentTables]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(260_10%_6%)]">
      {/* Indicateur de génération en cours */}
      {isGenerating && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/30 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-primary">
            Génération en cours... Les tables apparaissent au fur et à mesure
          </span>
        </div>
      )}

      {/* React Flow Canvas */}
      {loadingCatalog ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
            <p className="text-muted-foreground">Chargement du catalogue...</p>
          </div>
        </div>
      ) : !hasContent ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Aucun catalogue</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Le catalogue de données n&apos;a pas encore été créé.
              <br />
              Cliquez sur le bouton ci-dessous pour extraire la structure de DuckDB
              <br />
              et générer les descriptions avec l&apos;IA.
            </p>
            <Button onClick={handleGenerate} disabled={isGenerating} size="lg">
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Génération...
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Générer le catalogue
                </>
              )}
            </Button>
          </div>
        </div>
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

            {/* Hint pour cliquer sur une table */}
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

      {/* Stats footer */}
      {hasContent && (
        <div className="px-4 py-2 border-t border-border/30 bg-[hsl(260_10%_8%)] flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{nodes.length}</span>
            <span>tables</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{descriptionStats.total}</span>
            <span>colonnes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {descriptionStats.withDesc}/{descriptionStats.total}
            </span>
            <span>avec description</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {allCurrentTables.reduce((acc, t) => acc + (t.row_count || 0), 0).toLocaleString()}
            </span>
            <span>lignes totales</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper avec ReactFlowProvider
export default function CatalogPage() {
  return (
    <ReactFlowProvider>
      <CatalogPageContent />
    </ReactFlowProvider>
  );
}
