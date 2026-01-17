/**
 * Tests for DataTable component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '@/components/DataTable';

// Mock XLSX
jest.mock('xlsx', () => ({
  utils: {
    json_to_sheet: jest.fn(() => ({})),
    book_new: jest.fn(() => ({})),
    book_append_sheet: jest.fn(),
  },
  writeFile: jest.fn(),
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  FilterIcon: ({ size }: { size: number }) => <span data-testid="filter-icon" />,
  SortIcon: ({ size }: { size: number }) => <span data-testid="sort-icon" />,
  SortAscIcon: ({ size }: { size: number }) => <span data-testid="sort-asc-icon" />,
  SortDescIcon: ({ size }: { size: number }) => <span data-testid="sort-desc-icon" />,
  ChevronLeftIcon: ({ size }: { size: number }) => <span data-testid="chevron-left" />,
  ChevronRightIcon: ({ size }: { size: number }) => <span data-testid="chevron-right" />,
  DownloadIcon: ({ size }: { size: number }) => <span data-testid="download-icon" />,
  ChevronDownIcon: ({ size }: { size: number }) => <span data-testid="chevron-down" />,
}));

// Mock useTranslation
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'table.no_data': 'No data available',
      'table.no_results': 'No results found',
      'table.filter_placeholder': 'Filter...',
      'common.filters': 'Filters',
      'common.clear': 'Clear',
      'common.results': 'results',
      'common.export': 'Export',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.page_of': `Page ${params?.current || 1} of ${params?.total || 1}`,
    };
    return translations[key] || key;
  },
}));

describe('DataTable', () => {
  const sampleData = [
    { id: 1, name: 'Alice', age: 30, active: true },
    { id: 2, name: 'Bob', age: 25, active: false },
    { id: 3, name: 'Charlie', age: 35, active: true },
  ];

  describe('Empty state', () => {
    it('shows no data message when data is empty', () => {
      render(<DataTable data={[]} />);

      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('shows no data message when data is undefined', () => {
      render(<DataTable data={undefined as unknown as Record<string, unknown>[]} />);

      expect(screen.getByText('No data available')).toBeInTheDocument();
    });
  });

  describe('Basic rendering', () => {
    it('renders table with data', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders column headers from data keys', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('age')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('renders data rows', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('formats boolean values', () => {
      render(<DataTable data={sampleData} />);

      // active: true should show "Yes", active: false should show "No"
      expect(screen.getAllByText('Yes')).toHaveLength(2);
      expect(screen.getAllByText('No')).toHaveLength(1);
    });

    it('formats numbers with locale', () => {
      const dataWithLargeNumbers = [{ count: 1000000 }];
      render(<DataTable data={dataWithLargeNumbers} />);

      // French locale uses space as thousand separator
      expect(screen.getByText(/1.*000.*000/)).toBeInTheDocument();
    });
  });

  describe('Toolbar', () => {
    it('renders filter button', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('renders export button', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('shows result count', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('3 results')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('shows filter row when filter button clicked', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Filters'));

      // Should show filter inputs
      expect(screen.getAllByPlaceholderText('Filter...')).toHaveLength(4);
    });

    it('filters data when filter value entered', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Filters'));

      // Find filter input for name column
      const filterInputs = screen.getAllByPlaceholderText('Filter...');
      await user.type(filterInputs[1], 'Alice');

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      });
    });

    it('shows clear button when filters active', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Filters'));
      const filterInputs = screen.getAllByPlaceholderText('Filter...');
      await user.type(filterInputs[0], '1');

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });
    });

    it('clears filters when clear button clicked', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Filters'));
      const filterInputs = screen.getAllByPlaceholderText('Filter...');
      await user.type(filterInputs[1], 'Alice');

      await waitFor(() => {
        expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      });

      await user.click(screen.getByText('Clear'));

      await waitFor(() => {
        expect(screen.getByText('Bob')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('sorts column when header clicked', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      // Click on 'name' header to sort
      await user.click(screen.getByText('name'));

      // Should show sort ascending icon
      expect(screen.getByTestId('sort-asc-icon')).toBeInTheDocument();
    });

    it('toggles sort direction on second click', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      const nameHeader = screen.getByText('name');

      // First click - ascending
      await user.click(nameHeader);
      expect(screen.getByTestId('sort-asc-icon')).toBeInTheDocument();

      // Second click - descending
      await user.click(nameHeader);
      expect(screen.getByTestId('sort-desc-icon')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows page info', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
    });

    it('shows page size selector', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByText('25 / page')).toBeInTheDocument();
    });

    it('renders pagination buttons', () => {
      render(<DataTable data={sampleData} />);

      expect(screen.getByTestId('chevron-left')).toBeInTheDocument();
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      render(<DataTable data={sampleData} />);

      const prevButton = screen.getByTestId('chevron-left').closest('button');
      expect(prevButton).toBeDisabled();
    });
  });

  describe('Export', () => {
    it('opens export dropdown when clicked', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Export'));

      await waitFor(() => {
        expect(screen.getByText('CSV (.csv)')).toBeInTheDocument();
        expect(screen.getByText('Excel (.xlsx)')).toBeInTheDocument();
      });
    });

    it('exports to CSV when option selected', async () => {
      const XLSX = await import('xlsx');
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Export'));
      await user.click(screen.getByText('CSV (.csv)'));

      expect(XLSX.writeFile).toHaveBeenCalled();
    });

    it('exports to Excel when option selected', async () => {
      const XLSX = await import('xlsx');
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Export'));
      await user.click(screen.getByText('Excel (.xlsx)'));

      expect(XLSX.writeFile).toHaveBeenCalled();
    });
  });

  describe('Value formatting', () => {
    it('shows dash for null values', () => {
      const dataWithNull = [{ name: null }];
      render(<DataTable data={dataWithNull} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('shows dash for undefined values', () => {
      const dataWithUndefined = [{ name: undefined }];
      render(<DataTable data={dataWithUndefined} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('truncates long strings', () => {
      const longString = 'A'.repeat(150);
      const dataWithLongString = [{ description: longString }];
      render(<DataTable data={dataWithLongString} />);

      // Should be truncated to 100 chars + "..."
      const truncated = screen.getByText(/A{100}\.\.\.$/);
      expect(truncated).toBeInTheDocument();
    });

    it('formats decimal numbers', () => {
      const dataWithDecimal = [{ value: 123.456 }];
      render(<DataTable data={dataWithDecimal} />);

      expect(screen.getByText('123.46')).toBeInTheDocument();
    });
  });

  describe('No results state', () => {
    it('shows no results message when all data filtered out', async () => {
      const user = userEvent.setup();
      render(<DataTable data={sampleData} />);

      await user.click(screen.getByText('Filters'));
      const filterInputs = screen.getAllByPlaceholderText('Filter...');
      await user.type(filterInputs[1], 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });
  });
});
