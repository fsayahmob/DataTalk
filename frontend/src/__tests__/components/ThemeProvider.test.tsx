/**
 * Tests for ThemeProvider component
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

describe('ThemeProvider', () => {
  it('renders children correctly', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Content</div>
      </ThemeProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('wraps children with theme provider', () => {
    render(
      <ThemeProvider>
        <span>Wrapped content</span>
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByText('Wrapped content')).toBeInTheDocument();
  });

  it('accepts multiple children', () => {
    render(
      <ThemeProvider>
        <div>First</div>
        <div>Second</div>
      </ThemeProvider>
    );

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
