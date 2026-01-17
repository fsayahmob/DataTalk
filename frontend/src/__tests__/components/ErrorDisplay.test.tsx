/**
 * Tests for ErrorDisplay component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay } from '@/components/ErrorDisplay';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'error.sql_execution': 'Erreur d\'exécution SQL',
      'error.sql_execution_desc': 'Une erreur s\'est produite lors de l\'exécution de la requête.',
      'error.sql_attempted': 'Requête SQL tentée :',
      'error.copy_details': 'Copier les détails',
      'error.try_suggestion': 'Essayez de reformuler votre question.',
    };
    return translations[key] || key;
  },
}));

// Mock clipboard API
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

describe('ErrorDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render error title', () => {
      render(<ErrorDisplay error="Test error" />);

      expect(screen.getByText("Erreur d'exécution SQL")).toBeInTheDocument();
    });

    it('should render error description', () => {
      render(<ErrorDisplay error="Test error" />);

      expect(screen.getByText("Une erreur s'est produite lors de l'exécution de la requête.")).toBeInTheDocument();
    });

    it('should render error message', () => {
      render(<ErrorDisplay error="Table 'users' not found" />);

      expect(screen.getByText("Table 'users' not found")).toBeInTheDocument();
    });

    it('should render copy button', () => {
      render(<ErrorDisplay error="Test error" />);

      expect(screen.getByText('Copier les détails')).toBeInTheDocument();
    });

    it('should render suggestion text', () => {
      render(<ErrorDisplay error="Test error" />);

      expect(screen.getByText('Essayez de reformuler votre question.')).toBeInTheDocument();
    });
  });

  describe('SQL display', () => {
    it('should show SQL section when sql prop is provided', () => {
      render(<ErrorDisplay error="Error" sql="SELECT * FROM users" />);

      expect(screen.getByText('Requête SQL tentée :')).toBeInTheDocument();
      expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();
    });

    it('should not show SQL section when sql is not provided', () => {
      render(<ErrorDisplay error="Error" />);

      expect(screen.queryByText('Requête SQL tentée :')).not.toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('should copy error message when no SQL', () => {
      render(<ErrorDisplay error="Connection failed" />);

      fireEvent.click(screen.getByText('Copier les détails'));

      expect(mockWriteText).toHaveBeenCalledWith('Connection failed');
    });

    it('should copy both SQL and error when SQL is provided', () => {
      render(<ErrorDisplay error="Table not found" sql="SELECT * FROM users" />);

      fireEvent.click(screen.getByText('Copier les détails'));

      expect(mockWriteText).toHaveBeenCalledWith(
        'SQL:\nSELECT * FROM users\n\nErreur:\nTable not found'
      );
    });
  });

  describe('Styling', () => {
    it('should have destructive color scheme', () => {
      const { container } = render(<ErrorDisplay error="Test" />);

      // Check for destructive-related classes
      const errorContainer = container.querySelector('.bg-destructive\\/10');
      expect(errorContainer).toBeInTheDocument();
    });

    it('should render error icon area', () => {
      const { container } = render(<ErrorDisplay error="Test" />);

      // Check for icon container
      const iconContainer = container.querySelector('.bg-destructive\\/20');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Long error messages', () => {
    it('should handle long error messages', () => {
      const longError = 'A'.repeat(500);
      render(<ErrorDisplay error={longError} />);

      expect(screen.getByText(longError)).toBeInTheDocument();
    });

    it('should handle multiline SQL', () => {
      const multilineSql = `SELECT
  id,
  name,
  email
FROM users
WHERE active = true`;

      const { container } = render(<ErrorDisplay error="Error" sql={multilineSql} />);

      // Use container query since getByText normalizes whitespace
      const preElement = container.querySelector('pre');
      expect(preElement).toBeInTheDocument();
      expect(preElement?.textContent).toBe(multilineSql);
    });
  });
});
