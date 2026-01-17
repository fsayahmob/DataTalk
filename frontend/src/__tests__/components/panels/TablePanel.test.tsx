/**
 * Tests for TablePanel component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { TablePanel } from '@/components/panels/TablePanel';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string, vars?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'visualization.no_data': 'Aucune donnée',
      'visualization.data_rows': `${vars?.count || 0} lignes`,
      'common.fullscreen': 'Plein écran',
      'common.exit_fullscreen': 'Quitter le plein écran',
    };
    return translations[key] || key;
  },
}));

// Mock DataTable component
jest.mock('@/components/DataTable', () => ({
  DataTable: ({ data }: { data: Record<string, unknown>[] }) => (
    <table data-testid="data-table">
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {Object.values(row).map((val, j) => (
              <td key={j}>{String(val)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe('TablePanel', () => {
  const mockData = [
    { id: 1, name: 'Alice', score: 95 },
    { id: 2, name: 'Bob', score: 87 },
    { id: 3, name: 'Charlie', score: 92 },
  ];

  describe('Rendering', () => {
    it('should render the data table when data is provided', () => {
      render(<TablePanel data={mockData} />);

      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    it('should show row count', () => {
      render(<TablePanel data={mockData} />);

      expect(screen.getByText('3 lignes')).toBeInTheDocument();
    });

    it('should render fullscreen button', () => {
      render(<TablePanel data={mockData} />);

      expect(screen.getByText('Plein écran')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty message when data is empty array', () => {
      render(<TablePanel data={[]} />);

      expect(screen.getByText('Aucune donnée')).toBeInTheDocument();
    });

    it('should show 0 rows count when data is empty', () => {
      render(<TablePanel data={[]} />);

      expect(screen.getByText('0 lignes')).toBeInTheDocument();
    });
  });

  describe('Fullscreen mode', () => {
    it('should enter fullscreen when button is clicked', () => {
      render(<TablePanel data={mockData} />);

      fireEvent.click(screen.getByText('Plein écran'));

      expect(screen.getByText('Quitter le plein écran')).toBeInTheDocument();
    });

    it('should still show data in fullscreen mode', () => {
      render(<TablePanel data={mockData} />);

      fireEvent.click(screen.getByText('Plein écran'));

      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    it('should still show row count in fullscreen mode', () => {
      render(<TablePanel data={mockData} />);

      fireEvent.click(screen.getByText('Plein écran'));

      expect(screen.getByText('3 lignes')).toBeInTheDocument();
    });

    it('should exit fullscreen when exit button is clicked', () => {
      render(<TablePanel data={mockData} />);

      // Enter fullscreen
      fireEvent.click(screen.getByText('Plein écran'));
      expect(screen.getByText('Quitter le plein écran')).toBeInTheDocument();

      // Exit fullscreen
      fireEvent.click(screen.getByText('Quitter le plein écran'));
      expect(screen.getByText('Plein écran')).toBeInTheDocument();
    });
  });

  describe('Data display', () => {
    it('should display data values in table', () => {
      render(<TablePanel data={mockData} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('should handle numeric data', () => {
      render(<TablePanel data={mockData} />);

      expect(screen.getByText('95')).toBeInTheDocument();
      expect(screen.getByText('87')).toBeInTheDocument();
      expect(screen.getByText('92')).toBeInTheDocument();
    });
  });
});
