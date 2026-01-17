/**
 * Tests for CustomControls component (React Flow controls)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomControls } from '@/components/catalog/CustomControls';

// Mock React Flow
const mockZoomIn = jest.fn();
const mockZoomOut = jest.fn();
const mockFitView = jest.fn();

jest.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    fitView: mockFitView,
  }),
}));

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'catalog.zoom_in': 'Zoom avant',
      'catalog.zoom_out': 'Zoom arrière',
      'catalog.fit_view': 'Ajuster la vue',
    };
    return translations[key] || key;
  },
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  ZoomInIcon: ({ size }: { size: number }) => (
    <span data-testid="zoom-in-icon" data-size={size}>+</span>
  ),
  ZoomOutIcon: ({ size }: { size: number }) => (
    <span data-testid="zoom-out-icon" data-size={size}>-</span>
  ),
  FitViewIcon: ({ size }: { size: number }) => (
    <span data-testid="fit-view-icon" data-size={size}>[]</span>
  ),
}));

describe('CustomControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all control buttons', () => {
      render(<CustomControls />);

      expect(screen.getAllByRole('button')).toHaveLength(3);
    });

    it('renders zoom in button with icon', () => {
      render(<CustomControls />);

      expect(screen.getByTestId('zoom-in-icon')).toBeInTheDocument();
    });

    it('renders zoom out button with icon', () => {
      render(<CustomControls />);

      expect(screen.getByTestId('zoom-out-icon')).toBeInTheDocument();
    });

    it('renders fit view button with icon', () => {
      render(<CustomControls />);

      expect(screen.getByTestId('fit-view-icon')).toBeInTheDocument();
    });

    it('renders icons with correct size', () => {
      render(<CustomControls />);

      expect(screen.getByTestId('zoom-in-icon')).toHaveAttribute('data-size', '16');
      expect(screen.getByTestId('zoom-out-icon')).toHaveAttribute('data-size', '16');
      expect(screen.getByTestId('fit-view-icon')).toHaveAttribute('data-size', '16');
    });
  });

  describe('Tooltips', () => {
    it('has zoom in tooltip', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      const zoomInButton = buttons[0];
      expect(zoomInButton).toHaveAttribute('title', 'Zoom avant');
    });

    it('has zoom out tooltip', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      const zoomOutButton = buttons[1];
      expect(zoomOutButton).toHaveAttribute('title', 'Zoom arrière');
    });

    it('has fit view tooltip', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      const fitViewButton = buttons[2];
      expect(fitViewButton).toHaveAttribute('title', 'Ajuster la vue');
    });
  });

  describe('Interactions', () => {
    it('calls zoomIn when zoom in button clicked', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(mockZoomIn).toHaveBeenCalledTimes(1);
    });

    it('calls zoomOut when zoom out button clicked', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]);

      expect(mockZoomOut).toHaveBeenCalledTimes(1);
    });

    it('calls fitView with padding when fit view button clicked', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[2]);

      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
    });
  });

  describe('Styling', () => {
    it('has correct container positioning', () => {
      const { container } = render(<CustomControls />);

      const controlsDiv = container.firstChild;
      expect(controlsDiv).toHaveClass('absolute', 'bottom-4', 'left-4');
    });

    it('buttons have ghost variant styling', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('data-variant', 'ghost');
      });
    });

    it('buttons have correct size', () => {
      render(<CustomControls />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('data-size', 'sm');
      });
    });
  });

  describe('Separator', () => {
    it('renders separator between zoom and fit view buttons', () => {
      const { container } = render(<CustomControls />);

      const separator = container.querySelector('.h-px.bg-border\\/50');
      expect(separator).toBeInTheDocument();
    });
  });
});
