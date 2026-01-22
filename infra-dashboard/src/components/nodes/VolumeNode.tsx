import { Handle, Position } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface VolumeNodeData {
  label: string;
  driver?: string;
  size?: number;
  usedBy?: string[];
}

interface VolumeNodeProps {
  data: VolumeNodeData;
}

export function VolumeNode({ data }: VolumeNodeProps) {
  const mountCount = data.usedBy?.length || 0;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderLeft: `3px solid ${theme.textSecondary}`,
        borderRadius: 4,
        padding: 10,
        minWidth: 140,
        fontFamily: typography.fontFamily,
        boxShadow: theme.shadow,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          width: 8,
          height: 8,
        }}
      />

      {/* Type label */}
      <div style={{
        fontSize: typography.fontSize.xs,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 2,
      }}>
        Volume
      </div>

      {/* Volume name */}
      <div style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        color: theme.textPrimary,
        marginBottom: 6,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.label}
      </div>

      {/* Metadata */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        {data.size !== undefined && (
          <span style={{
            fontSize: typography.fontSize.xs,
            color: theme.textSecondary,
            background: theme.surfaceVariant,
            padding: '2px 6px',
            borderRadius: 3,
          }}>
            {data.size > 0 ? `${data.size} MB` : '0 MB'}
          </span>
        )}
        {mountCount > 0 && (
          <span style={{
            fontSize: typography.fontSize.xs,
            color: theme.textSecondary,
            background: theme.surfaceVariant,
            padding: '2px 6px',
            borderRadius: 3,
          }}>
            {mountCount} mount{mountCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
