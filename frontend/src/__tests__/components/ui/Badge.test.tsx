/**
 * Tests for Badge component
 */
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  describe('Rendering', () => {
    it('should render a badge with text', () => {
      render(<Badge>Test Badge</Badge>);

      expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<Badge data-testid="badge">Badge</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('data-slot', 'badge');
    });

    it('should render as span by default', () => {
      render(<Badge data-testid="badge">Badge</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge.tagName).toBe('SPAN');
    });

    it('should accept custom className', () => {
      render(<Badge className="custom-class" data-testid="badge">Badge</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('custom-class');
    });
  });

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<Badge data-testid="badge">Default</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-primary');
    });

    it('should render secondary variant', () => {
      render(<Badge variant="secondary" data-testid="badge">Secondary</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-secondary');
    });

    it('should render destructive variant', () => {
      render(<Badge variant="destructive" data-testid="badge">Destructive</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-destructive');
    });

    it('should render outline variant', () => {
      render(<Badge variant="outline" data-testid="badge">Outline</Badge>);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-foreground');
    });
  });

  describe('asChild prop', () => {
    it('should render as child element when asChild is true', () => {
      render(
        <Badge asChild>
          <a href="/test">Link Badge</a>
        </Badge>
      );

      const link = screen.getByRole('link', { name: 'Link Badge' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });
  });

  describe('Props spreading', () => {
    it('should spread additional props', () => {
      render(
        <Badge aria-label="Test badge" id="badge-id" data-testid="badge">
          Badge
        </Badge>
      );

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('aria-label', 'Test badge');
      expect(badge).toHaveAttribute('id', 'badge-id');
    });
  });

  describe('Content', () => {
    it('should render with icon and text', () => {
      render(
        <Badge data-testid="badge">
          <svg data-testid="icon" />
          Badge Text
        </Badge>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Badge Text')).toBeInTheDocument();
    });

    it('should render with multiple children', () => {
      render(
        <Badge>
          <span>Part 1</span>
          <span>Part 2</span>
        </Badge>
      );

      expect(screen.getByText('Part 1')).toBeInTheDocument();
      expect(screen.getByText('Part 2')).toBeInTheDocument();
    });
  });
});
