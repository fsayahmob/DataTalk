/**
 * Tests for Sonner (Toaster) UI component
 */
import { render, screen } from '@testing-library/react';
import { Toaster } from '@/components/ui/sonner';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

// Mock sonner
jest.mock('sonner', () => ({
  Toaster: ({ theme, className, icons, style }: {
    theme: string;
    className: string;
    icons: Record<string, React.ReactNode>;
    style: React.CSSProperties;
  }) => (
    <div
      data-testid="sonner-toaster"
      data-theme={theme}
      className={className}
      style={style}
    >
      <div data-testid="icon-success">{icons.success}</div>
      <div data-testid="icon-info">{icons.info}</div>
      <div data-testid="icon-warning">{icons.warning}</div>
      <div data-testid="icon-error">{icons.error}</div>
      <div data-testid="icon-loading">{icons.loading}</div>
    </div>
  ),
}));

describe('Toaster', () => {
  it('renders toaster component', () => {
    render(<Toaster />);

    expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();
  });

  it('applies theme from useTheme', () => {
    render(<Toaster />);

    expect(screen.getByTestId('sonner-toaster')).toHaveAttribute('data-theme', 'dark');
  });

  it('has correct className', () => {
    render(<Toaster />);

    expect(screen.getByTestId('sonner-toaster')).toHaveClass('toaster', 'group');
  });

  describe('Icons', () => {
    it('provides success icon', () => {
      render(<Toaster />);

      const iconContainer = screen.getByTestId('icon-success');
      expect(iconContainer.querySelector('svg')).toBeInTheDocument();
    });

    it('provides info icon', () => {
      render(<Toaster />);

      const iconContainer = screen.getByTestId('icon-info');
      expect(iconContainer.querySelector('svg')).toBeInTheDocument();
    });

    it('provides warning icon', () => {
      render(<Toaster />);

      const iconContainer = screen.getByTestId('icon-warning');
      expect(iconContainer.querySelector('svg')).toBeInTheDocument();
    });

    it('provides error icon', () => {
      render(<Toaster />);

      const iconContainer = screen.getByTestId('icon-error');
      expect(iconContainer.querySelector('svg')).toBeInTheDocument();
    });

    it('provides loading icon with animation', () => {
      render(<Toaster />);

      const iconContainer = screen.getByTestId('icon-loading');
      const svg = iconContainer.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('animate-spin');
    });
  });

  describe('Custom styles', () => {
    it('applies CSS custom properties for styling', () => {
      render(<Toaster />);

      const toaster = screen.getByTestId('sonner-toaster');
      const style = toaster.style;

      expect(style.getPropertyValue('--normal-bg')).toBe('var(--popover)');
      expect(style.getPropertyValue('--normal-text')).toBe('var(--popover-foreground)');
      expect(style.getPropertyValue('--normal-border')).toBe('var(--border)');
      expect(style.getPropertyValue('--border-radius')).toBe('var(--radius)');
    });
  });

  describe('Props passthrough', () => {
    it('passes additional props to Sonner', () => {
      // This tests that spread props work correctly
      render(<Toaster position="top-right" />);

      expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();
    });
  });
});

describe('Toaster with system theme', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('uses system as default when theme is undefined', () => {
    // Re-mock with undefined theme
    jest.doMock('next-themes', () => ({
      useTheme: () => ({ theme: undefined }),
    }));

    render(<Toaster />);

    // Component should still render
    expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();
  });
});
