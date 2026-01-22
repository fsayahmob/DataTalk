/**
 * ReactFlow-native architecture format
 * Directly consumable by ReactFlow with drag & lock support
 */

export interface NodeStyle {
  width?: number;
  height?: number;
  backgroundColor?: string;
  borderColor?: string;
  accentColor?: string;
}

export interface NodeData {
  label: string;
  type?: 'docker' | 'compose' | 'network';
  service?: string;
  status?: 'running' | 'stopped' | 'expected' | 'missing';
  ports?: string | null;
  image?: string;
  driver?: string;
  mountPath?: string;
  mode?: 'rw' | 'ro';
  usedBy?: string[];
  services?: number;
  containerCount?: number;
  _migration_note?: string;
}

export interface ArchitectureNode {
  id: string;
  type: 'groupNode' | 'container' | 'volume' | 'missing' | 'stopped';
  parentId?: string;
  extent?: 'parent';
  position: { x: number; y: number };
  data: NodeData;
  style?: NodeStyle;
}

export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
}

export interface EdgeLabelStyle {
  fontSize?: number;
  fill?: string;
  fontWeight?: number;
}

export interface EdgeData {
  protocol?: string;
  port?: number;
  mode?: 'rw' | 'ro';
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep' | 'default' | 'straight';
  label?: string;
  data?: EdgeData;
  style?: EdgeStyle;
  labelStyle?: EdgeLabelStyle;
  labelBgStyle?: { fill?: string; rx?: number };
  labelBgPadding?: [number, number];
}

export interface LegendNodeType {
  type: string;
  label: string;
  color: string;
}

export interface LegendEdgeType {
  type: string;
  label: string;
  style: 'solid' | 'dashed';
  color: string;
}

export interface Legend {
  nodeTypes: LegendNodeType[];
  edgeTypes: LegendEdgeType[];
  statusColors: {
    running: string;
    stopped: string;
    missing: string;
    expected: string;
  };
}

export interface LayoutConfig {
  padding: number;
  containerWidth: number;
  containerHeight: number;
  volumeHeight: number;
  headerHeight: number;
  innerPadding: number;
  projectGap: number;
  volumeGap: number;
}

export interface ReactFlowArchitecture {
  $schema?: string;
  _comment?: string;
  _version?: string;
  metadata?: {
    title?: string;
    lastUpdated?: string;
    author?: string;
  };
  layout?: LayoutConfig;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  legend?: Legend;
}

/**
 * Export current positions to ReactFlow JSON format
 */
export function exportToReactFlowJson(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  metadata?: ReactFlowArchitecture['metadata']
): ReactFlowArchitecture {
  return {
    $schema: './expected-architecture-reactflow.schema.json',
    _version: '2.0.0',
    metadata: {
      ...metadata,
      lastUpdated: new Date().toISOString().split('T')[0],
    },
    nodes: nodes.map(node => ({
      ...node,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    })),
    edges,
  };
}
