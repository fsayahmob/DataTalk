import { useState, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { theme, typography } from '../theme/colors.js';

/**
 * ConfigurationPage v3 - Simplified for flat topology
 *
 * Handles the new JSON format with service/datastore nodes
 * No position editing (dagre auto-layout handles it)
 */

interface NodeData {
  label: string;
  service?: string;
  volume?: string;
  image?: string;
  ports?: string[];
  mountPath?: string;
  status?: string;
  group?: string;
  icon?: string;
}

interface ArchNode {
  id: string;
  type: 'service' | 'datastore';
  data: NodeData;
}

interface EdgeData {
  protocol?: string;
  port?: number;
  type?: string;
  mode?: string;
}

interface ArchEdge {
  id: string;
  source: string;
  target: string;
  data?: EdgeData;
}

interface ArchGroup {
  id: string;
  label: string;
  type: string;
  network?: string;
}

interface Architecture {
  metadata?: { title?: string; lastUpdated?: string; author?: string };
  config?: { autoLayout?: boolean; layoutDirection?: string; nodeSpacing?: number; rankSpacing?: number };
  groups?: ArchGroup[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  legend?: unknown;
}

interface ConfigurationPageProps {
  architecture: Architecture;
  onSave: (architecture: Architecture) => void;
}

const iconOptions = ['web', 'api', 'memory', 'database', 'dashboard', 'storage', 'analytics', 'cached'];

export function ConfigurationPage({ architecture, onSave }: ConfigurationPageProps) {
  const [nodes, setNodes] = useState<ArchNode[]>(architecture.nodes || []);
  const [edges, setEdges] = useState<ArchEdge[]>(architecture.edges || []);
  const [groups, setGroups] = useState<ArchGroup[]>(architecture.groups || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'edges' | 'groups'>('nodes');

  // Selected items
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId), [edges, selectedEdgeId]);

  // Group nodes by group
  const nodesByGroup = useMemo(() => {
    const map = new Map<string, ArchNode[]>();
    map.set('', []); // ungrouped
    for (const node of nodes) {
      const group = node.data.group || '';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(node);
    }
    return map;
  }, [nodes]);

  // Update functions
  const updateNode = (id: string, field: keyof NodeData | 'type', value: string | string[]) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== id) return n;
      if (field === 'type') {
        return { ...n, type: value as 'service' | 'datastore' };
      }
      return { ...n, data: { ...n.data, [field]: value } };
    }));
    setHasChanges(true);
  };

  const updateEdge = (id: string, field: keyof EdgeData, value: string | number) => {
    setEdges(prev => prev.map(e => {
      if (e.id !== id) return e;
      return { ...e, data: { ...e.data, [field]: value } };
    }));
    setHasChanges(true);
  };

  const addNode = () => {
    const id = `node-${Date.now()}`;
    const newNode: ArchNode = {
      id,
      type: 'service',
      data: {
        label: 'New Service',
        service: 'new-service',
        status: 'expected',
        group: groups[0]?.id || '',
        icon: 'api',
      },
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
    setHasChanges(true);
  };

  const addDatastore = () => {
    const id = `datastore-${Date.now()}`;
    const newNode: ArchNode = {
      id,
      type: 'datastore',
      data: {
        label: 'New Datastore',
        volume: 'new-volume',
        mountPath: '/data',
        group: groups[0]?.id || '',
        icon: 'storage',
      },
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
    setHasChanges(true);
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    setHasChanges(true);
  };

  const addEdge = () => {
    if (nodes.length < 2) return;
    const id = `edge-${Date.now()}`;
    const newEdge: ArchEdge = {
      id,
      source: nodes[0].id,
      target: nodes[1].id,
      data: { protocol: 'HTTP', port: 8000 },
    };
    setEdges(prev => [...prev, newEdge]);
    setSelectedEdgeId(id);
    setActiveTab('edges');
    setHasChanges(true);
  };

  const deleteEdge = (id: string) => {
    setEdges(prev => prev.filter(e => e.id !== id));
    if (selectedEdgeId === id) setSelectedEdgeId(null);
    setHasChanges(true);
  };

  const addGroup = () => {
    const id = `group-${Date.now()}`;
    const newGroup: ArchGroup = { id, label: 'new-project', type: 'compose' };
    setGroups(prev => [...prev, newGroup]);
    setHasChanges(true);
  };

  const deleteGroup = (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    // Remove group from nodes
    setNodes(prev => prev.map(n => n.data.group === id ? { ...n, data: { ...n.data, group: '' } } : n));
    setHasChanges(true);
  };

  const handleSave = () => {
    const newArch: Architecture = {
      ...architecture,
      metadata: { ...architecture.metadata, lastUpdated: new Date().toISOString().split('T')[0] },
      groups,
      nodes,
      edges,
    };
    onSave(newArch);
    setHasChanges(false);

    // Download JSON
    const blob = new Blob([JSON.stringify(newArch, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expected-architecture-reactflow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.background, fontFamily: typography.fontFamily }}>
      {/* Header */}
      <header style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ color: theme.primary, textDecoration: 'none', fontSize: 14 }}>← Dashboard</Link>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>Configuration</h1>
          {hasChanges && <span style={{ fontSize: 12, color: theme.warning, background: theme.warningLight, padding: '2px 8px', borderRadius: 4 }}>Unsaved</span>}
        </div>
        <button onClick={handleSave} disabled={!hasChanges}
          style={{ padding: '8px 20px', background: hasChanges ? theme.primary : theme.surfaceVariant, color: hasChanges ? '#fff' : theme.textSecondary, border: 'none', borderRadius: 6, cursor: hasChanges ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
          Save & Download
        </button>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 65px)' }}>
        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
            {(['nodes', 'edges', 'groups'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '10px 20px', background: activeTab === tab ? theme.surface : 'transparent', border: `1px solid ${theme.border}`, borderBottom: activeTab === tab ? 'none' : `1px solid ${theme.border}`, borderRadius: activeTab === tab ? '8px 8px 0 0' : 0, cursor: 'pointer', color: activeTab === tab ? theme.primary : theme.textSecondary, fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize' }}>
                {tab} ({tab === 'nodes' ? nodes.length : tab === 'edges' ? edges.length : groups.length})
              </button>
            ))}
          </div>

          {/* Nodes Tab */}
          {activeTab === 'nodes' && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '0 8px 8px 8px', overflow: 'hidden' }}>
              {/* Actions */}
              <div style={{ padding: 16, borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: 8 }}>
                <button onClick={addNode} style={{ padding: '6px 12px', background: theme.primaryLight, color: theme.primary, border: `1px solid ${theme.primary}`, borderRadius: 4, cursor: 'pointer' }}>+ Service</button>
                <button onClick={addDatastore} style={{ padding: '6px 12px', background: theme.warningLight, color: theme.warning, border: `1px solid ${theme.warning}`, borderRadius: 4, cursor: 'pointer' }}>+ Datastore</button>
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.background }}>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>TYPE</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>LABEL</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>SERVICE/VOLUME</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>GROUP</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>ICON</th>
                    <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: theme.textSecondary }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(nodesByGroup.entries()).map(([group, groupNodes]) => (
                    <Fragment key={`section-${group || 'ungrouped'}`}>
                      {group && (
                        <tr style={{ background: theme.surfaceVariant }}>
                          <td colSpan={6} style={{ padding: '8px 12px', fontWeight: 600, color: theme.textSecondary }}>
                            📦 {groups.find(g => g.id === group)?.label || group}
                          </td>
                        </tr>
                      )}
                      {groupNodes.map(node => (
                        <tr key={node.id} onClick={() => setSelectedNodeId(node.id)}
                          style={{ background: selectedNodeId === node.id ? theme.primaryLight : theme.surface, cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: node.type === 'service' ? theme.primaryLight : theme.warningLight, color: node.type === 'service' ? theme.primary : theme.warning }}>
                              {node.type}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 500, color: theme.textPrimary }}>{node.data.label}</td>
                          <td style={{ padding: '10px 12px', color: theme.textSecondary, fontFamily: 'monospace', fontSize: 12 }}>{node.data.service || node.data.volume || '-'}</td>
                          <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{node.data.group || '-'}</td>
                          <td style={{ padding: '10px 12px' }}>{node.data.icon || '-'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <button onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                              style={{ padding: '4px 8px', background: 'transparent', color: theme.error, border: 'none', cursor: 'pointer' }}>
                              🗑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Edges Tab */}
          {activeTab === 'edges' && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '0 8px 8px 8px', overflow: 'hidden' }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${theme.border}` }}>
                <button onClick={addEdge} style={{ padding: '6px 12px', background: theme.successLight, color: theme.success, border: `1px solid ${theme.success}`, borderRadius: 4, cursor: 'pointer' }}>+ Connection</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.background }}>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>SOURCE</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>TARGET</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>PROTOCOL</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>PORT</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>TYPE</th>
                    <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: theme.textSecondary }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map(edge => {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    return (
                      <tr key={edge.id} onClick={() => setSelectedEdgeId(edge.id)}
                        style={{ background: selectedEdgeId === edge.id ? theme.primaryLight : theme.surface, cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '10px 12px', color: theme.textPrimary }}>{sourceNode?.data.label || edge.source}</td>
                        <td style={{ padding: '10px 12px', color: theme.textPrimary }}>{targetNode?.data.label || edge.target}</td>
                        <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{edge.data?.protocol || '-'}</td>
                        <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{edge.data?.port || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, background: edge.data?.type === 'volume' ? theme.warningLight : theme.successLight, color: edge.data?.type === 'volume' ? theme.warning : theme.success }}>
                            {edge.data?.type || 'network'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); deleteEdge(edge.id); }}
                            style={{ padding: '4px 8px', background: 'transparent', color: theme.error, border: 'none', cursor: 'pointer' }}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Groups Tab */}
          {activeTab === 'groups' && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '0 8px 8px 8px', overflow: 'hidden' }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${theme.border}` }}>
                <button onClick={addGroup} style={{ padding: '6px 12px', background: theme.primaryLight, color: theme.primary, border: `1px solid ${theme.primary}`, borderRadius: 4, cursor: 'pointer' }}>+ Compose Project</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.background }}>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>ID</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>LABEL</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>NETWORK</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: theme.textSecondary }}>SERVICES</th>
                    <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: theme.textSecondary }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => {
                    const count = nodes.filter(n => n.data.group === group.id).length;
                    return (
                      <tr key={group.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: theme.textSecondary }}>{group.id}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: theme.textPrimary }}>{group.label}</td>
                        <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{group.network || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: theme.surfaceVariant, color: theme.textSecondary }}>{count}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button onClick={() => deleteGroup(group.id)}
                            style={{ padding: '4px 8px', background: 'transparent', color: theme.error, border: 'none', cursor: 'pointer' }}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ width: 320, background: theme.surface, borderLeft: `1px solid ${theme.border}`, overflow: 'auto' }}>
          {selectedNode && activeTab === 'nodes' && (
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary, marginBottom: 16 }}>Edit Node</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>TYPE</label>
                <select value={selectedNode.type} onChange={e => updateNode(selectedNode.id, 'type', e.target.value)}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  <option value="service">service</option>
                  <option value="datastore">datastore</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>LABEL</label>
                <input type="text" value={selectedNode.data.label} onChange={e => updateNode(selectedNode.id, 'label', e.target.value)}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }} />
              </div>

              {selectedNode.type === 'service' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>SERVICE NAME (Docker)</label>
                    <input type="text" value={selectedNode.data.service || ''} onChange={e => updateNode(selectedNode.id, 'service', e.target.value)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>IMAGE</label>
                    <input type="text" value={selectedNode.data.image || ''} onChange={e => updateNode(selectedNode.id, 'image', e.target.value)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>PORTS (comma-separated)</label>
                    <input type="text" value={(selectedNode.data.ports || []).join(', ')} onChange={e => updateNode(selectedNode.id, 'ports', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: 'monospace' }} />
                  </div>
                </>
              )}

              {selectedNode.type === 'datastore' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>VOLUME NAME</label>
                    <input type="text" value={selectedNode.data.volume || ''} onChange={e => updateNode(selectedNode.id, 'volume', e.target.value)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>MOUNT PATH</label>
                    <input type="text" value={selectedNode.data.mountPath || ''} onChange={e => updateNode(selectedNode.id, 'mountPath', e.target.value)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: 'monospace' }} />
                  </div>
                </>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>GROUP</label>
                <select value={selectedNode.data.group || ''} onChange={e => updateNode(selectedNode.id, 'group', e.target.value)}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  <option value="">No group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>ICON</label>
                <select value={selectedNode.data.icon || ''} onChange={e => updateNode(selectedNode.id, 'icon', e.target.value)}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  {iconOptions.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                </select>
              </div>
            </div>
          )}

          {selectedEdge && activeTab === 'edges' && (
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary, marginBottom: 16 }}>Edit Connection</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>SOURCE</label>
                <select value={selectedEdge.source} onChange={e => { setEdges(prev => prev.map(ed => ed.id === selectedEdge.id ? { ...ed, source: e.target.value } : ed)); setHasChanges(true); }}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.data.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>TARGET</label>
                <select value={selectedEdge.target} onChange={e => { setEdges(prev => prev.map(ed => ed.id === selectedEdge.id ? { ...ed, target: e.target.value } : ed)); setHasChanges(true); }}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.data.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>TYPE</label>
                <select value={selectedEdge.data?.type || 'network'} onChange={e => updateEdge(selectedEdge.id, 'type', e.target.value)}
                  style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                  <option value="network">network</option>
                  <option value="volume">volume</option>
                </select>
              </div>

              {selectedEdge.data?.type !== 'volume' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>PROTOCOL</label>
                    <input type="text" value={selectedEdge.data?.protocol || ''} onChange={e => updateEdge(selectedEdge.id, 'protocol', e.target.value)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>PORT</label>
                    <input type="number" value={selectedEdge.data?.port || ''} onChange={e => updateEdge(selectedEdge.id, 'port', parseInt(e.target.value) || 0)}
                      style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }} />
                  </div>
                </>
              )}

              {selectedEdge.data?.type === 'volume' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>MODE</label>
                  <select value={selectedEdge.data?.mode || 'rw'} onChange={e => updateEdge(selectedEdge.id, 'mode', e.target.value)}
                    style={{ width: '100%', padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                    <option value="rw">Read/Write (rw)</option>
                    <option value="ro">Read Only (ro)</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {!selectedNode && !selectedEdge && (
            <div style={{ padding: 40, textAlign: 'center', color: theme.textSecondary }}>
              <p>Select an item to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
