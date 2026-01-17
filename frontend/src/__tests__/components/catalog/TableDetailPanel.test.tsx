/**
 * Tests for TableDetailPanel component
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableDetailPanel } from '@/components/catalog/TableDetailPanel';
import type { CatalogTable } from '@/lib/api';
import * as api from '@/lib/api';
import { toast } from 'sonner';

// Mock API
jest.mock('@/lib/api', () => ({
  fetchCatalogContextMode: jest.fn(),
  updateColumnDescription: jest.fn(),
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock CloseIcon
jest.mock('@/components/icons', () => ({
  CloseIcon: ({ size: _size }: { size: number }) => <span data-testid="close-icon">X</span>,
}));

// Mock useTranslation
const translations: Record<string, string> = {
  'catalog.excluded': 'Excluded', 'catalog.not_enriched': 'Not enriched',
  'catalog.not_enriched_warning': 'This table has not been enriched yet.',
  'catalog.include_enrichment': 'Include in enrichment',
  'catalog.will_be_enriched': 'Will be enriched by LLM',
  'catalog.excluded_from_enrichment': 'Excluded from LLM enrichment',
  'catalog.description_empty': 'Description cannot be empty',
  'catalog.description_updated': 'Description updated',
  'catalog.update_error': 'Failed to update description',
  'catalog.column': 'Column', 'catalog.type': 'Type', 'catalog.description': 'Description',
  'catalog.add_description': 'Add description...', 'catalog.click_to_edit': 'Click to edit',
  'catalog.value_analysis': 'Value Analysis',
  'catalog.full_stats_sent': 'Full statistics will be sent',
  'catalog.compact_stats_sent': 'Compact statistics will be sent',
  'common.rows': 'rows', 'prompts.mode_label': 'Mode: full',
};
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] || key }),
}));

describe('TableDetailPanel', () => {
  const mockOnClose = jest.fn();
  const mockOnTableToggle = jest.fn();

  const createTable = (overrides: Partial<CatalogTable> = {}): CatalogTable => ({
    id: 1,
    name: 'users',
    description: 'User accounts table',
    row_count: 1500,
    is_enabled: true,
    columns: [
      { id: 1, name: 'id', data_type: 'INTEGER', description: 'Primary key', sample_values: null, full_context: null, value_range: null },
      { id: 2, name: 'name', data_type: 'VARCHAR(255)', description: null, sample_values: null, full_context: null, value_range: null },
      { id: 3, name: 'email', data_type: 'VARCHAR(255)', description: 'User email address', sample_values: null, full_context: null, value_range: null },
    ],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (api.fetchCatalogContextMode as jest.Mock).mockResolvedValue('full');
  });

  describe('Basic rendering', () => {
    it('renders table info, columns and close button', () => {
      render(
        <TableDetailPanel table={createTable()} onClose={mockOnClose} onTableToggle={mockOnTableToggle} />
      );
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText(/1,500/)).toBeInTheDocument();
      expect(screen.getByText('User accounts table')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByTestId('close-icon')).toBeInTheDocument();
    });
  });

  describe('Close functionality', () => {
    it('calls onClose when close button clicked', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Find the close button by its icon
      const closeIcon = screen.getByTestId('close-icon');
      const closeButton = closeIcon.closest('button');
      expect(closeButton).not.toBeNull();
      await user.click(closeButton!);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Enable/Disable toggle', () => {
    it('calls onTableToggle when toggle clicked', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable({ is_enabled: true })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Find the toggle - it's in the section with "Include in enrichment" text
      const toggleSection = screen.getByText('Include in enrichment').parentElement?.parentElement;
      const toggleButton = toggleSection?.querySelector('button:not([data-slot="button"])');
      expect(toggleButton).not.toBeNull();
      await user.click(toggleButton!);

      expect(mockOnTableToggle).toHaveBeenCalledWith(1, false);
    });

    it('shows excluded badge when disabled', () => {
      render(
        <TableDetailPanel
          table={createTable({ is_enabled: false })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Look for the specific "Excluded" badge text (exact match)
      expect(screen.getByText('Excluded')).toBeInTheDocument();
    });

    it('shows correct toggle state text when enabled', () => {
      render(
        <TableDetailPanel
          table={createTable({ is_enabled: true })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Should show that it will be enriched
      expect(screen.getByText('Will be enriched by LLM')).toBeInTheDocument();
    });
  });

  describe('Not enriched state', () => {
    it('shows not enriched badge when enabled but no description', () => {
      render(
        <TableDetailPanel
          table={createTable({ is_enabled: true, description: null })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      expect(screen.getByText('Not enriched')).toBeInTheDocument();
    });

    it('shows warning message when not enriched', () => {
      render(
        <TableDetailPanel
          table={createTable({ is_enabled: true, description: null })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Should show a warning about not being enriched
      expect(screen.getByText('This table has not been enriched yet.')).toBeInTheDocument();
    });
  });

  describe('Column description editing', () => {
    it('shows add description text when column has no description', () => {
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // The 'name' column has no description
      expect(screen.getByText('Add description...')).toBeInTheDocument();
    });

    it('shows column description when present', () => {
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      expect(screen.getByText('Primary key')).toBeInTheDocument();
      expect(screen.getByText('User email address')).toBeInTheDocument();
    });

    it('enters edit mode when clicking on description', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('Primary key');
    });

    it('saves description on Enter key', async () => {
      const user = userEvent.setup();
      (api.updateColumnDescription as jest.Mock).mockResolvedValue(true);

      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'New description{Enter}');

      await waitFor(() => {
        expect(api.updateColumnDescription).toHaveBeenCalledWith(1, 'New description');
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it('cancels edit on Escape key', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows error toast when description is empty', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '{Enter}');

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('shows error toast when API call fails', async () => {
      const user = userEvent.setup();
      (api.updateColumnDescription as jest.Mock).mockResolvedValue(false);

      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'New description{Enter}');

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('cancels edit when cancel button clicked', async () => {
      const user = userEvent.setup();
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      // Click cancel button (✗)
      await user.click(screen.getByText('✗'));

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves when save button clicked', async () => {
      const user = userEvent.setup();
      (api.updateColumnDescription as jest.Mock).mockResolvedValue(true);

      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await user.click(screen.getByText('Primary key'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Updated description');

      // Click save button (✓)
      await user.click(screen.getByText('✓'));

      await waitFor(() => {
        expect(api.updateColumnDescription).toHaveBeenCalledWith(1, 'Updated description');
      });
    });
  });

  describe('Context mode display', () => {
    it('fetches and displays context mode', async () => {
      (api.fetchCatalogContextMode as jest.Mock).mockResolvedValue('full');

      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await waitFor(() => {
        expect(api.fetchCatalogContextMode).toHaveBeenCalled();
      });
    });

    it('displays column value analysis section', async () => {
      render(
        <TableDetailPanel
          table={createTable({
            columns: [
              {
                id: 1,
                name: 'rating',
                data_type: 'INTEGER',
                description: null,
                sample_values: null,
                value_range: '1-5',
                full_context: 'Integer values from 1 to 5',
              },
            ],
          })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Value Analysis')).toBeInTheDocument();
      });
    });
  });

  describe('Column data types', () => {
    it('displays column types without parentheses', () => {
      render(
        <TableDetailPanel
          table={createTable()}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      expect(screen.getByText('INTEGER')).toBeInTheDocument();
      // Multiple VARCHAR columns exist
      expect(screen.getAllByText('VARCHAR')).toHaveLength(2);
      // Should not show VARCHAR(255) - parentheses should be stripped
      expect(screen.queryByText('VARCHAR(255)')).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles table without id (disable toggle)', () => {
      const tableWithoutId = createTable();
      delete (tableWithoutId as { id?: number }).id;

      render(
        <TableDetailPanel
          table={tableWithoutId}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      // Find the toggle button in the toggle section
      const toggleSection = screen.getByText('Include in enrichment').parentElement?.parentElement;
      const toggleButton = toggleSection?.querySelector('button:not([data-slot="button"])') as HTMLButtonElement;
      expect(toggleButton).not.toBeNull();
      expect(toggleButton).toBeDisabled();
    });

    it('handles zero row count', () => {
      render(
        <TableDetailPanel
          table={createTable({ row_count: 0 })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      expect(screen.getByText(/0.*rows/i)).toBeInTheDocument();
    });

    it('handles null row count', () => {
      render(
        <TableDetailPanel
          table={createTable({ row_count: null })}
          onClose={mockOnClose}
          onTableToggle={mockOnTableToggle}
        />
      );

      expect(screen.getByText(/0.*rows/i)).toBeInTheDocument();
    });
  });
});
