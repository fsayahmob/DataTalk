import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export type TurboNodeData = {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: Record<string, unknown>;
};

const TurboNode = memo(({ data }: { data: TurboNodeData }) => {
  const getStatusBadge = () => {
    switch (data.status) {
      case 'completed':
        return (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent border border-card flex items-center justify-center">
            <span className="text-accent-foreground text-[8px]">✓</span>
          </div>
        );
      case 'running':
        return (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border border-card flex items-center justify-center animate-pulse">
            <span className="text-primary-foreground text-[8px] animate-spin">⟳</span>
          </div>
        );
      case 'failed':
        return (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive border border-card flex items-center justify-center">
            <span className="text-destructive-foreground text-[8px]">✗</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (data.status) {
      case 'completed':
        return 'border-accent/50';
      case 'running':
        return 'border-primary/50';
      case 'failed':
        return 'border-destructive/50';
      default:
        return 'border-border';
    }
  };

  return (
    <>
      <div className={`relative px-2 py-1.5 rounded border ${getBorderColor()} transition-all min-w-[120px] max-w-[140px] bg-card shadow-sm`}>
        {/* Status Badge */}
        {getStatusBadge()}

        <div className="flex items-center gap-1.5">
          {/* Icon */}
          {data.icon && (
            <div className="text-base flex-shrink-0">
              {data.icon}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-[11px] text-foreground truncate">
              {data.title}
            </div>
            {data.subtitle && (
              <div className="text-[9px] text-muted-foreground truncate">
                {data.subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {data.status === 'running' && data.progress !== undefined && data.progress > 0 && (
          <div className="mt-1">
            <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${data.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Result stats - compact inline */}
        {data.status === 'completed' && data.result && (
          <div className="mt-1 text-[8px] text-muted-foreground truncate">
            {[
              data.result.tables !== undefined && `${data.result.tables}t`,
              data.result.columns !== undefined && `${data.result.columns}c`,
              data.result.synonyms !== undefined && `${data.result.synonyms}s`,
              data.result.kpis !== undefined && `${data.result.kpis}k`,
            ].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-primary/50" />
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-primary/50" />
    </>
  );
});

TurboNode.displayName = 'TurboNode';

export default TurboNode;
