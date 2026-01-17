/**
 * Tests for KpiCardCompact component
 */
import { render, screen } from '@testing-library/react';
import { KpiCardCompact, KpiGridCompact, type KpiCompactData } from '@/components/KpiCardCompact';

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  TrendUpIcon: ({ size, className }: { size: number; className?: string }) => (
    <span data-testid="trend-up-icon" data-size={size} className={className}>↑</span>
  ),
  TrendDownIcon: ({ size, className }: { size: number; className?: string }) => (
    <span data-testid="trend-down-icon" data-size={size} className={className}>↓</span>
  ),
}));

describe('KpiCardCompact', () => {
  const baseData: KpiCompactData = {
    id: 'kpi-1',
    title: 'Total Users',
    value: 12345,
  };

  describe('Basic rendering', () => {
    it('renders title and value', () => {
      render(<KpiCardCompact data={baseData} />);

      expect(screen.getByText('Total Users')).toBeInTheDocument();
      // Value is formatted with fr-FR locale
      expect(screen.getByText(/12/)).toBeInTheDocument();
    });

    it('renders string value correctly', () => {
      const data: KpiCompactData = {
        id: 'kpi-2',
        title: 'Status',
        value: 'Active',
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('formats numeric value with locale', () => {
      const data: KpiCompactData = {
        id: 'kpi-3',
        title: 'Revenue',
        value: 1000000,
      };

      render(<KpiCardCompact data={data} />);

      // French locale uses space as thousand separator
      expect(screen.getByText(/1.*000.*000/)).toBeInTheDocument();
    });
  });

  describe('Trend indicator', () => {
    it('renders upward trend with positive styling', () => {
      const data: KpiCompactData = {
        ...baseData,
        trend: { value: 15, direction: 'up' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByText('+15%')).toBeInTheDocument();
      expect(screen.getByTestId('trend-up-icon')).toBeInTheDocument();
    });

    it('renders downward trend with negative styling', () => {
      const data: KpiCompactData = {
        ...baseData,
        trend: { value: -10, direction: 'down' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByText('-10%')).toBeInTheDocument();
      expect(screen.getByTestId('trend-down-icon')).toBeInTheDocument();
    });

    it('renders inverted trend correctly (down is positive)', () => {
      const data: KpiCompactData = {
        ...baseData,
        trend: { value: -5, direction: 'down', invert: true },
      };

      render(<KpiCardCompact data={data} />);

      // With invert=true, down direction should be positive (emerald)
      expect(screen.getByText('-5%')).toBeInTheDocument();
    });

    it('renders trend label when provided', () => {
      const data: KpiCompactData = {
        ...baseData,
        trend: { value: 20, direction: 'up', label: 'vs last month' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });
  });

  describe('Sparkline', () => {
    it('renders area sparkline when type is area', () => {
      const data: KpiCompactData = {
        ...baseData,
        sparkline: { data: [10, 20, 30, 40, 50], type: 'area' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('renders bar sparkline when type is bar', () => {
      const data: KpiCompactData = {
        ...baseData,
        sparkline: { data: [10, 20, 30, 40, 50], type: 'bar' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('does not render sparkline when data has less than 3 points', () => {
      const data: KpiCompactData = {
        ...baseData,
        sparkline: { data: [10, 20], type: 'area' },
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });

    it('does not render sparkline when not provided', () => {
      render(<KpiCardCompact data={baseData} />);

      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    });
  });

  describe('Footer', () => {
    it('renders footer text when provided', () => {
      const data: KpiCompactData = {
        ...baseData,
        footer: 'Updated 5 minutes ago',
      };

      render(<KpiCardCompact data={data} />);

      expect(screen.getByText('Updated 5 minutes ago')).toBeInTheDocument();
    });

    it('does not render footer section when no footer or trend label', () => {
      const { container } = render(<KpiCardCompact data={baseData} />);

      // Footer section should not exist
      const footerTexts = container.querySelectorAll('.text-xs.text-muted-foreground');
      // Only title should have this class, not footer
      expect(footerTexts.length).toBeLessThanOrEqual(1);
    });
  });
});

describe('KpiGridCompact', () => {
  const mockKpis: KpiCompactData[] = [
    { id: 'kpi-1', title: 'Users', value: 100 },
    { id: 'kpi-2', title: 'Revenue', value: 5000 },
    { id: 'kpi-3', title: 'Orders', value: 250 },
  ];

  it('renders all KPI cards', () => {
    render(<KpiGridCompact kpis={mockKpis} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });

  it('renders empty grid when no KPIs', () => {
    const { container } = render(<KpiGridCompact kpis={[]} />);

    const grid = container.querySelector('.flex.flex-col');
    expect(grid).toBeInTheDocument();
    expect(grid?.children.length).toBe(0);
  });

  it('renders grid with correct layout', () => {
    const { container } = render(<KpiGridCompact kpis={mockKpis} />);

    const grid = container.querySelector('.flex.flex-col.gap-2');
    expect(grid).toBeInTheDocument();
    expect(grid?.children.length).toBe(3);
  });
});
