import { Handle, Position } from '@xyflow/react';

interface InfraNodeData {
  label: string;
  type: string;
  project?: string;
  zone?: string;
  os?: string;
  arch?: string;
  services?: number;
}

interface InfraNodeProps {
  data: InfraNodeData;
}

const TYPE_STYLES: Record<string, { bg: string; border: string }> = {
  cloud: { bg: '#083344', border: '#06b6d4' },
  vm: { bg: '#1c1917', border: '#a3a3a3' },
  docker: { bg: '#172554', border: '#3b82f6' },
  compose: { bg: '#14532d', border: '#22c55e' },
};

export function InfraNode({ data }: InfraNodeProps) {
  const style = TYPE_STYLES[data.type] || { bg: '#1e293b', border: '#64748b' };

  return (
    <div
      style={{
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
        color: '#f8fafc',
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
      <div style={{ color: '#94a3b8', fontSize: 10 }}>
        {data.type.toUpperCase()}
        {data.project && ` | ${data.project}`}
        {data.zone && ` | ${data.zone}`}
        {data.os && ` | ${data.os}`}
        {data.services !== undefined && ` | ${data.services} services`}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
