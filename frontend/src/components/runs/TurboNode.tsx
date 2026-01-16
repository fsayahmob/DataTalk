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
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent border-2 border-card flex items-center justify-center">
            <span className="text-accent-foreground text-xs">✓</span>
          </div>
        );
      case 'running':
        return (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary border-2 border-card flex items-center justify-center animate-pulse">
            <span className="text-primary-foreground text-xs animate-spin">⟳</span>
          </div>
        );
      case 'failed':
        return (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive border-2 border-card flex items-center justify-center">
            <span className="text-destructive-foreground text-xs">✗</span>
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
      <div className={`relative px-4 py-3 rounded-lg border-2 ${getBorderColor()} transition-all min-w-[180px] bg-card shadow-md`}>
        {/* Status Badge */}
        {getStatusBadge()}

        <div className="flex items-center gap-3">
          {/* Icon */}
          {data.icon && (
            <div className="text-2xl flex-shrink-0">
              {data.icon}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground truncate">
              {data.title}
            </div>
            {data.subtitle && (
              <div className="text-xs text-muted-foreground truncate">
                {data.subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {data.status === 'running' && data.progress !== undefined && data.progress > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${data.progress}%` }}
              />
            </div>
            <div className="text-[9px] text-muted-foreground text-right mt-0.5">
              {data.progress}%
            </div>
          </div>
        )}

        {/* Result stats */}
        {data.status === 'completed' && data.result && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
            {data.result.tables !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {String(data.result.tables)} tables
              </span>
            )}
            {data.result.columns !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {String(data.result.columns)} cols
              </span>
            )}
            {data.result.synonyms !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                {String(data.result.synonyms)} syn
              </span>
            )}
            {data.result.kpis !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {String(data.result.kpis)} KPIs
              </span>
            )}
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
