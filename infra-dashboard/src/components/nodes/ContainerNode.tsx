import { Handle, Position } from '@xyflow/react';
import { theme, typography, statusColors } from '../../theme/colors.js';

interface ContainerNodeData {
  label: string;
  status: string;
  cpu?: number;
  memory?: number;
  ports?: string;
  image?: string;
}

interface ContainerNodeProps {
  data: ContainerNodeData;
}

export function ContainerNode({ data }: ContainerNodeProps) {
  const isRunning = data.status?.toLowerCase().includes('running') ||
                    data.status?.toLowerCase().includes('up');
  const statusColor = isRunning ? statusColors.running : statusColors.stopped;
  const statusBg = isRunning ? theme.successLight : theme.warningLight;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 4,
        padding: 12,
        minWidth: 160,
        maxWidth: 200,
        fontFamily: typography.fontFamily,
        boxShadow: theme.shadow,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          width: 8,
          height: 8,
        }}
      />

      {/* Header with status indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.medium,
          color: theme.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.label}
        </span>
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: 3,
        background: statusBg,
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: statusColor,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}>
          {isRunning ? 'Running' : 'Stopped'}
        </span>
      </div>

      {/* Metrics */}
      {(data.cpu !== undefined || data.memory !== undefined) && (
        <div style={{
          display: 'flex',
          gap: 12,
          fontSize: typography.fontSize.xs,
          color: theme.textSecondary,
          marginBottom: 4,
        }}>
          {data.cpu !== undefined && (
            <span>CPU {data.cpu.toFixed(1)}%</span>
          )}
          {data.memory !== undefined && (
            <span>RAM {Math.round(data.memory)}MB</span>
          )}
        </div>
      )}

      {/* Ports */}
      {data.ports && (
        <div style={{
          fontSize: typography.fontSize.xs,
          color: theme.primary,
          fontFamily: 'monospace',
          background: theme.primaryLight,
          padding: '2px 6px',
          borderRadius: 3,
          display: 'inline-block',
        }}>
          {data.ports}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}
