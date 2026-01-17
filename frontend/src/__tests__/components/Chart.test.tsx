/**
 * Tests for Chart component
 */
import { render, screen } from '@testing-library/react';
import { Chart } from '@/components/Chart';
import type { ChartConfig } from '@/types';

// Mock console.log to suppress chart render debug logs
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});
afterAll(() => {
  console.log = originalConsoleLog;
});

// Mock recharts
jest.mock('recharts', () => {
  return {
    BarChart: (props: Record<string, unknown>) => (
      <div data-testid="bar-chart" data-margin={JSON.stringify(props.margin)}>
        {props.children as React.ReactNode}
      </div>
    ),
    Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
    LineChart: (props: Record<string, unknown>) => (
      <div data-testid="line-chart">{props.children as React.ReactNode}</div>
    ),
    Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
    PieChart: (props: Record<string, unknown>) => (
      <div data-testid="pie-chart">{props.children as React.ReactNode}</div>
    ),
    Pie: ({ dataKey }: { dataKey: string }) => <div data-testid={`pie-${dataKey}`} />,
    AreaChart: (props: Record<string, unknown>) => (
      <div data-testid="area-chart">{props.children as React.ReactNode}</div>
    ),
    Area: ({ dataKey }: { dataKey: string }) => <div data-testid={`area-${dataKey}`} />,
    ScatterChart: (props: Record<string, unknown>) => (
      <div data-testid="scatter-chart">{props.children as React.ReactNode}</div>
    ),
    Scatter: () => <div data-testid="scatter" />,
    XAxis: ({ dataKey }: { dataKey?: string }) => (
      <div data-testid="x-axis" data-key={dataKey} />
    ),
    YAxis: ({ dataKey, domain }: { dataKey?: string; domain?: unknown[] }) => (
      <div data-testid="y-axis" data-key={dataKey} data-domain={JSON.stringify(domain)} />
    ),
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
    ResponsiveContainer: ({ children, height }: { children: React.ReactNode; height?: unknown }) => (
      <div data-testid="responsive-container" data-height={String(height)}>
        {children}
      </div>
    ),
    Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  };
});

