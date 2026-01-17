/**
 * Tests for ChartPanel component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartPanel } from '@/components/panels/ChartPanel';
import type { ChartConfig } from '@/types';

// Mock Chart component
jest.mock('@/components/Chart', () => ({
  Chart: ({ config, height }: { config: ChartConfig; height: number | string }) => (
    <div data-testid="mock-chart" data-height={height}>
      Mock Chart: {config.title}
    </div>
  ),
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  ChartIcon: ({ size, className }: { size: number; className?: string }) => (
    <span data-testid="chart-icon" aria-hidden="true" />
  ),
  ExpandIcon: ({ size }: { size: number }) => <span data-testid="expand-icon" aria-hidden="true" />,
  CollapseIcon: ({ size }: { size: number }) => <span data-testid="collapse-icon" aria-hidden="true" />,
}));

// Mock useTranslation
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'visualization.chart': 'Chart',
      'common.fullscreen': 'Fullscreen',
      'common.exit_fullscreen': 'Exit Fullscreen',
    };
    return translations[key] || key;
  },
}));

describe('ChartPanel', () => {
  const createConfig = (overrides: Partial<ChartConfig> = {}): ChartConfig => ({
    type: 'bar',
    title: 'Sales by Month',
    xAxis: 'month',
    yAxis: 'sales',
    ...overrides,
  });

  const sampleData = [
    { month: 'Jan', sales: 100 },
    { month: 'Feb', sales: 150 },
    { month: 'Mar', sales: 200 },
  ];

  describe('Rendering conditions', () => {
    it('returns null when config is undefined', () => {
      const { container } = render(
        <ChartPanel config={undefined as unknown as ChartConfig} data={sampleData} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('returns null when config type is none', () => {
      const { container } = render(
        <ChartPanel config={createConfig({ type: 'none' })} data={sampleData} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('returns null when data is undefined', () => {
      const { container } = render(
        <ChartPanel
          config={createConfig()}
          data={undefined as unknown as Record<string, unknown>[]}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('returns null when data is empty', () => {
      const { container } = render(<ChartPanel config={createConfig()} data={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders when config and data are valid', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });

  describe('Normal view', () => {
    it('displays chart title', () => {
      render(<ChartPanel config={createConfig({ title: 'My Chart' })} data={sampleData} />);

      expect(screen.getByText('My Chart')).toBeInTheDocument();
    });

    it('displays default title when not provided', () => {
      render(<ChartPanel config={createConfig({ title: undefined })} data={sampleData} />);

      expect(screen.getByText('Chart')).toBeInTheDocument();
    });

    it('displays chart icon', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      expect(screen.getByTestId('chart-icon')).toBeInTheDocument();
    });

    it('displays expand icon', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      expect(screen.getByTestId('expand-icon')).toBeInTheDocument();
    });

    it('displays fullscreen button', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    });

    it('renders chart with 300 height', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toHaveAttribute('data-height', '300');
    });
  });

  describe('Fullscreen mode', () => {
    it('enters fullscreen when button clicked', async () => {
      const user = userEvent.setup();
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      await user.click(screen.getByText('Fullscreen'));

      expect(screen.getByText('Exit Fullscreen')).toBeInTheDocument();
      expect(screen.getByTestId('collapse-icon')).toBeInTheDocument();
    });

    it('renders chart with 100% height in fullscreen', async () => {
      const user = userEvent.setup();
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      await user.click(screen.getByText('Fullscreen'));

      expect(screen.getByTestId('mock-chart')).toHaveAttribute('data-height', '100%');
    });

    it('exits fullscreen when exit button clicked', async () => {
      const user = userEvent.setup();
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      // Enter fullscreen
      await user.click(screen.getByText('Fullscreen'));
      expect(screen.getByText('Exit Fullscreen')).toBeInTheDocument();

      // Exit fullscreen
      await user.click(screen.getByText('Exit Fullscreen'));
      expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    });

    it('shows title in fullscreen header', async () => {
      const user = userEvent.setup();
      render(<ChartPanel config={createConfig({ title: 'Revenue Chart' })} data={sampleData} />);

      await user.click(screen.getByText('Fullscreen'));

      // Title should still be visible in fullscreen
      expect(screen.getByText('Revenue Chart')).toBeInTheDocument();
    });

    it('applies fixed positioning in fullscreen', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChartPanel config={createConfig()} data={sampleData} />);

      await user.click(screen.getByText('Fullscreen'));

      // Check for fixed inset-0 class on the fullscreen container
      const fullscreenContainer = container.querySelector('.fixed.inset-0');
      expect(fullscreenContainer).toBeInTheDocument();
    });
  });

  describe('Chart types', () => {
    it('renders bar chart', () => {
      render(<ChartPanel config={createConfig({ type: 'bar' })} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });

    it('renders line chart', () => {
      render(<ChartPanel config={createConfig({ type: 'line' })} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });

    it('renders pie chart', () => {
      render(<ChartPanel config={createConfig({ type: 'pie' })} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });

    it('renders area chart', () => {
      render(<ChartPanel config={createConfig({ type: 'area' })} data={sampleData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });

  describe('Data handling', () => {
    it('passes data to Chart component', () => {
      render(<ChartPanel config={createConfig()} data={sampleData} />);

      // The mock Chart receives and displays the title
      expect(screen.getByText('Mock Chart: Sales by Month')).toBeInTheDocument();
    });

    it('handles complex data objects', () => {
      const complexData = [
        { category: 'A', value: 100, extra: { nested: true } },
        { category: 'B', value: 200, extra: { nested: false } },
      ];

      render(<ChartPanel config={createConfig()} data={complexData} />);

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has border and padding in normal view', () => {
      const { container } = render(<ChartPanel config={createConfig()} data={sampleData} />);

      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain('border-b');
      expect(panel.className).toContain('p-4');
    });

    it('has z-50 in fullscreen for overlay', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChartPanel config={createConfig()} data={sampleData} />);

      await user.click(screen.getByText('Fullscreen'));

      const fullscreenContainer = container.querySelector('.z-50');
      expect(fullscreenContainer).toBeInTheDocument();
    });
  });
});
