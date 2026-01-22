import { Handle, Position } from '@xyflow/react';

interface NetworkNodeData {
  label: string;
  driver?: string;
  containerCount?: number;
}

interface NetworkNodeProps {
  data: NetworkNodeData;
}

export function NetworkNode({ data }: NetworkNodeProps) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '2px solid #8b5cf6',
        borderRadius: 8,
        padding: 12,
        minWidth: 160,
        color: '#f8fafc',
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
      <div style={{ color: '#94a3b8', fontSize: 10 }}>
        {data.driver || 'bridge'} | {data.containerCount || 0} containers
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
