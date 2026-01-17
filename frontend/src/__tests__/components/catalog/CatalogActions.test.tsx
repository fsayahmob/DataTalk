/**
 * Tests for CatalogActions component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogActions } from '@/components/catalog/CatalogActions';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'catalog.extract': 'Extraire',
        'catalog.re_extract': 'Ré-extraire',
        'catalog.enrich_tables': `Enrichir ${vars?.count || 0} tables`,
        'catalog.enable_at_least_one': 'Activez au moins une table',
        'catalog.delete_confirm_title': 'Supprimer le catalogue',
        'catalog.delete_confirm_desc': 'Cette action supprimera tout le catalogue.',
        'common.extracting': 'Extraction...',
        'common.enriching': 'Enrichissement...',
        'common.deleting': 'Suppression...',
        'common.delete': 'Supprimer',
        'common.cancel': 'Annuler',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string, vars?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'catalog.extract': 'Extraire',
      'catalog.re_extract': 'Ré-extraire',
      'catalog.enrich_tables': `Enrichir ${vars?.count || 0} tables`,
      'catalog.enable_at_least_one': 'Activez au moins une table',
      'catalog.delete_confirm_title': 'Supprimer le catalogue',
      'catalog.delete_confirm_desc': 'Cette action supprimera tout le catalogue.',
      'common.extracting': 'Extraction...',
      'common.enriching': 'Enrichissement...',
      'common.deleting': 'Suppression...',
      'common.delete': 'Supprimer',
      'common.cancel': 'Annuler',
    };
    return translations[key] || key;
  },
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  DatabaseIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="database-icon" data-size={size} className={className}>DB</span>
  ),
  SparklesIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="sparkles-icon" data-size={size} className={className}>SP</span>
  ),
  TrashIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="trash-icon" data-size={size} className={className}>TR</span>
  ),
}));

describe('CatalogActions', () => {
  const defaultProps = {
    hasContent: true,
    isExtracting: false,
    isEnriching: false,
    isDeleting: false,
    onExtract: jest.fn(),
    onEnrich: jest.fn(),
    onDelete: jest.fn(),
    enabledTablesCount: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Without content', () => {
    it('should show Extract button when no content', () => {
      render(<CatalogActions {...defaultProps} hasContent={false} />);

      expect(screen.getByText('Extraire')).toBeInTheDocument();
    });

    it('should not show Enrich button when no content', () => {
      render(<CatalogActions {...defaultProps} hasContent={false} />);

      expect(screen.queryByText(/Enrichir/)).not.toBeInTheDocument();
    });

    it('should not show Delete button when no content', () => {
      render(<CatalogActions {...defaultProps} hasContent={false} />);

      expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
    });
  });

  describe('With content', () => {
    it('should show Re-extract button when has content', () => {
      render(<CatalogActions {...defaultProps} />);

      expect(screen.getByText('Ré-extraire')).toBeInTheDocument();
    });

    it('should show Enrich button with table count', () => {
      render(<CatalogActions {...defaultProps} />);

      expect(screen.getByText('Enrichir 5 tables')).toBeInTheDocument();
    });

    it('should show Delete button', () => {
      render(<CatalogActions {...defaultProps} />);

      expect(screen.getByText('Supprimer')).toBeInTheDocument();
    });
  });

  describe('Extract button', () => {
    it('should call onExtract when clicked', () => {
      const onExtract = jest.fn();
      render(<CatalogActions {...defaultProps} onExtract={onExtract} />);

      fireEvent.click(screen.getByText('Ré-extraire'));

      expect(onExtract).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when extracting', () => {
      render(<CatalogActions {...defaultProps} isExtracting={true} />);

      expect(screen.getByText('Extraction...')).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('should be disabled when extracting', () => {
      render(<CatalogActions {...defaultProps} isExtracting={true} />);

      const button = screen.getByText('Extraction...').closest('button');
      expect(button).toBeDisabled();
    });
  });

  describe('Enrich button', () => {
    it('should call onEnrich when clicked', () => {
      const onEnrich = jest.fn();
      render(<CatalogActions {...defaultProps} onEnrich={onEnrich} />);

      fireEvent.click(screen.getByText('Enrichir 5 tables'));

      expect(onEnrich).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when enriching', () => {
      render(<CatalogActions {...defaultProps} isEnriching={true} />);

      expect(screen.getByText('Enrichissement...')).toBeInTheDocument();
    });

    it('should be disabled when no tables enabled', () => {
      render(<CatalogActions {...defaultProps} enabledTablesCount={0} />);

      const button = screen.getByText('Enrichir 0 tables').closest('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when loading', () => {
      render(<CatalogActions {...defaultProps} isExtracting={true} />);

      const button = screen.getByText('Enrichir 5 tables').closest('button');
      expect(button).toBeDisabled();
    });
  });

  describe('Delete button with confirmation', () => {
    it('should show delete button', () => {
      render(<CatalogActions {...defaultProps} />);

      expect(screen.getByText('Supprimer')).toBeInTheDocument();
    });

    it('should open confirmation dialog when clicked', () => {
      render(<CatalogActions {...defaultProps} />);

      fireEvent.click(screen.getByText('Supprimer'));

      expect(screen.getByText('Supprimer le catalogue')).toBeInTheDocument();
      expect(screen.getByText('Cette action supprimera tout le catalogue.')).toBeInTheDocument();
    });

    it('should show Cancel and Delete buttons in dialog', () => {
      render(<CatalogActions {...defaultProps} />);

      fireEvent.click(screen.getByText('Supprimer'));

      expect(screen.getByText('Annuler')).toBeInTheDocument();
      // Two delete buttons: trigger and action
      expect(screen.getAllByText('Supprimer').length).toBe(2);
    });

    it('should call onDelete when confirmed', () => {
      const onDelete = jest.fn();
      render(<CatalogActions {...defaultProps} onDelete={onDelete} />);

      // Open dialog
      fireEvent.click(screen.getByText('Supprimer'));

      // Click confirm button (the one in the dialog)
      const deleteButtons = screen.getAllByText('Supprimer');
      fireEvent.click(deleteButtons[1]); // Second delete button is the confirm

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when deleting', () => {
      render(<CatalogActions {...defaultProps} isDeleting={true} />);

      expect(screen.getByText('Suppression...')).toBeInTheDocument();
    });
  });

  describe('Loading states disable all actions', () => {
    it('should disable all buttons when extracting', () => {
      render(<CatalogActions {...defaultProps} isExtracting={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should disable all buttons when enriching', () => {
      render(<CatalogActions {...defaultProps} isEnriching={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should disable all buttons when deleting', () => {
      render(<CatalogActions {...defaultProps} isDeleting={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });
});
