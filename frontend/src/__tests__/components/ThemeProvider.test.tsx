/**
 * Tests for ThemeProvider component and theming system
 */
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, useThemeStyle, THEME_STYLES, type ThemeStyle } from '@/components/ThemeProvider';

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('ThemeProvider', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    document.documentElement.removeAttribute('data-theme-style');
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

  it('persists theme style to localStorage', async () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme-style', 'corporate');
  });

  it('loads saved theme style from localStorage', async () => {
    mockLocalStorage.getItem.mockReturnValueOnce('bloomberg');

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

  it('ignores invalid theme style from localStorage', async () => {
    mockLocalStorage.getItem.mockReturnValueOnce('invalid-theme');

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
});

describe('useThemeStyle hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    document.documentElement.removeAttribute('data-theme-style');
  });

  it('returns current style', async () => {
    const { result } = renderHook(() => useThemeStyle(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.style).toBe('corporate');
  });

  it('returns list of available styles', () => {
    const { result } = renderHook(() => useThemeStyle(), { wrapper });

    expect(result.current.styles).toEqual(THEME_STYLES);
    expect(result.current.styles.length).toBe(6);
  });

  it('setStyle updates the current style', async () => {
    const { result } = renderHook(() => useThemeStyle(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      result.current.setStyle('dracula');
    });

    expect(result.current.style).toBe('dracula');
  });

  it('setStyle updates document attribute', async () => {
    const { result } = renderHook(() => useThemeStyle(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      result.current.setStyle('github');
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(document.documentElement.getAttribute('data-theme-style')).toBe('github');
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useThemeStyle());
    }).toThrow('useThemeStyle must be used within ThemeProvider');

    consoleSpy.mockRestore();
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
