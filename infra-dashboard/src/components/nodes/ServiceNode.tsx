import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  service?: string;
  image?: string;
  ports?: string[];
  status: 'running' | 'stopped' | 'missing' | 'expected';
  group?: string;
  icon?: string;
  cpu?: number;
  memory?: number;
  // Runtime detection
  runtime?: 'docker' | 'process' | 'systemd' | 'unknown' | null;
  // Real Docker info
  dockerProject?: string | null;
  dockerService?: string | null;
}

// Runtime badge configuration
const runtimeConfig: Record<string, { icon: string; label: string; color: string }> = {
  docker: { icon: '🐳', label: 'Docker', color: '#2496ED' },
  process: { icon: '💻', label: 'Local', color: '#4CAF50' },
  systemd: { icon: '⚙️', label: 'Systemd', color: '#FF9800' },
  unknown: { icon: '❓', label: 'Unknown', color: '#9E9E9E' },
};

type ServiceNodeType = Node<ServiceNodeData, 'service'>;

const statusConfig = {
  running: { color: theme.success, label: 'Running', dot: '●' },
  stopped: { color: theme.warning, label: 'Stopped', dot: '●' },
  missing: { color: theme.error, label: 'Missing', dot: '○' },
  expected: { color: theme.textSecondary, label: 'Expected', dot: '○' },
};

const iconMap: Record<string, string> = {
  web: '🌐',
  api: '⚡',
  memory: '⚙️',
  database: '🗄️',
  dashboard: '📊',
  storage: '💾',
  analytics: '📈',
  cached: '📦',
};

function ServiceNodeComponent({ data, selected }: NodeProps<ServiceNodeType>) {
  const nodeData = data as ServiceNodeData;
  const status = statusConfig[nodeData.status] || statusConfig.expected;
  const icon = nodeData.icon ? iconMap[nodeData.icon] || '📦' : '📦';

  return (
    <div
      style={{
        background: theme.surface,
        borderRadius: 8,
        border: `1px solid ${selected ? theme.primary : theme.border}`,
        boxShadow: selected
          ? `0 0 0 2px ${theme.primary}20`
          : '0 1px 3px rgba(0,0,0,0.08)',
        padding: 0,
        minWidth: 180,
        fontFamily: typography.fontFamily,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.surfaceVariant,
          borderRadius: '8px 8px 0 0',
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: theme.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {nodeData.label}
          </div>
          {nodeData.service && (
            <div
              style={{
                fontSize: typography.fontSize.xs,
                color: theme.textSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nodeData.service}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px' }}>
        {/* Runtime Badge - shows where the service is running */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {/* Runtime type badge */}
          {nodeData.runtime && runtimeConfig[nodeData.runtime] && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                background: `${runtimeConfig[nodeData.runtime].color}15`,
                borderRadius: 4,
                fontSize: typography.fontSize.xs,
                color: runtimeConfig[nodeData.runtime].color,
                border: `1px solid ${runtimeConfig[nodeData.runtime].color}30`,
              }}
            >
              <span style={{ fontSize: 10 }}>{runtimeConfig[nodeData.runtime].icon}</span>
              {runtimeConfig[nodeData.runtime].label}
            </div>
          )}

          {/* Compose project badge (only if Docker and has project) */}
          {nodeData.runtime === 'docker' && nodeData.dockerProject && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                background: theme.surfaceVariant,
                borderRadius: 4,
                fontSize: typography.fontSize.xs,
                color: theme.textSecondary,
              }}
            >
              <span style={{ fontSize: 10 }}>📦</span>
              {nodeData.dockerProject}
            </div>
          )}

          {/* Group badge (when not running or no runtime detected) */}
          {!nodeData.runtime && nodeData.group && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                background: theme.surfaceVariant,
                borderRadius: 4,
                fontSize: typography.fontSize.xs,
                color: theme.textSecondary,
              }}
            >
              <span style={{ fontSize: 10 }}>📦</span>
              {nodeData.group}
            </div>
          )}
        </div>

        {/* Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: nodeData.ports?.length ? 8 : 0,
          }}
        >
          <span style={{ color: status.color, fontSize: 10 }}>{status.dot}</span>
          <span
            style={{
              fontSize: typography.fontSize.xs,
              color: status.color,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            {status.label}
          </span>
          {nodeData.cpu !== undefined && (
            <span
              style={{
                fontSize: typography.fontSize.xs,
                color: theme.textSecondary,
                marginLeft: 'auto',
              }}
            >
              {nodeData.cpu.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Ports */}
        {nodeData.ports && nodeData.ports.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {nodeData.ports.map((port, i) => (
              <span
                key={i}
                style={{
                  fontSize: typography.fontSize.xs,
                  color: theme.primary,
                  background: `${theme.primary}10`,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                :{port.split(':')[0]}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.border,
          border: 'none',
          width: 8,
          height: 8,
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

export const ServiceNode = memo(ServiceNodeComponent);
