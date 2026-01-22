import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface DatastoreNodeData extends Record<string, unknown> {
  label: string;
  service?: string;
  volume?: string;
  image?: string;
  mountPath?: string;
  status?: 'running' | 'stopped' | 'missing' | 'expected';
  group?: string;
  icon?: string;
}

type DatastoreNodeType = Node<DatastoreNodeData, 'datastore'>;

const iconMap: Record<string, string> = {
  database: '🗄️',
  storage: '💾',
  analytics: '📊',
  cached: '📦',
};

const statusColors = {
  running: theme.success,
  stopped: theme.warning,
  missing: theme.error,
  expected: theme.textSecondary,
};

function DatastoreNodeComponent({ data, selected }: NodeProps<DatastoreNodeType>) {
  const nodeData = data as DatastoreNodeData;
  const icon = nodeData.icon ? iconMap[nodeData.icon] || '💾' : '💾';
  const status = nodeData.status || 'expected';
  const statusColor = statusColors[status];
  const isVolume = !!nodeData.volume;

  return (
    <div
      style={{
        background: theme.surface,
        borderRadius: 8,
        border: `1px solid ${selected ? theme.primary : theme.border}`,
        boxShadow: selected
          ? `0 0 0 2px ${theme.primary}20`
          : '0 1px 3px rgba(0,0,0,0.08)',
        padding: '12px 16px',
        minWidth: 140,
        fontFamily: typography.fontFamily,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Cylinder shape indicator for datastores */}
      <div
        style={{
          position: 'absolute',
          top: -4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '70%',
          height: 8,
          background: isVolume ? theme.surfaceVariant : statusColor,
          borderRadius: '50%',
          opacity: isVolume ? 0.6 : 0.3,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div
          style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: theme.textPrimary,
          }}
        >
          {nodeData.label}
        </div>
      </div>

      {/* Compose Project Badge */}
      {nodeData.group && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 6,
            padding: '2px 6px',
            background: theme.surfaceVariant,
            borderRadius: 4,
            fontSize: 10,
            color: theme.textSecondary,
          }}
        >
          <span style={{ fontSize: 8 }}>📦</span>
          {nodeData.group}
        </div>
      )}

      {/* Service info (for running containers like Redis) */}
      {nodeData.service && (
        <div
          style={{
            fontSize: typography.fontSize.xs,
            color: statusColor,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 8 }}>●</span>
          {nodeData.service}
        </div>
      )}

      {/* Volume info */}
      {nodeData.volume && (
        <div
          style={{
            fontSize: typography.fontSize.xs,
            color: theme.primary,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: nodeData.service ? 4 : 0,
          }}
        >
          <span style={{ fontSize: 10 }}>💾</span>
          {nodeData.volume}
        </div>
      )}

      {/* Mount path */}
      {nodeData.mountPath && (
        <div
          style={{
            fontSize: typography.fontSize.xs,
            color: theme.textSecondary,
            fontFamily: 'monospace',
            marginTop: 4,
          }}
        >
          {nodeData.mountPath}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.border,
          border: 'none',
          width: 8,
          height: 8,
          top: 4,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: theme.border,
          border: 'none',
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}

export const DatastoreNode = memo(DatastoreNodeComponent);
