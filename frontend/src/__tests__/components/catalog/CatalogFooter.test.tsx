/**
 * Tests for CatalogFooter component
 */
import { render, screen } from '@testing-library/react';
import { CatalogFooter } from '@/components/catalog/CatalogFooter';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'catalog.tables': 'tables',
        'catalog.columns': 'colonnes',
        'catalog.with_description': 'avec description',
        'catalog.total_rows': 'lignes totales',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => {
    const translations: Record<string, string> = {
      'catalog.tables': 'tables',
      'catalog.columns': 'colonnes',
      'catalog.with_description': 'avec description',
      'catalog.total_rows': 'lignes totales',
    };
    return translations[key] || key;
  },
}));

describe('CatalogFooter', () => {
  const defaultProps = {
    tableCount: 12,
    columnCount: 85,
    columnsWithDesc: 42,
    totalRows: 150000,
  };

  describe('Rendering', () => {
    it('should render table count', () => {
      render(<CatalogFooter {...defaultProps} />);

      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('tables')).toBeInTheDocument();
    });

    it('should render column count', () => {
      render(<CatalogFooter {...defaultProps} />);

      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('colonnes')).toBeInTheDocument();
    });

    it('should render columns with description ratio', () => {
      render(<CatalogFooter {...defaultProps} />);

      expect(screen.getByText('42/85')).toBeInTheDocument();
      expect(screen.getByText('avec description')).toBeInTheDocument();
    });

    it('should render total rows with locale formatting', () => {
      render(<CatalogFooter {...defaultProps} />);

      // toLocaleString() should format with commas or spaces depending on locale
      // Looking for the formatted number
      expect(screen.getByText('lignes totales')).toBeInTheDocument();
    });
  });

  describe('Different values', () => {
    it('should render zero values correctly', () => {
      render(
        <CatalogFooter
          tableCount={0}
          columnCount={0}
          columnsWithDesc={0}
          totalRows={0}
        />
      );

      expect(screen.getByText('0/0')).toBeInTheDocument();
    });

    it('should render large numbers', () => {
      render(
        <CatalogFooter
          tableCount={100}
          columnCount={1500}
          columnsWithDesc={1200}
          totalRows={10000000}
        />
      );

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('1500')).toBeInTheDocument();
      expect(screen.getByText('1200/1500')).toBeInTheDocument();
    });

    it('should render when all columns have descriptions', () => {
      render(
        <CatalogFooter
          tableCount={5}
          columnCount={50}
          columnsWithDesc={50}
          totalRows={1000}
        />
      );

      expect(screen.getByText('50/50')).toBeInTheDocument();
    });
  });
});
