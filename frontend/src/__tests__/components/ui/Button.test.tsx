/**
 * Tests for Button UI component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  describe('Basic rendering', () => {
    it('renders button with text', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('renders with default variant and size', () => {
      render(<Button>Default</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-variant', 'default');
      expect(button).toHaveAttribute('data-size', 'default');
    });

    it('renders with data-slot attribute', () => {
      render(<Button>Test</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'button');
    });
  });

  describe('Variants', () => {
    it.each([
      ['default', 'bg-primary'],
      ['destructive', 'bg-destructive'],
      ['outline', 'border'],
      ['secondary', 'bg-secondary'],
      ['ghost', 'hover:bg-accent'],
      ['link', 'underline-offset-4'],
    ])('renders %s variant with correct class', (variant, expectedClass) => {
      render(<Button variant={variant as Parameters<typeof Button>[0]['variant']}>Test</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-variant', variant);
      expect(button.className).toContain(expectedClass);
    });
  });

  describe('Sizes', () => {
    it.each([
      ['default', 'h-9'],
      ['sm', 'h-8'],
      ['lg', 'h-10'],
      ['icon', 'size-9'],
      ['icon-sm', 'size-8'],
      ['icon-lg', 'size-10'],
    ])('renders %s size with correct class', (size, expectedClass) => {
      render(<Button size={size as Parameters<typeof Button>[0]['size']}>Test</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-size', size);
      expect(button.className).toContain(expectedClass);
    });
  });

  describe('Interactions', () => {
    it('calls onClick handler when clicked', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick} disabled>Click</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('has disabled styling when disabled', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button.className).toContain('disabled:opacity-50');
    });
  });

  describe('asChild prop', () => {
    it('renders as Slot when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link', { name: 'Link Button' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });
  });

  describe('Custom className', () => {
    it('merges custom className with default classes', () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
      expect(button.className).toContain('inline-flex');
    });
  });

  describe('With children', () => {
    it('renders icon and text together', () => {
      render(
        <Button>
          <span data-testid="icon">*</span>
          Save
        </Button>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('passes through type attribute', () => {
      render(<Button type="submit">Submit</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('passes through aria attributes', () => {
      render(<Button aria-label="Close dialog">X</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Close dialog');
    });
  });
});
