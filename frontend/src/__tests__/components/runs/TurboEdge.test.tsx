/**
 * Tests for TurboEdge component
 */
import { render, screen } from '@testing-library/react';
import TurboEdge from '@/components/runs/TurboEdge';
import type { EdgeProps, Position } from '@xyflow/react';

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  BaseEdge: ({ path, markerEnd, style }: { path: string; markerEnd?: string; style?: object }) => (
    <div
      data-testid="base-edge"
      data-path={path}
      data-marker-end={markerEnd}
      style={style}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  getBezierPath: jest.fn(() => ['M0,0 C50,0 50,100 100,100', 50, 50]),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}));

describe('TurboEdge', () => {
  const createProps = (overrides: Partial<EdgeProps> = {}): EdgeProps => ({
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'right' as Position,
    targetPosition: 'left' as Position,
    ...overrides,
  });

  describe('Basic rendering', () => {
    it('renders base edge with path', () => {
      render(<TurboEdge {...createProps()} />);

      expect(screen.getByTestId('base-edge')).toBeInTheDocument();
    });

    it('applies custom style to edge', () => {
      const customStyle = { stroke: 'red', strokeWidth: 2 };
      render(<TurboEdge {...createProps({ style: customStyle })} />);

      const edge = screen.getByTestId('base-edge');
      expect(edge).toHaveStyle({ stroke: 'red', strokeWidth: 2 });
    });

    it('applies marker end when provided', () => {
      render(<TurboEdge {...createProps({ markerEnd: 'url(#arrow)' })} />);

      const edge = screen.getByTestId('base-edge');
      expect(edge).toHaveAttribute('data-marker-end', 'url(#arrow)');
    });
  });

  describe('Label rendering', () => {
    it('renders label when provided in data', () => {
      render(
        <TurboEdge
          {...createProps({
            data: { label: 'Connection Label' },
          })}
        />
      );

      expect(screen.getByText('Connection Label')).toBeInTheDocument();
    });

    it('does not render label when not provided', () => {
      render(<TurboEdge {...createProps()} />);

      expect(screen.queryByTestId('edge-label-renderer')).not.toBeInTheDocument();
    });

    it('does not render label when data.label is undefined', () => {
      render(
        <TurboEdge
          {...createProps({
            data: { other: 'value' },
          })}
        />
      );

      expect(screen.queryByTestId('edge-label-renderer')).not.toBeInTheDocument();
    });

    it('renders React node as label', () => {
      render(
        <TurboEdge
          {...createProps({
            data: { label: <span data-testid="custom-label">Custom</span> },
          })}
        />
      );

      expect(screen.getByTestId('custom-label')).toBeInTheDocument();
    });

    it('applies correct positioning styles to label', () => {
      const { container } = render(
        <TurboEdge
          {...createProps({
            data: { label: 'Test Label' },
          })}
        />
      );

      const labelContainer = container.querySelector('[style*="position: absolute"]');
      expect(labelContainer).toBeInTheDocument();
      expect(labelContainer).toHaveStyle({ position: 'absolute' });
    });

    it('applies correct classes to label container', () => {
      render(
        <TurboEdge
          {...createProps({
            data: { label: 'Styled Label' },
          })}
        />
      );

      const labelElement = screen.getByText('Styled Label');
      expect(labelElement).toHaveClass('nodrag');
      expect(labelElement).toHaveClass('nopan');
      expect(labelElement).toHaveClass('bg-background');
      expect(labelElement).toHaveClass('rounded');
    });
  });

  describe('Edge path calculation', () => {
    it('uses getBezierPath for path calculation', async () => {
      const { getBezierPath } = await import('@xyflow/react');

      render(<TurboEdge {...createProps()} />);

      expect(getBezierPath).toHaveBeenCalledWith({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: 'right',
        targetX: 100,
        targetY: 100,
        targetPosition: 'left',
      });
    });
  });

  describe('Default style', () => {
    it('uses empty object as default style', () => {
      const props = createProps();
      delete (props as { style?: object }).style;

      render(<TurboEdge {...props} />);

      // Should render without errors
      expect(screen.getByTestId('base-edge')).toBeInTheDocument();
    });
  });
});
