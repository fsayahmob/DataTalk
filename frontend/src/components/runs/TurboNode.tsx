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
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-green-500 border-2 border-[hsl(260_10%_10%)] flex items-center justify-center">
            <span className="text-white text-xs">✓</span>
          </div>
        );
      case 'running':
        return (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 border-2 border-[hsl(260_10%_10%)] flex items-center justify-center animate-pulse">
            <span className="text-white text-xs animate-spin">⟳</span>
          </div>
        );
      case 'failed':
        return (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 border-2 border-[hsl(260_10%_10%)] flex items-center justify-center">
            <span className="text-white text-xs">✗</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (data.status) {
      case 'running':
        return 'border-blue-500/50';
      default:
        return 'border-border/50';
    }
  };

  return (
    <>
      <div className={`relative px-4 py-3 rounded-lg border-2 ${getBorderColor()} transition-all min-w-[180px] bg-[hsl(260_10%_10%)] shadow-sm`}>
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
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
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
                {data.result.tables} tables
              </span>
            )}
            {data.result.columns !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {data.result.columns} cols
              </span>
            )}
            {data.result.synonyms !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                {data.result.synonyms} syn
              </span>
            )}
            {data.result.kpis !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                {data.result.kpis} KPIs
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
