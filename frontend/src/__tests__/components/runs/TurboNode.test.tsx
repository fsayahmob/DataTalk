/**
 * Tests for TurboNode component
 */
import { render, screen } from '@testing-library/react';
import TurboNode, { type TurboNodeData } from '@/components/runs/TurboNode';

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
  },
}));

describe('TurboNode', () => {
  const createData = (overrides: Partial<TurboNodeData> = {}): TurboNodeData => ({
    title: 'Test Node',
    ...overrides,
  });

  describe('Basic rendering', () => {
    it('renders title', () => {
      render(<TurboNode data={createData({ title: 'My Node' })} />);

      expect(screen.getByText('My Node')).toBeInTheDocument();
    });

    it('renders subtitle when provided', () => {
      render(<TurboNode data={createData({ subtitle: 'Node description' })} />);

      expect(screen.getByText('Node description')).toBeInTheDocument();
    });

    it('does not render subtitle when not provided', () => {
      render(<TurboNode data={createData()} />);

      expect(screen.queryByText('Node description')).not.toBeInTheDocument();
    });

    it('renders icon when provided', () => {
      render(
        <TurboNode data={createData({ icon: <span data-testid="node-icon">🔄</span> })} />
      );

      expect(screen.getByTestId('node-icon')).toBeInTheDocument();
    });

    it('does not render icon section when not provided', () => {
      const { container } = render(<TurboNode data={createData()} />);

      expect(container.querySelector('.text-2xl')).not.toBeInTheDocument();
    });

    it('renders connection handles', () => {
      render(<TurboNode data={createData()} />);

      expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'left');
      expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'right');
    });
  });

  describe('Status badges', () => {
    it('shows checkmark badge when completed', () => {
      render(<TurboNode data={createData({ status: 'completed' })} />);

      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('shows spinning icon when running', () => {
      render(<TurboNode data={createData({ status: 'running' })} />);

      expect(screen.getByText('⟳')).toBeInTheDocument();
    });

    it('shows X icon when failed', () => {
      render(<TurboNode data={createData({ status: 'failed' })} />);

      expect(screen.getByText('✗')).toBeInTheDocument();
    });

    it('shows no badge when pending', () => {
      render(<TurboNode data={createData({ status: 'pending' })} />);

      expect(screen.queryByText('✓')).not.toBeInTheDocument();
      expect(screen.queryByText('⟳')).not.toBeInTheDocument();
      expect(screen.queryByText('✗')).not.toBeInTheDocument();
    });

    it('shows no badge when status is undefined', () => {
      render(<TurboNode data={createData()} />);

      expect(screen.queryByText('✓')).not.toBeInTheDocument();
      expect(screen.queryByText('⟳')).not.toBeInTheDocument();
      expect(screen.queryByText('✗')).not.toBeInTheDocument();
    });
  });

  describe('Border colors by status', () => {
    it('applies accent border when completed', () => {
      const { container } = render(<TurboNode data={createData({ status: 'completed' })} />);

      const node = container.querySelector('.border-accent\\/50');
      expect(node).toBeInTheDocument();
    });

    it('applies primary border when running', () => {
      const { container } = render(<TurboNode data={createData({ status: 'running' })} />);

      const node = container.querySelector('.border-primary\\/50');
      expect(node).toBeInTheDocument();
    });

    it('applies destructive border when failed', () => {
      const { container } = render(<TurboNode data={createData({ status: 'failed' })} />);

      const node = container.querySelector('.border-destructive\\/50');
      expect(node).toBeInTheDocument();
    });

    it('applies default border when pending', () => {
      const { container } = render(<TurboNode data={createData({ status: 'pending' })} />);

      const node = container.querySelector('.border-border');
      expect(node).toBeInTheDocument();
    });
  });

  describe('Progress bar', () => {
    it('shows progress bar when running with progress > 0', () => {
      render(<TurboNode data={createData({ status: 'running', progress: 50 })} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('does not show progress bar when not running', () => {
      render(<TurboNode data={createData({ status: 'completed', progress: 100 })} />);

      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });

    it('does not show progress bar when progress is 0', () => {
      render(<TurboNode data={createData({ status: 'running', progress: 0 })} />);

      expect(screen.queryByText('0%')).not.toBeInTheDocument();
    });

    it('does not show progress bar when progress is undefined', () => {
      render(<TurboNode data={createData({ status: 'running' })} />);

      // Look for any percentage display
      const percentagePattern = /\d+%/;
      expect(screen.queryByText(percentagePattern)).not.toBeInTheDocument();
    });

    it('applies correct width to progress bar', () => {
      const { container } = render(
        <TurboNode data={createData({ status: 'running', progress: 75 })} />
      );

      const progressFill = container.querySelector('[style*="width: 75%"]');
      expect(progressFill).toBeInTheDocument();
    });
  });

  describe('Result stats', () => {
    it('shows tables count when completed with tables result', () => {
      render(
        <TurboNode
          data={createData({ status: 'completed', result: { tables: 10 } })}
        />
      );

      expect(screen.getByText('10 tables')).toBeInTheDocument();
    });

    it('shows columns count when completed with columns result', () => {
      render(
        <TurboNode
          data={createData({ status: 'completed', result: { columns: 50 } })}
        />
      );

      expect(screen.getByText('50 cols')).toBeInTheDocument();
    });

    it('shows synonyms count when completed with synonyms result', () => {
      render(
        <TurboNode
          data={createData({ status: 'completed', result: { synonyms: 25 } })}
        />
      );

      expect(screen.getByText('25 syn')).toBeInTheDocument();
    });

    it('shows KPIs count when completed with kpis result', () => {
      render(
        <TurboNode
          data={createData({ status: 'completed', result: { kpis: 5 } })}
        />
      );

      expect(screen.getByText('5 KPIs')).toBeInTheDocument();
    });

    it('shows multiple result stats', () => {
      render(
        <TurboNode
          data={createData({
            status: 'completed',
            result: { tables: 10, columns: 50, synonyms: 25, kpis: 5 },
          })}
        />
      );

      expect(screen.getByText('10 tables')).toBeInTheDocument();
      expect(screen.getByText('50 cols')).toBeInTheDocument();
      expect(screen.getByText('25 syn')).toBeInTheDocument();
      expect(screen.getByText('5 KPIs')).toBeInTheDocument();
    });

    it('does not show result stats when not completed', () => {
      render(
        <TurboNode
          data={createData({ status: 'running', result: { tables: 10 } })}
        />
      );

      expect(screen.queryByText('10 tables')).not.toBeInTheDocument();
    });

    it('does not show result stats when result is undefined', () => {
      render(<TurboNode data={createData({ status: 'completed' })} />);

      expect(screen.queryByText(/tables/)).not.toBeInTheDocument();
      expect(screen.queryByText(/cols/)).not.toBeInTheDocument();
    });
  });

  describe('Component memoization', () => {
    it('has displayName set', () => {
      // Import the default export to check displayName
      expect(TurboNode.displayName).toBe('TurboNode');
    });
  });
});
