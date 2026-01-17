/**
 * Tests for AppShell component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';

// Mock Sidebar component
jest.mock('@/components/Sidebar', () => ({
  Sidebar: ({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: (v: boolean) => void }) => (
    <div data-testid="sidebar" data-collapsed={collapsed}>
      <button onClick={() => onCollapse(!collapsed)} data-testid="toggle-sidebar">
        Toggle
      </button>
    </div>
  ),
}));

describe('AppShell', () => {
  it('renders children correctly', () => {
    render(
      <AppShell>
        <div data-testid="content">Main content</div>
      </AppShell>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByText('Main content')).toBeInTheDocument();
  });

  it('renders Sidebar component', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('starts with sidebar collapsed', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
  });

  it('toggles sidebar collapse state', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');

    fireEvent.click(screen.getByTestId('toggle-sidebar'));
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByTestId('toggle-sidebar'));
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });

  it('renders with correct layout structure', () => {
    const { container } = render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    // Check for main element
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('flex-1');
  });
});
