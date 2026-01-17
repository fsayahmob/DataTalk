/**
 * Tests for CatalogEmptyState component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogEmptyState } from '@/components/catalog/CatalogEmptyState';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'catalog.no_catalog': 'Aucun catalogue',
        'catalog.extract_schema': 'Extraire le schéma',
        'common.extracting': 'Extraction en cours...',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => {
    const translations: Record<string, string> = {
      'catalog.no_catalog': 'Aucun catalogue',
      'catalog.extract_schema': 'Extraire le schéma',
      'common.extracting': 'Extraction en cours...',
    };
    return translations[key] || key;
  },
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  DatabaseIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="database-icon" data-size={size} className={className}>DB</span>
  ),
}));

describe('CatalogEmptyState', () => {
  const defaultProps = {
    isExtracting: false,
    onExtract: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render title', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      expect(screen.getByText('Aucun catalogue')).toBeInTheDocument();
    });

    it('should render description and button text', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      // Text appears in both description (p) and button
      expect(screen.getAllByText('Extraire le schéma').length).toBe(2);
    });

    it('should render database icon', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      const icons = screen.getAllByTestId('database-icon');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should render extract button', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Normal state', () => {
    it('should show extract text when not extracting', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      expect(screen.getByRole('button')).toHaveTextContent('Extraire le schéma');
    });

    it('should enable button when not extracting', () => {
      render(<CatalogEmptyState {...defaultProps} />);

      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  describe('Extracting state', () => {
    it('should show extracting text when extracting', () => {
      render(<CatalogEmptyState {...defaultProps} isExtracting={true} />);

      expect(screen.getByRole('button')).toHaveTextContent('Extraction en cours...');
    });

    it('should disable button when extracting', () => {
      render(<CatalogEmptyState {...defaultProps} isExtracting={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should show spinner when extracting', () => {
      render(<CatalogEmptyState {...defaultProps} isExtracting={true} />);

      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onExtract when button is clicked', () => {
      const onExtract = jest.fn();
      render(<CatalogEmptyState {...defaultProps} onExtract={onExtract} />);

      fireEvent.click(screen.getByRole('button'));

      expect(onExtract).toHaveBeenCalledTimes(1);
    });

    it('should not call onExtract when extracting', () => {
      const onExtract = jest.fn();
      render(<CatalogEmptyState {...defaultProps} isExtracting={true} onExtract={onExtract} />);

      fireEvent.click(screen.getByRole('button'));

      expect(onExtract).not.toHaveBeenCalled();
    });
  });
});
