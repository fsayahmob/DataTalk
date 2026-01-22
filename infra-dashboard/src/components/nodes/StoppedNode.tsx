import { Handle, Position } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface StoppedNodeData {
  label: string;
  type: string;
  expectedType?: string;
  hasImage?: boolean;
  service?: string;
  project?: string;
}

interface StoppedNodeProps {
  data: StoppedNodeData;
}

export function StoppedNode({ data }: StoppedNodeProps) {
  return (
    <div
      style={{
        background: theme.warningLight,
        border: `1px solid ${theme.warning}`,
        borderRadius: 4,
        padding: 12,
        minWidth: 160,
        maxWidth: 200,
        fontFamily: typography.fontFamily,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.warningLight,
          border: `1px solid ${theme.warning}`,
          width: 8,
          height: 8,
        }}
      />

      {/* Status indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: theme.warning,
        }} />
        <span style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: theme.warning,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}>
          {data.hasImage ? 'Stopped' : 'Image Only'}
        </span>
      </div>

      {/* Container name */}
      <div style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        color: theme.textPrimary,
        marginBottom: 4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.label}
      </div>

      {/* Description */}
      <div style={{
        fontSize: typography.fontSize.xs,
        color: theme.textSecondary,
        marginBottom: data.service ? 4 : 0,
      }}>
        {data.hasImage
          ? 'Container can be started'
          : 'Run docker compose up'}
      </div>

      {/* Service info */}
      {data.service && (
        <div style={{
          fontSize: typography.fontSize.xs,
          color: theme.textSecondary,
          background: theme.surfaceVariant,
          padding: '2px 6px',
          borderRadius: 3,
          display: 'inline-block',
        }}>
          {data.service}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: theme.warningLight,
          border: `1px solid ${theme.warning}`,
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}
