/**
 * Tests for DatasetHeader component
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { DatasetHeader } from '@/components/DatasetHeader';

// Mock fetch API
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

describe('DatasetHeader', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders ReactFlowProvider wrapper', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ datasets: [], count: 0, active_dataset_id: null }),
    });

    await act(async () => {
      render(<DatasetHeader />);
    });

    expect(screen.getByTestId('react-flow-provider')).toBeInTheDocument();
  });

  it('shows create first dataset link when no datasets exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ datasets: [], count: 0, active_dataset_id: null }),
    });

    await act(async () => {
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
        status: 'ready',
        is_active: true,
        row_count: 100,
        table_count: 2,
        size_bytes: 1024,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ datasets: mockDatasets, count: 1, active_dataset_id: 'test-1' }),
    });

    await act(async () => {
      render(<DatasetHeader />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    // Don't resolve the fetch immediately to test loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<DatasetHeader />);
    });

    // In loading state, we should see the loading text
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
  });
});
