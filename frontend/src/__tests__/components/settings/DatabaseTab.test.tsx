/**
 * Tests for DatabaseTab component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DatabaseTab } from '@/components/settings/DatabaseTab';
import * as api from '@/lib/api';

// Mock API
jest.mock('@/lib/api', () => ({
  fetchDatabaseStatus: jest.fn(),
  fetchMaxTablesPerBatch: jest.fn(),
  fetchMaxChartRows: jest.fn(),
  setDuckdbPath: jest.fn(),
  setMaxTablesPerBatch: jest.fn(),
  setMaxChartRows: jest.fn(),
}));

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'common.edit': 'Modifier',
        'common.cancel': 'Annuler',
        'common.tables_per_batch': 'tables par batch',
        'common.rows': 'lignes',
        'common.error': 'Erreur',
        'settings.path_required': 'Chemin requis',
        'settings.db_connected': `Connecté à ${vars?.path || ''}`,
        'settings.batch_size_updated': `Batch mis à jour: ${vars?.value || ''}`,
        'settings.chart_rows_updated': `Lignes max: ${vars?.value || ''}`,
        'settings.save_error': 'Erreur de sauvegarde',
        'settings.batch_size_help': 'Nombre de tables par batch',
        'settings.max_chart_rows_help': 'Lignes max pour les graphiques',
        'validation.range_error': `Entre ${vars?.min || ''} et ${vars?.max || ''}`,
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => key,
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Import the mocked toast after mocking
import { toast } from 'sonner';

const mockStatus = {
  status: 'connected' as const,
  path: '/data/test.duckdb',
  configured_path: '/data/test.duckdb',
  engine: 'DuckDB',
};

describe('DatabaseTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.fetchDatabaseStatus as jest.Mock).mockResolvedValue(mockStatus);
    (api.fetchMaxTablesPerBatch as jest.Mock).mockResolvedValue(15);
    (api.fetchMaxChartRows as jest.Mock).mockResolvedValue(5000);
  });

  describe('Loading state', () => {
    it('should show loading spinner initially', () => {
      // Keep the promise pending
      (api.fetchDatabaseStatus as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<DatabaseTab />);

      // Check for the spinner element by class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Rendering', () => {
    it('should render database status after loading', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('DuckDB')).toBeInTheDocument();
      });

      expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      expect(screen.getByText('connected')).toBeInTheDocument();
    });

    it('should render batch size setting', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });
    });

    it('should render max chart rows setting', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/5.*000.*lignes/i)).toBeInTheDocument();
      });
    });

    it('should render catalog link', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/View semantic catalog/)).toBeInTheDocument();
      });

      const link = screen.getByRole('link', { name: /View semantic catalog/ });
      expect(link).toHaveAttribute('href', '/catalog');
    });

    it('should show disconnected status with red styling', async () => {
      (api.fetchDatabaseStatus as jest.Mock).mockResolvedValue({
        ...mockStatus,
        status: 'disconnected',
      });

      render(<DatabaseTab />);

      await waitFor(() => {
        const badge = screen.getByText('disconnected');
        expect(badge).toHaveClass('text-status-error');
      });
    });
  });

  describe('Edit database path', () => {
    it('should enter edit mode when Edit button is clicked', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });

      // Find first "Modifier" button (for file path)
      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      expect(screen.getByPlaceholderText('data/g7_analytics.duckdb')).toBeInTheDocument();
    });

    it('should cancel editing and restore original value', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      const input = screen.getByPlaceholderText('data/g7_analytics.duckdb');
      fireEvent.change(input, { target: { value: '/new/path.duckdb' } });

      fireEvent.click(screen.getAllByText('Annuler')[0]);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });
    });

    it('should show error toast when path is empty', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      const input = screen.getByPlaceholderText('data/g7_analytics.duckdb');
      fireEvent.change(input, { target: { value: '   ' } });

      fireEvent.click(screen.getByText('OK'));

      expect(toast.error).toHaveBeenCalledWith('Chemin requis');
    });

    it('should save new path successfully', async () => {
      (api.setDuckdbPath as jest.Mock).mockResolvedValue({
        success: true,
        resolved_path: '/absolute/path/test.duckdb',
      });

      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      const input = screen.getByPlaceholderText('data/g7_analytics.duckdb');
      fireEvent.change(input, { target: { value: '/new/path.duckdb' } });

      fireEvent.click(screen.getByText('OK'));

      await waitFor(() => {
        expect(api.setDuckdbPath).toHaveBeenCalledWith('/new/path.duckdb');
      });

      expect(toast.success).toHaveBeenCalled();
    });

    it('should show error toast when save fails', async () => {
      (api.setDuckdbPath as jest.Mock).mockResolvedValue({
        success: false,
        error: 'File not found',
      });

      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('/data/test.duckdb')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      const input = screen.getByPlaceholderText('data/g7_analytics.duckdb');
      fireEvent.change(input, { target: { value: '/invalid/path.duckdb' } });

      fireEvent.click(screen.getByText('OK'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('File not found');
      });
    });
  });

  describe('Edit batch size', () => {
    it('should enter edit mode for batch size', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });

      // Find batch size edit button (second Modifier)
      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[1]);

      const input = screen.getByDisplayValue('15');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should validate batch size range', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[1]);

      const input = screen.getByDisplayValue('15');
      fireEvent.change(input, { target: { value: '100' } });

      const okButtons = screen.getAllByText('OK');
      fireEvent.click(okButtons[0]);

      expect(toast.error).toHaveBeenCalledWith('Entre 1 et 50');
    });

    it('should save valid batch size', async () => {
      (api.setMaxTablesPerBatch as jest.Mock).mockResolvedValue(true);

      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[1]);

      const input = screen.getByDisplayValue('15');
      fireEvent.change(input, { target: { value: '25' } });

      const okButtons = screen.getAllByText('OK');
      fireEvent.click(okButtons[0]);

      await waitFor(() => {
        expect(api.setMaxTablesPerBatch).toHaveBeenCalledWith(25);
      });

      expect(toast.success).toHaveBeenCalled();
    });

    it('should cancel batch size editing', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[1]);

      const input = screen.getByDisplayValue('15');
      fireEvent.change(input, { target: { value: '30' } });

      const cancelButtons = screen.getAllByText('Annuler');
      fireEvent.click(cancelButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('15 tables/batch')).toBeInTheDocument();
      });
    });
  });

  describe('Edit max chart rows', () => {
    it('should enter edit mode for chart rows', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/5.*000.*lignes/i)).toBeInTheDocument();
      });

      // Find chart rows edit button (third Modifier)
      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[2]);

      const input = screen.getByDisplayValue('5000');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should validate chart rows range', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/5.*000.*lignes/i)).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[2]);

      const input = screen.getByDisplayValue('5000');
      fireEvent.change(input, { target: { value: '50' } }); // Below min

      const okButtons = screen.getAllByText('OK');
      fireEvent.click(okButtons[0]);

      expect(toast.error).toHaveBeenCalledWith('Entre 100 et 100 000');
    });

    it('should save valid chart rows', async () => {
      (api.setMaxChartRows as jest.Mock).mockResolvedValue(true);

      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/5.*000.*lignes/i)).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[2]);

      const input = screen.getByDisplayValue('5000');
      fireEvent.change(input, { target: { value: '10000' } });

      const okButtons = screen.getAllByText('OK');
      fireEvent.click(okButtons[0]);

      await waitFor(() => {
        expect(api.setMaxChartRows).toHaveBeenCalledWith(10000);
      });

      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe('Help text', () => {
    it('should display batch size help text', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/Batch Size:/)).toBeInTheDocument();
      });

      expect(screen.getByText('Nombre de tables par batch')).toBeInTheDocument();
    });

    it('should display max chart rows help text', async () => {
      render(<DatabaseTab />);

      await waitFor(() => {
        expect(screen.getByText(/Max Chart Rows:/)).toBeInTheDocument();
      });

      expect(screen.getByText('Lignes max pour les graphiques')).toBeInTheDocument();
    });
  });
});
