/**
 * Tests for DatasetHeader component
 *
 * Note: DatasetHeader now uses useDatasetStore (Zustand) for state management.
 * We mock the store directly instead of mocking fetch.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { DatasetHeader } from '@/components/DatasetHeader';
import { useDatasetStore } from '@/stores/useDatasetStore';

// Mock fetch API (still needed for some edge cases)
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Helper to reset store between tests
const resetStore = () => {
  useDatasetStore.setState({
    datasets: [],
    activeDataset: null,
    loading: false,
    error: null,
  });
};

describe('DatasetHeader', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetStore();
  });

  it('renders ReactFlowProvider wrapper', async () => {
    // Set store state directly
    useDatasetStore.setState({ datasets: [], loading: false });

    act(() => {
      render(<DatasetHeader />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('react-flow-provider')).toBeInTheDocument();
    });
  });

  it('shows create first dataset link when no datasets exist', async () => {
    // Set store state with empty datasets
    useDatasetStore.setState({ datasets: [], loading: false });

    act(() => {
      render(<DatasetHeader />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Créer votre premier dataset/i)).toBeInTheDocument();
    });
  });

  it('renders ReactFlow component when datasets exist', async () => {
    const mockDatasets = [
      {
        id: 'test-1',
        name: 'Test Dataset',
        description: null,
        duckdb_path: '/path/test.duckdb',
        status: 'ready' as const,
        is_active: true,
        row_count: 100,
        table_count: 2,
        size_bytes: 1024,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ];

    // Set store state with datasets
    useDatasetStore.setState({ datasets: mockDatasets, loading: false });

    act(() => {
      render(<DatasetHeader />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });
  });

  it('shows loading state when store is loading', () => {
    // Set store to loading state
    useDatasetStore.setState({ datasets: [], loading: true });

    act(() => {
      render(<DatasetHeader />);
    });

    // In loading state, we should see the loading text
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
  });
});
