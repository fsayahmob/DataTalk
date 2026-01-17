/**
 * Tests for SQLPanel component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SQLPanel } from '@/components/panels/SQLPanel';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'common.copy': 'Copier',
      'common.copied': 'Copié !',
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

describe('SQLPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should not render when sql is empty', () => {
      const { container } = render(<SQLPanel sql="" />);

      expect(container.firstChild).toBeNull();
    });

    it('should render header when sql is provided', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      expect(screen.getByText('SQL')).toBeInTheDocument();
    });

    it('should render copy button', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      expect(screen.getByText('Copier')).toBeInTheDocument();
    });

    it('should not show SQL content initially (collapsed)', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      // The SQL content should not be visible
      expect(screen.queryByText('SELECT * FROM users')).not.toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    it('should expand when SQL header is clicked', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      fireEvent.click(screen.getByText('SQL'));

      expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();
    });

    it('should collapse when clicked again', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      // Expand
      fireEvent.click(screen.getByText('SQL'));
      expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText('SQL'));
      expect(screen.queryByText('SELECT * FROM users')).not.toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('should copy SQL to clipboard when copy button is clicked', async () => {
      const sql = 'SELECT * FROM users WHERE id = 1';
      render(<SQLPanel sql={sql} />);

      fireEvent.click(screen.getByText('Copier'));

      expect(mockWriteText).toHaveBeenCalledWith(sql);
    });

    it('should show "Copié !" after copying', async () => {
      render(<SQLPanel sql="SELECT 1" />);

      fireEvent.click(screen.getByText('Copier'));

      await waitFor(() => {
        expect(screen.getByText('Copié !')).toBeInTheDocument();
      });
    });

    it('should revert to "Copier" after 2 seconds', async () => {
      jest.useFakeTimers();

      render(<SQLPanel sql="SELECT 1" />);

      fireEvent.click(screen.getByText('Copier'));

      // Wait for the async clipboard operation to complete and update state
      await jest.runAllTimersAsync();

      // After all timers run, it should be back to "Copier"
      expect(screen.getByText('Copier')).toBeInTheDocument();

      jest.useRealTimers();
    });
  });

  describe('SQL content display', () => {
    it('should display multiline SQL correctly', () => {
      const multilineSql = `SELECT
  id,
  name,
  email
FROM users
WHERE active = true`;

      render(<SQLPanel sql={multilineSql} />);

      fireEvent.click(screen.getByText('SQL'));

      const preElement = screen.getByText(/SELECT/);
      expect(preElement).toBeInTheDocument();
    });

    it('should use monospace font for SQL', () => {
      render(<SQLPanel sql="SELECT * FROM users" />);

      fireEvent.click(screen.getByText('SQL'));

      const preElement = screen.getByText('SELECT * FROM users');
      expect(preElement.tagName).toBe('PRE');
      expect(preElement).toHaveClass('font-mono');
    });
  });
});
