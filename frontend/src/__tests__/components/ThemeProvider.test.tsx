/**
 * Tests for ThemeProvider component and theming system
 *
 * Note: ThemeProvider now uses useThemeStore (Zustand) for state management.
 * We test the store directly for state-related tests.
 */
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, THEME_STYLES, type ThemeStyle } from '@/components/ThemeProvider';
import { useThemeStore } from '@/stores/useThemeStore';

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

// Helper to reset store between tests
const resetStore = () => {
  useThemeStore.setState({ style: 'corporate' });
  document.documentElement.removeAttribute('data-theme-style');
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    resetStore();
  });

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

  it('sets data-theme-style attribute on document', async () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(document.documentElement.getAttribute('data-theme-style')).toBe('corporate');
  });

  it('applies saved theme style from store', async () => {
    // Set store state before rendering
    useThemeStore.setState({ style: 'bloomberg' });

    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(document.documentElement.getAttribute('data-theme-style')).toBe('bloomberg');
  });
});

describe('useThemeStore', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  beforeEach(() => {
    resetStore();
  });

  it('returns current style', async () => {
    const { result } = renderHook(() => useThemeStore((state) => state.style), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current).toBe('corporate');
  });

  it('returns list of available styles', () => {
    const { result } = renderHook(() => useThemeStore((state) => state.styles), { wrapper });

    expect(result.current).toEqual(THEME_STYLES);
    expect(result.current.length).toBe(6);
  });

  it('setStyle updates the current style', async () => {
    const { result } = renderHook(() => ({
      style: useThemeStore((state) => state.style),
      setStyle: useThemeStore((state) => state.setStyle),
    }), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setStyle('dracula');
    });

    expect(result.current.style).toBe('dracula');
  });

  it('setStyle updates document attribute', async () => {
    const { result } = renderHook(() => ({
      style: useThemeStore((state) => state.style),
      setStyle: useThemeStore((state) => state.setStyle),
    }), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setStyle('github');
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(document.documentElement.getAttribute('data-theme-style')).toBe('github');
  });

  it('works outside provider with Zustand store', () => {
    // With Zustand, the hook works without a provider
    const { result } = renderHook(() => useThemeStore((state) => state.style));
    expect(result.current).toBe('corporate');
  });
});

describe('THEME_STYLES configuration', () => {
  it('has all required theme styles', () => {
    const themeIds = THEME_STYLES.map(s => s.id);
    expect(themeIds).toContain('corporate');
    expect(themeIds).toContain('gcp');
    expect(themeIds).toContain('linux');
    expect(themeIds).toContain('bloomberg');
    expect(themeIds).toContain('github');
    expect(themeIds).toContain('dracula');
  });

  it('each theme has name and description', () => {
    THEME_STYLES.forEach(theme => {
      expect(theme.name).toBeTruthy();
      expect(theme.description).toBeTruthy();
    });
  });

  it('all theme ids are valid ThemeStyle type', () => {
    const validStyles: ThemeStyle[] = ['corporate', 'gcp', 'linux', 'bloomberg', 'github', 'dracula'];
    THEME_STYLES.forEach(theme => {
      expect(validStyles).toContain(theme.id);
    });
  });
});
