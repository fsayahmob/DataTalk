/**
 * Tests for UsageTab component
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UsageTab } from '@/components/settings/UsageTab';
import type { LLMCosts } from '@/lib/api';

// Mock recharts to avoid rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const mockCosts: LLMCosts = {
  total: {
    total_calls: 150,
    total_tokens_input: 50000,
    total_tokens_output: 25000,
    total_cost: 0.1234,
  },
  by_model: [
    {
      model_name: 'gemini-2.0-flash',
      provider_name: 'Google',
      calls: 100,
      tokens_input: 30000,
      tokens_output: 15000,
      cost: 0.0800,
    },
    {
      model_name: 'gpt-4o-mini',
      provider_name: 'OpenAI',
      calls: 50,
      tokens_input: 20000,
      tokens_output: 10000,
      cost: 0.0434,
    },
  ],
  by_hour: [
    { hour: '2024-01-15T10:00:00', tokens_input: 5000, tokens_output: 2500, cost: 0.01 },
    { hour: '2024-01-15T11:00:00', tokens_input: 8000, tokens_output: 4000, cost: 0.015 },
    { hour: '2024-01-15T12:00:00', tokens_input: 3000, tokens_output: 1500, cost: 0.008 },
  ],
  by_source: [
    { source: 'chat', calls: 100, tokens_input: 35000, tokens_output: 17000, cost: 0.08 },
    { source: 'catalog', calls: 50, tokens_input: 15000, tokens_output: 8000, cost: 0.04 },
  ],
};

describe('UsageTab', () => {
  const defaultProps = {
    costs: mockCosts,
    costsPeriod: 7,
    onPeriodChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering with data', () => {
    it('should render total stats', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('Calls:')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('50.0k')).toBeInTheDocument(); // Input
      expect(screen.getByText('25.0k')).toBeInTheDocument(); // Output
      expect(screen.getByText('$0.1234')).toBeInTheDocument(); // Cost
    });

    it('should render model table', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
      expect(screen.getByText('Google')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    it('should render source table', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('Usage by Source')).toBeInTheDocument();
      expect(screen.getByText('chat')).toBeInTheDocument();
      expect(screen.getByText('catalog')).toBeInTheDocument();
    });

    it('should render chart', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('should render period selector with current value', () => {
      render(<UsageTab {...defaultProps} />);

      // Check for 7 days option text
      expect(screen.getByText('7 days')).toBeInTheDocument();
    });

    it('should render model filter', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('All models')).toBeInTheDocument();
    });
  });

  describe('No data state', () => {
    it('should show no data message when costs is null', () => {
      render(<UsageTab {...defaultProps} costs={null} />);

      expect(screen.getByText('No usage data')).toBeInTheDocument();
    });

    it('should show no data message when total calls is 0', () => {
      const emptyCosts: LLMCosts = {
        total: {
          total_calls: 0,
          total_tokens_input: 0,
          total_tokens_output: 0,
          total_cost: 0,
        },
        by_model: [],
        by_hour: [],
        by_source: [],
      };

      render(<UsageTab {...defaultProps} costs={emptyCosts} />);

      expect(screen.getByText('No usage data')).toBeInTheDocument();
    });
  });

  describe('Chart metric toggle', () => {
    it('should show Tokens/heure by default', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('Tokens / heure')).toBeInTheDocument();
    });

    it('should switch to cost view when clicking Cost button', () => {
      render(<UsageTab {...defaultProps} />);

      const costButton = screen.getByRole('button', { name: 'Cost' });
      fireEvent.click(costButton);

      expect(screen.getByText('Coût / heure ($)')).toBeInTheDocument();
    });

    it('should switch back to tokens view when clicking Tokens button', () => {
      render(<UsageTab {...defaultProps} />);

      // Switch to cost first
      const costButton = screen.getByRole('button', { name: 'Cost' });
      fireEvent.click(costButton);

      // Then back to tokens
      const tokensButton = screen.getByRole('button', { name: 'Tokens' });
      fireEvent.click(tokensButton);

      expect(screen.getByText('Tokens / heure')).toBeInTheDocument();
    });
  });

  describe('Model filtering', () => {
    it('should display model options in selector', () => {
      render(<UsageTab {...defaultProps} />);

      // Check that All models is displayed initially
      expect(screen.getByText('All models')).toBeInTheDocument();
    });

    it('should show all stats when All models is selected', () => {
      render(<UsageTab {...defaultProps} />);

      // Should show total calls in the header stats
      const statsSection = screen.getByText('Calls:').parentElement?.parentElement;
      expect(statsSection).toHaveTextContent('150');
    });
  });

  describe('Period selector', () => {
    it('should display current period', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('7 days')).toBeInTheDocument();
    });

    it('should render period selector as combobox', () => {
      render(<UsageTab {...defaultProps} />);

      const comboboxes = screen.getAllByRole('combobox');
      // Two comboboxes: model filter and period selector
      expect(comboboxes.length).toBe(2);
    });
  });

  describe('Table data formatting', () => {
    it('should format tokens as k values in model table', () => {
      render(<UsageTab {...defaultProps} />);

      // gemini model: 30000 input -> 30.0k (multiple 30.0k may exist)
      expect(screen.getAllByText('30.0k').length).toBeGreaterThan(0);
      // gemini model: 15000 output -> 15.0k
      expect(screen.getAllByText('15.0k').length).toBeGreaterThan(0);
    });

    it('should format cost with 4 decimal places in model table', () => {
      render(<UsageTab {...defaultProps} />);

      // Multiple elements may have $0.0800 (model + source tables)
      expect(screen.getAllByText('$0.0800').length).toBeGreaterThan(0);
      expect(screen.getByText('$0.0434')).toBeInTheDocument();
    });

    it('should display model call counts', () => {
      render(<UsageTab {...defaultProps} />);

      // gemini: 100 calls, gpt: 50 calls (also appears in source table)
      expect(screen.getAllByText('100').length).toBeGreaterThan(0);
      expect(screen.getAllByText('50').length).toBeGreaterThan(0);
    });
  });

  describe('Source table', () => {
    it('should not render source table when by_source is empty', () => {
      const costsNoSource: LLMCosts = {
        ...mockCosts,
        by_source: [],
      };

      render(<UsageTab {...defaultProps} costs={costsNoSource} />);

      expect(screen.queryByText('Usage by Source')).not.toBeInTheDocument();
    });

    it('should render source table with correct data', () => {
      render(<UsageTab {...defaultProps} />);

      expect(screen.getByText('Usage by Source')).toBeInTheDocument();
      expect(screen.getByText('chat')).toBeInTheDocument();
      expect(screen.getByText('catalog')).toBeInTheDocument();
    });
  });
});
