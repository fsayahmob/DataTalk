import { Handle, Position } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface MissingNodeData {
  label: string;
  type: string;
  expectedType?: string;
}

interface MissingNodeProps {
  data: MissingNodeData;
}

export function MissingNode({ data }: MissingNodeProps) {
  return (
    <div
      style={{
        background: theme.errorLight,
        border: `1px dashed ${theme.error}`,
        borderRadius: 4,
        padding: 12,
        minWidth: 160,
        fontFamily: typography.fontFamily,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: theme.errorLight,
          border: `1px solid ${theme.error}`,
          width: 8,
          height: 8,
        }}
      />

      {/* Missing indicator */}
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
          background: theme.error,
        }} />
        <span style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: theme.error,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}>
          Missing
        </span>
      </div>

      {/* Resource name */}
      <div style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        color: theme.textPrimary,
        marginBottom: 4,
      }}>
        {data.label}
      </div>

      {/* Expected type */}
      <div style={{
        fontSize: typography.fontSize.xs,
        color: theme.textSecondary,
      }}>
        Expected: {data.expectedType || data.type}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: theme.errorLight,
          border: `1px solid ${theme.error}`,
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}
