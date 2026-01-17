/**
 * Tests for Sidebar component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '@/components/Sidebar';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'sidebar.analytics': 'Analytique',
      'sidebar.catalog': 'Catalogue',
      'sidebar.runs': 'Exécutions',
      'sidebar.settings': 'Paramètres',
      'sidebar.open_menu': 'Ouvrir le menu',
      'sidebar.close_menu': 'Fermer le menu',
      'sidebar.collapse': 'Réduire',
      'sidebar.not_configured': 'Non configuré',
      'settings.theme': 'Thème',
      'common.connected': 'Connecté',
      'common.disconnected': 'Déconnecté',
    };
    return translations[key] || key;
  },
}));

// Mock API
jest.mock('@/lib/api', () => ({
  fetchLLMStatus: jest.fn().mockResolvedValue({ status: 'ok', model: 'gemini-2.0-flash' }),
}));

// Mock ThemeToggle
jest.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Toggle Theme</button>,
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe('Sidebar', () => {
  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render TalkData title when expanded', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('TalkData')).toBeInTheDocument();
    });

    it('should not render TalkData title when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />);

      expect(screen.queryByText('TalkData')).not.toBeInTheDocument();
    });

    it('should render logo', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByAltText('TalkData')).toBeInTheDocument();
    });

    it('should render navigation items when expanded', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Analytique')).toBeInTheDocument();
      expect(screen.getByText('Catalogue')).toBeInTheDocument();
      expect(screen.getByText('Exécutions')).toBeInTheDocument();
      expect(screen.getByText('Paramètres')).toBeInTheDocument();
    });

    it('should not render navigation labels when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />);

      expect(screen.queryByText('Analytique')).not.toBeInTheDocument();
      expect(screen.queryByText('Catalogue')).not.toBeInTheDocument();
    });

    it('should render theme toggle', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should render collapse button', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Réduire')).toBeInTheDocument();
    });
  });

  describe('LLM Status', () => {
    it('should display connected status when API returns ok', async () => {
      render(<Sidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Connecté')).toBeInTheDocument();
      });
    });

    it('should display model name when connected', async () => {
      render(<Sidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
      });
    });
  });

  describe('Collapse functionality', () => {
    it('should call onCollapse when logo is clicked', () => {
      const onCollapse = jest.fn();
      render(<Sidebar {...defaultProps} onCollapse={onCollapse} />);

      const logoButton = screen.getByAltText('TalkData').closest('button');
      fireEvent.click(logoButton!);

      expect(onCollapse).toHaveBeenCalledWith(true);
    });

    it('should call onCollapse when collapse button is clicked', () => {
      const onCollapse = jest.fn();
      render(<Sidebar {...defaultProps} onCollapse={onCollapse} />);

      fireEvent.click(screen.getByText('Réduire'));

      expect(onCollapse).toHaveBeenCalledWith(true);
    });

    it('should expand when collapsed and logo is clicked', () => {
      const onCollapse = jest.fn();
      render(<Sidebar {...defaultProps} collapsed={true} onCollapse={onCollapse} />);

      const logoButton = screen.getByAltText('TalkData').closest('button');
      fireEvent.click(logoButton!);

      expect(onCollapse).toHaveBeenCalledWith(false);
    });
  });

  describe('Width classes', () => {
    it('should have w-48 class when expanded', () => {
      const { container } = render(<Sidebar {...defaultProps} />);

      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('w-48');
    });

    it('should have w-14 class when collapsed', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={true} />);

      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('w-14');
    });
  });

  describe('Navigation links', () => {
    it('should render links to correct paths', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByRole('link', { name: /Analytique/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /Catalogue/i })).toHaveAttribute('href', '/catalog');
      expect(screen.getByRole('link', { name: /Exécutions/i })).toHaveAttribute('href', '/runs');
      expect(screen.getByRole('link', { name: /Paramètres/i })).toHaveAttribute('href', '/settings');
    });

    it('should highlight active link (home)', () => {
      render(<Sidebar {...defaultProps} />);

      const analyticsLink = screen.getByRole('link', { name: /Analytique/i });
      expect(analyticsLink).toHaveClass('bg-primary/20');
    });
  });

  describe('Tooltips when collapsed', () => {
    it('should show tooltip on logo button when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />);

      const logoButton = screen.getByAltText('TalkData').closest('button');
      expect(logoButton).toHaveAttribute('title', 'Ouvrir le menu');
    });

    it('should show tooltip on nav items when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />);

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toHaveAttribute('title');
      });
    });
  });
});
