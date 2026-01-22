import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import { useInfraData } from '../hooks/useInfraData.js';
import { ServiceNode } from './nodes/ServiceNode.js';
import { DatastoreNode } from './nodes/DatastoreNode.js';
import { theme, typography } from '../theme/colors.js';

/**
 * InfraDashboard v3 - GCP-style flat topology with auto-layout
 *
 * Features:
 * - Dagre auto-layout
 * - Flat hierarchy (no nested groups)
 * - Service/Datastore node types
 * - Real-time status from Docker API
 */

interface ArchitectureNode {
  id: string;
  type: 'service' | 'datastore';
  data: {
    label: string;
    service?: string;
    volume?: string;
    image?: string;
    ports?: string[];
    mountPath?: string;
    status?: string;
    group?: string;
    icon?: string;
  };
}

interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    protocol?: string;
    port?: number;
    type?: string;
    mode?: string;
  };
}

interface ArchitectureGroup {
  id: string;
  label: string;
  type: string;
  network?: string;
}

interface Architecture {
  metadata?: { title?: string };
  config?: {
    autoLayout?: boolean;
    layoutDirection?: string;
    nodeSpacing?: number;
    rankSpacing?: number;
  };
  groups?: ArchitectureGroup[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  legend?: {
    statusColors?: Record<string, string>;
  };
}

interface InfraDashboardProps {
  architecture: Architecture;
}

const SIDEBAR_WIDTH = 280;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 90;

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  datastore: DatastoreNode,
};

