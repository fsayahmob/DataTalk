/**
 * Tests for DatasetHeader component
 */
import { render, screen } from '@testing-library/react';
import { DatasetHeader } from '@/components/DatasetHeader';

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  Background: () => <div data-testid="background" />,
  BackgroundVariant: {
    Dots: 'dots',
    Lines: 'lines',
    Cross: 'cross',
  },
}));

describe('DatasetHeader', () => {
  it('renders the header container', () => {
    const { container } = render(<DatasetHeader />);

    const header = container.firstChild as HTMLElement;
    expect(header).toHaveClass('h-12');
    expect(header).toHaveClass('border-b');
  });

  it('renders ReactFlowProvider', () => {
    render(<DatasetHeader />);

    expect(screen.getByTestId('react-flow-provider')).toBeInTheDocument();
  });

  it('renders ReactFlow component', () => {
    render(<DatasetHeader />);

    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('renders Background component', () => {
    render(<DatasetHeader />);

    expect(screen.getByTestId('background')).toBeInTheDocument();
  });

  it('has flex-shrink-0 to prevent shrinking', () => {
    const { container } = render(<DatasetHeader />);

    const header = container.firstChild as HTMLElement;
    expect(header).toHaveClass('flex-shrink-0');
  });
});
