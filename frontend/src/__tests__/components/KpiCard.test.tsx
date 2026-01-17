/**
 * Tests for KpiCard component
 */
import { render, screen } from '@testing-library/react';
import { KpiCard, KpiGrid, KpiData } from '@/components/KpiCard';

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  TrendUpIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="trend-up-icon" data-size={size} className={className}>↑</span>
  ),
  TrendDownIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="trend-down-icon" data-size={size} className={className}>↓</span>
  ),
}));

describe('KpiCard', () => {
  const baseKpi: KpiData = {
    id: 'test-kpi',
    title: 'Test KPI',
    value: 1234,
  };

  describe('Basic rendering', () => {
    it('should render title', () => {
      render(<KpiCard data={baseKpi} />);

      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    it('should render numeric value with locale formatting', () => {
      render(<KpiCard data={baseKpi} />);

      // toLocaleString('fr-FR') formats 1234 with spaces or dots
      expect(screen.getByText(/1.*234/)).toBeInTheDocument();
    });

    it('should render string value as-is', () => {
      const kpi: KpiData = {
        ...baseKpi,
        value: '$1,234.56',
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    });
  });

  describe('Trend indicator', () => {
    it('should show upward trend with green styling', () => {
      const kpi: KpiData = {
        ...baseKpi,
        trend: {
          value: 5,
          direction: 'up',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByTestId('trend-up-icon')).toBeInTheDocument();
      expect(screen.getByText('+5%')).toBeInTheDocument();
    });

    it('should show downward trend with red styling', () => {
      const kpi: KpiData = {
        ...baseKpi,
        trend: {
          value: -3,
          direction: 'down',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByTestId('trend-down-icon')).toBeInTheDocument();
      expect(screen.getByText('-3%')).toBeInTheDocument();
    });

    it('should show trend label in footer', () => {
      const kpi: KpiData = {
        ...baseKpi,
        trend: {
          value: 10,
          direction: 'up',
          label: 'vs last month',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });
  });

  describe('Sparkline', () => {
    it('should render area sparkline', () => {
      const kpi: KpiData = {
        ...baseKpi,
        sparkline: {
          data: [1, 2, 3, 4, 5],
          type: 'area',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('should render line sparkline', () => {
      const kpi: KpiData = {
        ...baseKpi,
        sparkline: {
          data: [1, 2, 3, 4, 5],
          type: 'line',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should render bar sparkline', () => {
      const kpi: KpiData = {
        ...baseKpi,
        sparkline: {
          data: [1, 2, 3, 4, 5],
          type: 'bar',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('should not render sparkline when data is empty', () => {
      const kpi: KpiData = {
        ...baseKpi,
        sparkline: {
          data: [],
          type: 'area',
        },
      };

      render(<KpiCard data={kpi} />);

      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });
  });

  describe('Footer', () => {
    it('should render footer text', () => {
      const kpi: KpiData = {
        ...baseKpi,
        footer: 'Based on 1000 reviews',
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByText('Based on 1000 reviews')).toBeInTheDocument();
    });

    it('should render description in footer', () => {
      const kpi: KpiData = {
        ...baseKpi,
        description: 'Monthly average',
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByText('Monthly average')).toBeInTheDocument();
    });

    it('should prefer footer over description', () => {
      const kpi: KpiData = {
        ...baseKpi,
        description: 'Description text',
        footer: 'Footer text',
      };

      render(<KpiCard data={kpi} />);

      expect(screen.getByText('Footer text')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <KpiCard data={baseKpi} className="custom-class" />
      );

      const card = container.firstChild;
      expect(card).toHaveClass('custom-class');
    });
  });
});

describe('KpiGrid', () => {
  const mockKpis: KpiData[] = [
    { id: 'kpi1', title: 'KPI 1', value: 100 },
    { id: 'kpi2', title: 'KPI 2', value: 200 },
    { id: 'kpi3', title: 'KPI 3', value: 300 },
    { id: 'kpi4', title: 'KPI 4', value: 400 },
  ];

  it('should render all KPIs', () => {
    render(<KpiGrid kpis={mockKpis} />);

    expect(screen.getByText('KPI 1')).toBeInTheDocument();
    expect(screen.getByText('KPI 2')).toBeInTheDocument();
    expect(screen.getByText('KPI 3')).toBeInTheDocument();
    expect(screen.getByText('KPI 4')).toBeInTheDocument();
  });

  it('should apply grid classes for 4 columns by default', () => {
    const { container } = render(<KpiGrid kpis={mockKpis} />);

    const grid = container.firstChild;
    expect(grid).toHaveClass('lg:grid-cols-4');
  });

  it('should apply grid classes for 2 columns', () => {
    const { container } = render(<KpiGrid kpis={mockKpis} columns={2} />);

    const grid = container.firstChild;
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(grid).not.toHaveClass('lg:grid-cols-4');
  });

  it('should apply grid classes for 3 columns', () => {
    const { container } = render(<KpiGrid kpis={mockKpis} columns={3} />);

    const grid = container.firstChild;
    expect(grid).toHaveClass('lg:grid-cols-3');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <KpiGrid kpis={mockKpis} className="custom-grid" />
    );

    const grid = container.firstChild;
    expect(grid).toHaveClass('custom-grid');
  });
});