// Dagre layout helper - two-pass layout to keep services together
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: string = 'TB',
  nodeSpacing: number = 80,
  rankSpacing: number = 120
): { nodes: Node[]; edges: Edge[] } {
  // Separate services and datastores
  const serviceNodes = nodes.filter((n) => n.type === 'service');
  const datastoreNodes = nodes.filter((n) => n.type === 'datastore');
  const serviceIds = new Set(serviceNodes.map((n) => n.id));

  // First pass: layout services only (service-to-service edges)
  const serviceGraph = new dagre.graphlib.Graph();
  serviceGraph.setDefaultEdgeLabel(() => ({}));
  serviceGraph.setGraph({ rankdir: direction, nodesep: nodeSpacing, ranksep: rankSpacing });

  serviceNodes.forEach((node) => {
    serviceGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Only add edges between services
  edges.forEach((edge) => {
    if (serviceIds.has(edge.source) && serviceIds.has(edge.target)) {
      serviceGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(serviceGraph);

  // Get service positions and find the bottom-most Y
  let maxServiceY = 0;
  const servicePositions = new Map<string, { x: number; y: number }>();
  serviceNodes.forEach((node) => {
    const pos = serviceGraph.node(node.id);
    servicePositions.set(node.id, { x: pos.x, y: pos.y });
    maxServiceY = Math.max(maxServiceY, pos.y);
  });

  // Second pass: layout datastores below services
  const datastoreGraph = new dagre.graphlib.Graph();
  datastoreGraph.setDefaultEdgeLabel(() => ({}));
  datastoreGraph.setGraph({ rankdir: direction, nodesep: nodeSpacing, ranksep: rankSpacing });

  datastoreNodes.forEach((node) => {
    datastoreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges between datastores (if any)
  const datastoreIds = new Set(datastoreNodes.map((n) => n.id));
  edges.forEach((edge) => {
    if (datastoreIds.has(edge.source) && datastoreIds.has(edge.target)) {
      datastoreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(datastoreGraph);

  // Position datastores below services
  const datastoreOffset = maxServiceY + rankSpacing + NODE_HEIGHT;

  // Combine positions
  const layoutedNodes = nodes.map((node) => {
    if (node.type === 'service') {
      const pos = servicePositions.get(node.id)!;
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    } else {
      const pos = datastoreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2 + datastoreOffset,
        },
      };
    }
  });

  return { nodes: layoutedNodes, edges };
}

interface PortScanResult {
  port: number;
  listening: boolean;
  process?: {
    port: number;
    pid: number;
    command: string;
    runtime: 'docker' | 'process' | 'systemd' | 'unknown';
    name?: string;
  };
}

export function InfraDashboard({ architecture }: InfraDashboardProps) {
  const { data: dockerData, stats, loading, error, refresh, lastUpdate, autoRefresh, setAutoRefresh } = useInfraData();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [portData, setPortData] = useState<PortScanResult[]>([]);

  // Fetch port scan data
  useEffect(() => {
    const fetchPorts = async () => {
      try {
        // Extract ports from architecture
        const portsToScan = architecture.nodes
          .flatMap((n) => n.data.ports || [])
          .map((p) => parseInt(p.split(':')[0], 10))
          .filter((p) => !isNaN(p));

        if (portsToScan.length === 0) return;

        const response = await fetch(`/api/ports?ports=${portsToScan.join(',')}`);
        if (response.ok) {
          const data = await response.json();
          setPortData(data.ports || []);
        }
      } catch {
        // Silently fail - port detection is optional
      }
    };

    fetchPorts();
    const interval = setInterval(fetchPorts, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [architecture.nodes]);

  // Build container status map from Docker API
  const dockerContainers = useMemo(() => {
    if (!dockerData?.containers) return [];
    return dockerData.containers.map((container) => {
      const stat = stats.find((s) => s.name === container.name);
      return {
        name: container.name,
        status: container.status,
        cpu: stat?.cpu ?? container.resources?.cpu_percent,
        memory: stat?.memory_mb ?? container.resources?.memory_mb,
        // Docker compose info from labels
        composeProject: container.compose?.project || null,
        composeService: container.compose?.service || null,
      };
    });
  }, [dockerData, stats]);

  // Find matching Docker container
  const findDockerContainer = useCallback(
    (serviceName: string | undefined) => {
      if (!serviceName) return null;
      const nameLower = serviceName.toLowerCase();

      // Exact match
      let match = dockerContainers.find((c) => c.name.toLowerCase() === nameLower);
      if (match) return match;

      // Partial match
      match = dockerContainers.find((c) => {
        const cName = c.name.toLowerCase();
        return cName.includes(nameLower) || nameLower.includes(cName);
      });
      if (match) return match;

      // Keyword match - require the service type (last keyword) to match
      // This prevents "datatalk-worker" from matching "datatalk-api"
      const parts = nameLower.split(/[-_]/);
      const serviceType = parts[parts.length - 1]; // e.g., "worker", "api", "redis"

      match = dockerContainers.find((c) => {
        const cParts = c.name.toLowerCase().split(/[-_]/);
        const cServiceType = cParts[cParts.length - 1];
        // Service type must match, plus at least one other keyword
        return serviceType === cServiceType &&
               parts.slice(0, -1).some((p) => p.length > 3 && cParts.includes(p));
      });
      return match;
    },
    [dockerContainers]
  );

  // Find port process info for a service
  const findPortProcess = useCallback(
    (ports: string[] | undefined) => {
      if (!ports || ports.length === 0) return null;
      const port = parseInt(ports[0].split(':')[0], 10);
      if (isNaN(port)) return null;
      return portData.find((p) => p.port === port && p.listening);
    },
    [portData]
  );

  // Process nodes with Docker status and runtime detection
  const processedNodes = useMemo((): Node[] => {
    return architecture.nodes.map((node) => {
      const dockerMatch = findDockerContainer(node.data.service);
      const portProcess = findPortProcess(node.data.ports);

      let status: 'running' | 'stopped' | 'missing' | 'expected' = 'expected';
      let cpu: number | undefined;
      let memory: number | undefined;
      let runtime: 'docker' | 'process' | 'systemd' | 'unknown' | null = null;

      if (node.data.service) {
        // It's a container node
        if (dockerMatch) {
          const statusLower = dockerMatch.status.toLowerCase();
          if (statusLower.includes('up') || statusLower.includes('running')) {
            status = 'running';
            runtime = 'docker';
          } else {
            status = 'stopped';
          }
          cpu = dockerMatch.cpu;
          memory = dockerMatch.memory;
        } else if (portProcess?.listening) {
          // Not in Docker, but something is listening on the port
          status = 'running';
          runtime = portProcess.process?.runtime || 'process';
        } else {
          status = 'missing';
        }
      } else if (node.data.volume) {
        // It's a volume node - check if any container using it is running
        const connectedContainers = architecture.edges
          .filter((e) => e.target === node.id)
          .map((e) => architecture.nodes.find((n) => n.id === e.source))
          .filter(Boolean);

        const anyRunning = connectedContainers.some((cn) => {
          const dm = findDockerContainer(cn?.data.service);
          return dm && (dm.status.toLowerCase().includes('up') || dm.status.toLowerCase().includes('running'));
        });
        status = anyRunning ? 'running' : 'expected';
      }

      return {
        id: node.id,
        type: node.type,
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          ...node.data,
          status,
          cpu,
          memory,
          // Runtime type: docker, process, systemd, or null if not running
          runtime,
          // Real Docker compose info (overrides JSON config if container is running)
          dockerProject: dockerMatch?.composeProject || null,
          dockerService: dockerMatch?.composeService || null,
        },
      };
    });
  }, [architecture.nodes, architecture.edges, findDockerContainer, findPortProcess]);

  // Process edges with health status
  const processedEdges = useMemo((): Edge[] => {
    return architecture.edges.map((edge) => {
      const sourceNode = processedNodes.find((n) => n.id === edge.source);
      const targetNode = processedNodes.find((n) => n.id === edge.target);

      const sourceStatus = (sourceNode?.data as { status?: string })?.status || 'expected';
      const targetStatus = (targetNode?.data as { status?: string })?.status || 'expected';

      let color: string = theme.success;
      let opacity = 1;
      let animated = false;

      if (sourceStatus === 'missing' || targetStatus === 'missing') {
        color = theme.error;
        opacity = 0.5;
      } else if (sourceStatus === 'stopped' || targetStatus === 'stopped') {
        color = theme.warning;
        opacity = 0.7;
      } else if (sourceStatus === 'running' && targetStatus === 'running') {
        animated = true;
      }

      const isVolume = edge.data?.type === 'volume';
      const label = isVolume
        ? `${edge.data?.mode || 'rw'}`
        : edge.data?.protocol
        ? `${edge.data.protocol}${edge.data.port ? `:${edge.data.port}` : ''}`
        : '';

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated,
        label,
        labelStyle: { fontSize: 10, fill: theme.textSecondary },
        labelBgStyle: { fill: theme.surface, fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isVolume ? '5,5' : undefined,
          opacity,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 15,
          height: 15,
        },
      };
    });
  }, [architecture.edges, processedNodes]);

  // Apply dagre layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    const config = architecture.config || {};
    return getLayoutedElements(
      processedNodes,
      processedEdges,
      config.layoutDirection || 'TB',
      config.nodeSpacing || 80,
      config.rankSpacing || 120
    );
  }, [processedNodes, processedEdges, architecture.config]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync with processed data
  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  // Calculate stats
  const stats_summary = useMemo(() => {
    const running: string[] = [];
    const stopped: string[] = [];
    const missing: string[] = [];

    for (const node of processedNodes) {
      const status = (node.data as { status?: string; label?: string }).status;
      const label = (node.data as { label?: string }).label || node.id;
      if (status === 'running') running.push(label);
      else if (status === 'stopped') stopped.push(label);
      else if (status === 'missing') missing.push(label);
    }

    const healthy = processedEdges.filter((e) => e.animated).length;
    const broken = processedEdges.filter((e) => (e.style as { opacity?: number })?.opacity === 0.5).length;
    const degraded = processedEdges.length - healthy - broken;

    return { running, stopped, missing, edges: { healthy, degraded, broken, total: processedEdges.length } };
  }, [processedNodes, processedEdges]);

  // Get unique groups
  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    architecture.nodes.forEach((n) => {
      if (n.data.group) groupSet.add(n.data.group);
    });
    return Array.from(groupSet);
  }, [architecture.nodes]);

  if (loading && !dockerData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: theme.background }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${theme.borderLight}`, borderTop: `3px solid ${theme.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: theme.textSecondary }}>Connecting to Docker...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: theme.background }}>
        <div style={{ background: theme.errorLight, border: `1px solid ${theme.error}`, borderRadius: 8, padding: 24, maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Docker Connection Error</div>
          <div style={{ color: theme.textSecondary, marginBottom: 16 }}>{error}</div>
          <button onClick={refresh} style={{ padding: '8px 24px', background: theme.primary, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: theme.background, fontFamily: typography.fontFamily }}>
      {/* Sidebar */}
      <div style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH, height: '100vh', background: theme.surface, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: theme.textPrimary }}>{architecture.metadata?.title || 'Infrastructure'}</div>
          <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>Real-time topology</div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Overall Status */}
          <Section title="Status">
            {stats_summary.missing.length === 0 && stats_summary.stopped.length === 0 ? (
              <StatusBanner status="healthy" label="All systems operational" count={stats_summary.running.length} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats_summary.running.length > 0 && <StatusRow status="running" label="Running" count={stats_summary.running.length} />}
                {stats_summary.stopped.length > 0 && <StatusRow status="stopped" label="Stopped" count={stats_summary.stopped.length} items={stats_summary.stopped} />}
                {stats_summary.missing.length > 0 && <StatusRow status="missing" label="Missing" count={stats_summary.missing.length} items={stats_summary.missing} />}
              </div>
            )}
          </Section>

          {/* Connections */}
          <Section title={`Connections (${stats_summary.edges.total})`}>
            <div style={{ display: 'flex', gap: 12 }}>
              <MetricPill color={theme.success} value={stats_summary.edges.healthy} label="OK" />
              <MetricPill color={theme.warning} value={stats_summary.edges.degraded} label="Warn" />
              <MetricPill color={theme.error} value={stats_summary.edges.broken} label="Err" />
            </div>
          </Section>

          {/* Groups */}
          <Section title="Compose Projects">
            {groups.map((g) => {
              const groupNodes = processedNodes.filter((n) => (n.data as { group?: string }).group === g);
              const running = groupNodes.filter((n) => (n.data as { status?: string }).status === 'running').length;
              return (
                <div
                  key={g}
                  style={{
                    padding: '10px 12px',
                    background: hoveredGroup === g ? theme.surfaceVariant : 'transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    marginBottom: 4,
                  }}
                  onMouseEnter={() => setHoveredGroup(g)}
                  onMouseLeave={() => setHoveredGroup(null)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, color: theme.textPrimary }}>{g}</span>
                    <span style={{ fontSize: 12, color: theme.textSecondary }}>{running}/{groupNodes.length}</span>
                  </div>
                </div>
              );
            })}
          </Section>

          {/* Docker Info */}
          {dockerData?.docker_engine && (
            <Section title="Docker Engine">
              <div style={{ fontSize: 12, color: theme.textSecondary }}>
                <div>v{dockerData.docker_engine.version}</div>
                <div>{dockerData.docker_engine.os}/{dockerData.docker_engine.arch}</div>
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/config" style={{ fontSize: 12, color: theme.primary, textDecoration: 'none' }}>Configure</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                background: autoRefresh ? theme.successLight : theme.surfaceVariant,
                color: autoRefresh ? theme.success : theme.textSecondary,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button onClick={refresh} style={{ padding: '4px 8px', fontSize: 11, background: theme.surfaceVariant, border: 'none', borderRadius: 4, cursor: 'pointer', color: theme.textSecondary }}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div style={{ flex: 1, height: '100vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={theme.border} gap={20} size={1} />
          <Controls position="bottom-right" style={{ background: theme.surface, borderRadius: 8, border: `1px solid ${theme.border}` }} />
          <MiniMap
            position="bottom-left"
            style={{ background: theme.surface, borderRadius: 8, border: `1px solid ${theme.border}` }}
            nodeColor={(node) => {
              const status = (node.data as { status?: string })?.status;
              if (status === 'running') return theme.success;
              if (status === 'stopped') return theme.warning;
              if (status === 'missing') return theme.error;
              return theme.textSecondary;
            }}
          />

          {/* Last update indicator */}
          {lastUpdate && (
            <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 11, color: theme.textSecondary, background: theme.surface, padding: '4px 8px', borderRadius: 4, border: `1px solid ${theme.border}` }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

// Helper Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusBanner({ status, label, count }: { status: string; label: string; count: number }) {
  const colors = { healthy: theme.success, warning: theme.warning, error: theme.error };
  const color = colors[status as keyof typeof colors] || theme.success;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${color}10`, borderRadius: 8, border: `1px solid ${color}30` }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 14, fontWeight: 500, color }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: theme.textSecondary }}>{count} services</span>
    </div>
  );
}

function StatusRow({ status, label, count, items }: { status: string; label: string; count: number; items?: string[] }) {
  const colors = { running: theme.success, stopped: theme.warning, missing: theme.error };
  const color = colors[status as keyof typeof colors] || theme.textSecondary;
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        onClick={() => items && setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: `${color}10`, borderRadius: 6, cursor: items ? 'pointer' : 'default' }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 13, color }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color }}>{count}</span>
        {items && <span style={{ fontSize: 10, color: theme.textSecondary }}>{expanded ? '▼' : '▶'}</span>}
      </div>
      {expanded && items && (
        <div style={{ paddingLeft: 26, paddingTop: 4 }}>
          {items.map((item) => (
            <div key={item} style={{ fontSize: 11, color: theme.textSecondary, padding: '2px 0' }}>{item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricPill({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: `${color}15`, borderRadius: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color }}>{value}</span>
      <span style={{ fontSize: 11, color: theme.textSecondary }}>{label}</span>
    </div>
  );
}
