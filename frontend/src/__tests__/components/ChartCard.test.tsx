/**
 * Tests for ChartCard component
 */
import { render, screen } from '@testing-library/react';
import { ChartCard, ChartGrid, type ChartData } from '@/components/ChartCard';

// Mock recharts - complex library, mock all chart components
jest.mock('recharts', () => {
  const MockChart = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-chart">{children}</div>
  );
  return {
    AreaChart: MockChart,
    Area: () => <div data-testid="area" />,
    LineChart: MockChart,
    Line: () => <div data-testid="line" />,
    BarChart: MockChart,
    Bar: () => <div data-testid="bar" />,
    PieChart: MockChart,
    Pie: () => <div data-testid="pie" />,
    Cell: () => <div data-testid="cell" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

describe('ChartCard', () => {
  const createChartData = (overrides: Partial<ChartData> = {}): ChartData => ({
    id: 'test-chart',
    title: 'Test Chart',
    type: 'bar',
    data: [
      { month: 'Jan', sales: 100 },
      { month: 'Feb', sales: 150 },
      { month: 'Mar', sales: 200 },
    ],
    xKey: 'month',
    yKeys: ['sales'],
    ...overrides,
  });

  describe('Basic rendering', () => {
    it('renders chart title', () => {
      render(<ChartCard data={createChartData({ title: 'Revenue Chart' })} />);

      expect(screen.getByText('Revenue Chart')).toBeInTheDocument();
    });

    it('renders chart description when provided', () => {
      render(
        <ChartCard
          data={createChartData({ description: 'Monthly revenue data' })}
        />
      );

      expect(screen.getByText('Monthly revenue data')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      render(<ChartCard data={createChartData()} />);

      expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
    });

    it('renders in a Card component', () => {
      const { container } = render(<ChartCard data={createChartData()} />);

      expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <ChartCard data={createChartData()} className="custom-class" />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Chart types', () => {
    it('renders area chart', () => {
      render(<ChartCard data={createChartData({ type: 'area' })} />);

      expect(screen.getByTestId('area')).toBeInTheDocument();
    });

    it('renders line chart', () => {
      render(<ChartCard data={createChartData({ type: 'line' })} />);

      expect(screen.getByTestId('line')).toBeInTheDocument();
    });

    it('renders bar chart', () => {
      render(<ChartCard data={createChartData({ type: 'bar' })} />);

      expect(screen.getByTestId('bar')).toBeInTheDocument();
    });

    it('renders pie chart', () => {
      render(<ChartCard data={createChartData({ type: 'pie' })} />);

      expect(screen.getByTestId('pie')).toBeInTheDocument();
    });

    it('renders nothing for unknown type', () => {
      render(
        <ChartCard
          data={createChartData({ type: 'unknown' as 'bar' })}
        />
      );

      expect(screen.queryByTestId('bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('line')).not.toBeInTheDocument();
    });
  });

  describe('ResponsiveContainer', () => {
    it('wraps chart in ResponsiveContainer', () => {
      render(<ChartCard data={createChartData()} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });

  describe('Multi-series support', () => {
    it('handles multiple yKeys', () => {
      render(
        <ChartCard
          data={createChartData({
            yKeys: ['sales', 'revenue', 'profit'],
            data: [
              { month: 'Jan', sales: 100, revenue: 200, profit: 50 },
            ],
          })}
        />
      );

      // Should render legend when multiple series
      expect(screen.getByTestId('legend')).toBeInTheDocument();
    });
  });

  describe('Custom colors', () => {
    it('accepts custom colors array', () => {
      render(
        <ChartCard
          data={createChartData({
            colors: ['#ff0000', '#00ff00', '#0000ff'],
          })}
        />
      );

      // Should render without errors
      expect(screen.getByText('Test Chart')).toBeInTheDocument();
    });
  });

  describe('Height prop', () => {
    it('uses default height of 300', () => {
      render(<ChartCard data={createChartData()} />);

      // ResponsiveContainer should be rendered
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('accepts custom height', () => {
      render(<ChartCard data={createChartData()} height={400} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });
});

describe('ChartGrid', () => {
  const createCharts = (count: number): ChartData[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `chart-${i}`,
      title: `Chart ${i + 1}`,
      type: 'bar' as const,
      data: [{ x: 1, y: 100 }],
      xKey: 'x',
      yKeys: ['y'],
    }));

  it('renders multiple charts', () => {
    render(<ChartGrid charts={createCharts(3)} />);

    expect(screen.getByText('Chart 1')).toBeInTheDocument();
    expect(screen.getByText('Chart 2')).toBeInTheDocument();
    expect(screen.getByText('Chart 3')).toBeInTheDocument();
  });

  it('applies grid layout with 2 columns by default', () => {
    const { container } = render(<ChartGrid charts={createCharts(2)} />);

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('lg:grid-cols-2');
  });

  it('applies single column layout', () => {
    const { container } = render(<ChartGrid charts={createCharts(2)} columns={1} />);

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).not.toContain('lg:grid-cols-2');
  });

  it('applies 3 column layout', () => {
    const { container } = render(<ChartGrid charts={createCharts(3)} columns={3} />);

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('passes height to each ChartCard', () => {
    render(<ChartGrid charts={createCharts(2)} height={200} />);

    // Both charts should render
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(2);
  });

  it('applies custom className', () => {
    const { container } = render(
      <ChartGrid charts={createCharts(2)} className="custom-grid" />
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('custom-grid');
  });
});
