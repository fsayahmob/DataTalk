/**
 * Tests for ThemeToggle component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/ThemeToggle';

// Mock next-themes
const mockSetTheme = jest.fn();
let mockResolvedTheme = 'dark';

jest.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: mockSetTheme,
    resolvedTheme: mockResolvedTheme,
  }),
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  SunIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="sun-icon" data-size={size} className={className}>Sun</span>
  ),
  MoonIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="moon-icon" data-size={size} className={className}>Moon</span>
  ),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvedTheme = 'dark';
  });

  describe('Rendering', () => {
    it('should render toggle button', () => {
      render(<ThemeToggle />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should render both icons', () => {
      render(<ThemeToggle />);

      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('should have accessible name', () => {
      render(<ThemeToggle />);

      expect(screen.getByText('Toggle theme')).toBeInTheDocument();
    });
  });

  describe('Dark mode', () => {
    beforeEach(() => {
      mockResolvedTheme = 'dark';
    });

    it('should have Light mode title when in dark mode', () => {
      render(<ThemeToggle />);

      expect(screen.getByRole('button')).toHaveAttribute('title', 'Light mode');
    });

    it('should switch to light mode on click', () => {
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole('button'));

      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('Light mode', () => {
    beforeEach(() => {
      mockResolvedTheme = 'light';
    });

    it('should have Dark mode title when in light mode', () => {
      render(<ThemeToggle />);

      expect(screen.getByRole('button')).toHaveAttribute('title', 'Dark mode');
    });

    it('should switch to dark mode on click', () => {
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole('button'));

      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });
});
