import type { NodeProps, Node } from '@xyflow/react';
import { theme, typography } from '../../theme/colors.js';

interface GroupNodeData extends Record<string, unknown> {
  label: string;
  type: 'docker' | 'compose' | 'network';
  services?: number;
  driver?: string;
  containerCount?: number;
}

type GroupNodeType = Node<GroupNodeData, 'group'>;

// GCP-style type indicators - text only, no emojis
const typeConfig = {
  docker: {
    label: 'Docker Engine',
    accentColor: theme.primary,
  },
  compose: {
    label: 'Compose Project',
    accentColor: theme.success,
  },
  network: {
    label: 'Network',
    accentColor: theme.textSecondary,
  },
};

export function GroupNode({ data }: NodeProps<GroupNodeType>) {
  const nodeData = data as GroupNodeData;
  const nodeType = nodeData.type || 'docker';
  const config = typeConfig[nodeType] || typeConfig.docker;

  // Build metadata text
  const metadata: string[] = [];
  if (nodeType === 'compose' && nodeData.services) {
    metadata.push(`${nodeData.services} service${nodeData.services > 1 ? 's' : ''}`);
  }
  if (nodeType === 'network') {
    if (nodeData.driver) metadata.push(nodeData.driver);
    if (nodeData.containerCount) {
      metadata.push(`${nodeData.containerCount} container${nodeData.containerCount > 1 ? 's' : ''}`);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 12px',
        borderLeft: `3px solid ${config.accentColor}`,
        background: theme.surface,
        fontFamily: typography.fontFamily,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {config.label}
        </span>
        <span
          style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.medium,
            color: theme.textPrimary,
          }}
        >
          {nodeData.label}
        </span>
      </div>
      {metadata.length > 0 && (
        <span
          style={{
            fontSize: typography.fontSize.xs,
            color: theme.textSecondary,
            padding: '2px 8px',
            background: theme.surfaceVariant,
            borderRadius: 4,
          }}
        >
          {metadata.join(' · ')}
        </span>
      )}
    </div>
  );
}
