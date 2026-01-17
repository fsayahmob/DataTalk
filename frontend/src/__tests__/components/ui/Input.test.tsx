/**
 * Tests for Input component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('should render an input element', () => {
    render(<Input placeholder="Enter text" />);

    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('should have data-slot attribute', () => {
    render(<Input data-testid="test-input" />);

    const input = screen.getByTestId('test-input');
    expect(input).toHaveAttribute('data-slot', 'input');
  });

  it('should pass type prop correctly', () => {
    render(<Input type="email" data-testid="email-input" />);

    const input = screen.getByTestId('email-input');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('should work without explicit type (HTML defaults to text)', () => {
    render(<Input data-testid="text-input" />);

    const input = screen.getByTestId('text-input') as HTMLInputElement;
    // HTML input defaults to text type when not specified
    expect(input.type).toBe('text');
  });

  it('should accept custom className', () => {
    render(<Input className="custom-class" data-testid="custom-input" />);

    const input = screen.getByTestId('custom-input');
    expect(input).toHaveClass('custom-class');
  });

  it('should handle value changes', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} data-testid="change-input" />);

    const input = screen.getByTestId('change-input');
    fireEvent.change(input, { target: { value: 'new value' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Input disabled data-testid="disabled-input" />);

    const input = screen.getByTestId('disabled-input');
    expect(input).toBeDisabled();
  });

  it('should spread additional props', () => {
    render(<Input aria-label="Test input" maxLength={50} data-testid="props-input" />);

    const input = screen.getByTestId('props-input');
    expect(input).toHaveAttribute('aria-label', 'Test input');
    expect(input).toHaveAttribute('maxLength', '50');
  });

  it('should handle focus events', () => {
    const handleFocus = jest.fn();
    const handleBlur = jest.fn();
    render(
      <Input onFocus={handleFocus} onBlur={handleBlur} data-testid="focus-input" />
    );

    const input = screen.getByTestId('focus-input');

    fireEvent.focus(input);
    expect(handleFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it('should work with password type', () => {
    render(<Input type="password" data-testid="password-input" />);

    const input = screen.getByTestId('password-input');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('should work with number type', () => {
    render(<Input type="number" min={0} max={100} data-testid="number-input" />);

    const input = screen.getByTestId('number-input');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });
});