describe('Chart', () => {
  const createConfig = (overrides: Partial<ChartConfig> = {}): ChartConfig => ({
    type: 'bar',
    title: 'Test Chart',
    x: 'category',
    y: 'value',
    ...overrides,
  });

  const sampleData = [
    { category: 'A', value: 100 },
    { category: 'B', value: 200 },
    { category: 'C', value: 150 },
  ];

  describe('Empty state', () => {
    it('shows no data message when data is empty', () => {
      render(<Chart config={createConfig()} data={[]} />);

      expect(screen.getByText('Aucune donnée à afficher')).toBeInTheDocument();
    });

    it('shows no data message when data is undefined', () => {
      render(
        <Chart
          config={createConfig()}
          data={undefined as unknown as Record<string, unknown>[]}
        />
      );

      expect(screen.getByText('Aucune donnée à afficher')).toBeInTheDocument();
    });
  });

  describe('Invalid data handling', () => {
    it('shows error message when Y column is missing', () => {
      render(
        <Chart
          config={createConfig({ y: 'nonexistent' })}
          data={sampleData}
        />
      );

      expect(screen.getByText(/Format de données incompatible/)).toBeInTheDocument();
    });

    it('shows error for missing Y columns in array', () => {
      render(
        <Chart
          config={createConfig({ y: ['value', 'missing'] })}
          data={sampleData}
        />
      );

      expect(screen.getByText(/Format de données incompatible/)).toBeInTheDocument();
    });
  });

  describe('Chart types', () => {
    it('renders bar chart', () => {
      render(<Chart config={createConfig({ type: 'bar' })} data={sampleData} />);

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-value')).toBeInTheDocument();
    });

    it('renders line chart', () => {
      render(<Chart config={createConfig({ type: 'line' })} data={sampleData} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(screen.getByTestId('line-value')).toBeInTheDocument();
    });

    it('renders pie chart', () => {
      render(<Chart config={createConfig({ type: 'pie' })} data={sampleData} />);

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('pie-value')).toBeInTheDocument();
    });

    it('renders area chart', () => {
      render(<Chart config={createConfig({ type: 'area' })} data={sampleData} />);

      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
      expect(screen.getByTestId('area-value')).toBeInTheDocument();
    });

    it('renders scatter chart', () => {
      render(<Chart config={createConfig({ type: 'scatter' })} data={sampleData} />);

      expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
    });

    it('returns null for type "none"', () => {
      const { container } = render(
        <Chart config={createConfig({ type: 'none' })} data={sampleData} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Multi-series support', () => {
    it('handles array of Y keys', () => {
      const multiSeriesData = [
        { category: 'A', value1: 100, value2: 200 },
        { category: 'B', value1: 150, value2: 250 },
      ];

      render(
        <Chart
          config={createConfig({ y: ['value1', 'value2'] })}
          data={multiSeriesData}
        />
      );

      expect(screen.getByTestId('bar-value1')).toBeInTheDocument();
      expect(screen.getByTestId('bar-value2')).toBeInTheDocument();
    });
  });

  describe('Rating scale detection', () => {
    it('applies 0-5 domain for note columns', () => {
      const ratingData = [
        { item: 'A', note_moyenne: 4.5 },
        { item: 'B', note_moyenne: 3.8 },
      ];

      render(
        <Chart
          config={createConfig({ x: 'item', y: 'note_moyenne' })}
          data={ratingData}
        />
      );

      const yAxis = screen.getByTestId('y-axis');
      expect(yAxis.getAttribute('data-domain')).toContain('[0,5]');
    });

    it('applies 0-5 domain for values between 0 and 5', () => {
      const ratingData = [
        { item: 'A', rating: 4 },
        { item: 'B', rating: 3 },
      ];

      render(
        <Chart
          config={createConfig({ x: 'item', y: 'rating' })}
          data={ratingData}
        />
      );

      const yAxis = screen.getByTestId('y-axis');
      expect(yAxis.getAttribute('data-domain')).toContain('[0,5]');
    });
  });

  describe('ResponsiveContainer', () => {
    it('uses 100% height by default', () => {
      render(<Chart config={createConfig()} data={sampleData} />);

      const container = screen.getByTestId('responsive-container');
      expect(container.getAttribute('data-height')).toBe('100%');
    });

    it('accepts custom height', () => {
      render(<Chart config={createConfig()} data={sampleData} height={400} />);

      const container = screen.getByTestId('responsive-container');
      expect(container.getAttribute('data-height')).toBe('400');
    });
  });

  describe('Axes configuration', () => {
    it('configures X axis with data key', () => {
      render(
        <Chart
          config={createConfig({ x: 'month' })}
          data={[{ month: 'Jan', value: 100 }]}
        />
      );

      const xAxis = screen.getByTestId('x-axis');
      expect(xAxis.getAttribute('data-key')).toBe('month');
    });
  });

  describe('Common chart elements', () => {
    it('includes CartesianGrid for bar chart', () => {
      render(<Chart config={createConfig({ type: 'bar' })} data={sampleData} />);

      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('includes Tooltip', () => {
      render(<Chart config={createConfig()} data={sampleData} />);

      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });

    it('includes Legend for multi-series', () => {
      const multiData = [{ x: 1, y1: 100, y2: 200 }];
      render(
        <Chart
          config={createConfig({ y: ['y1', 'y2'] })}
          data={multiData}
        />
      );

      expect(screen.getByTestId('legend')).toBeInTheDocument();
    });
  });

  describe('Pie chart specifics', () => {
    it('only uses first Y key for pie chart', () => {
      const pieData = [
        { name: 'A', value1: 100, value2: 200 },
        { name: 'B', value1: 150, value2: 250 },
      ];

      render(
        <Chart
          config={createConfig({ type: 'pie', x: 'name', y: ['value1', 'value2'] })}
          data={pieData}
        />
      );

      // Should only render pie with first key
      expect(screen.getByTestId('pie-value1')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-value2')).not.toBeInTheDocument();
    });
  });
});
