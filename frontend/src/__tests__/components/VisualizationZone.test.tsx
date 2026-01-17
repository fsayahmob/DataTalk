/**
 * Tests for VisualizationZone component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { VisualizationZone } from '@/components/VisualizationZone';
import { Message } from '@/types';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'visualization.title': 'Visualisation',
      'visualization.save': 'Sauvegarder',
      'home.welcome': 'Bienvenue',
      'home.ask_question': 'Posez une question pour commencer',
    };
    return translations[key] || key;
  },
}));

// Mock child components
jest.mock('@/components/panels', () => ({
  FiltersPanel: ({ filters, onFiltersChange }: {
    filters: { dateStart: string; dateEnd: string; noteMin: string; noteMax: string };
    onFiltersChange: (f: typeof filters) => void;
  }) => (
    <div data-testid="filters-panel">
      <button onClick={() => onFiltersChange({ ...filters, dateStart: '2024-01-01' })}>
        Change Filter
      </button>
    </div>
  ),
  SQLPanel: ({ sql }: { sql: string }) => (
    <div data-testid="sql-panel">{sql}</div>
  ),
  ChartPanel: ({ config, data }: { config: unknown; data: unknown[] }) => (
    <div data-testid="chart-panel">Chart with {data.length} items</div>
  ),
  TablePanel: ({ data }: { data: unknown[] }) => (
    <div data-testid="table-panel">{data.length} rows</div>
  ),
}));

jest.mock('@/components/ErrorDisplay', () => ({
  ErrorDisplay: ({ error, sql }: { error: string; sql?: string }) => (
    <div data-testid="error-display">
      Error: {error}
      {sql && <pre>{sql}</pre>}
    </div>
  ),
}));

describe('VisualizationZone', () => {
  const defaultFilters = {
    dateStart: '',
    dateEnd: '',
    noteMin: '',
    noteMax: '',
  };

  const defaultProps = {
    selectedMessage: null,
    onSaveReport: jest.fn(),
    filters: defaultFilters,
    onFiltersChange: jest.fn(),
  };

  const mockMessage: Message = {
    id: 1,
    role: 'assistant',
    content: 'Analysis result',
    sql: 'SELECT * FROM users',
    chart: { type: 'bar', x: 'name', y: 'value', title: 'Test Chart' },
    data: [{ name: 'A', value: 10 }, { name: 'B', value: 20 }],
    model_name: 'gemini-2.0-flash',
    response_time_ms: 1500,
    tokens_input: 50,
    tokens_output: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should show welcome message when no message selected', () => {
      render(<VisualizationZone {...defaultProps} />);

      expect(screen.getByText('Bienvenue')).toBeInTheDocument();
      expect(screen.getByText('Posez une question pour commencer')).toBeInTheDocument();
    });

    it('should not show save button when no message', () => {
      render(<VisualizationZone {...defaultProps} />);

      expect(screen.queryByText('Sauvegarder')).not.toBeInTheDocument();
    });

    it('should still show filters panel in empty state', () => {
      render(<VisualizationZone {...defaultProps} />);

      expect(screen.getByTestId('filters-panel')).toBeInTheDocument();
    });
  });

  describe('With selected message', () => {
    it('should render SQL panel', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByTestId('sql-panel')).toBeInTheDocument();
      expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();
    });

    it('should render chart panel', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByTestId('chart-panel')).toBeInTheDocument();
      expect(screen.getByText('Chart with 2 items')).toBeInTheDocument();
    });

    it('should render table panel', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByTestId('table-panel')).toBeInTheDocument();
      expect(screen.getByText('2 rows')).toBeInTheDocument();
    });

    it('should show save button when message has SQL', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
    });

    it('should call onSaveReport when save button is clicked', () => {
      const onSaveReport = jest.fn();
      render(
        <VisualizationZone
          {...defaultProps}
          selectedMessage={mockMessage}
          onSaveReport={onSaveReport}
        />
      );

      fireEvent.click(screen.getByText('Sauvegarder'));

      expect(onSaveReport).toHaveBeenCalled();
    });

    it('should show model metadata', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByText(/gemini-2.0-flash/)).toBeInTheDocument();
      expect(screen.getByText(/1500ms/)).toBeInTheDocument();
    });

    it('should show token counts', () => {
      render(<VisualizationZone {...defaultProps} selectedMessage={mockMessage} />);

      expect(screen.getByText(/↑50/)).toBeInTheDocument();
      expect(screen.getByText(/↓100/)).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error display when sql_error is present', () => {
      const errorMessage: Message = {
        ...mockMessage,
        sql_error: 'Table not found',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={errorMessage} />);

      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByText(/Table not found/)).toBeInTheDocument();
    });

    it('should not show chart/table panels when there is an error', () => {
      const errorMessage: Message = {
        ...mockMessage,
        sql_error: 'Error occurred',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={errorMessage} />);

      expect(screen.queryByTestId('chart-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('table-panel')).not.toBeInTheDocument();
    });
  });

  describe('Chart disabled state', () => {
    it('should show warning when chart is disabled', () => {
      const disabledChartMessage: Message = {
        ...mockMessage,
        chart_disabled: true,
        chart_disabled_reason: 'Too many data points',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={disabledChartMessage} />);

      expect(screen.getByText('Too many data points')).toBeInTheDocument();
    });

    it('should not show chart panel when disabled', () => {
      const disabledChartMessage: Message = {
        ...mockMessage,
        chart_disabled: true,
        chart_disabled_reason: 'Chart disabled',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={disabledChartMessage} />);

      expect(screen.queryByTestId('chart-panel')).not.toBeInTheDocument();
    });
  });

  describe('No SQL message', () => {
    it('should not show save button when message has no SQL', () => {
      const noSqlMessage: Message = {
        id: 1,
        role: 'assistant',
        content: 'Just text response',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={noSqlMessage} />);

      expect(screen.queryByText('Sauvegarder')).not.toBeInTheDocument();
    });

    it('should not show SQL panel when no SQL', () => {
      const noSqlMessage: Message = {
        id: 1,
        role: 'assistant',
        content: 'Just text response',
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={noSqlMessage} />);

      expect(screen.queryByTestId('sql-panel')).not.toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    it('should call onFiltersChange when filters are changed', () => {
      const onFiltersChange = jest.fn();
      render(<VisualizationZone {...defaultProps} onFiltersChange={onFiltersChange} />);

      fireEvent.click(screen.getByText('Change Filter'));

      expect(onFiltersChange).toHaveBeenCalled();
    });
  });

  describe('Chart type none', () => {
    it('should not show chart panel when chart type is none', () => {
      const noneChartMessage: Message = {
        ...mockMessage,
        chart: { type: 'none', x: '', y: '', title: '' },
      };

      render(<VisualizationZone {...defaultProps} selectedMessage={noneChartMessage} />);

      expect(screen.queryByTestId('chart-panel')).not.toBeInTheDocument();
    });
  });
});
