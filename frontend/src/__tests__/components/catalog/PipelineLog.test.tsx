/**
 * Tests for PipelineLog component
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { PipelineLog } from '@/components/catalog/PipelineLog';
import type { CatalogJob } from '@/lib/api';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'catalog.loading_run': 'Chargement du run...',
        'catalog.no_run_executed': 'Aucun run exécuté',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => {
    const translations: Record<string, string> = {
      'catalog.loading_run': 'Chargement du run...',
      'catalog.no_run_executed': 'Aucun run exécuté',
    };
    return translations[key] || key;
  },
}));

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2;
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  // Helper to simulate error
  simulateError() {
    if (this.onerror) {
      this.onerror();
    }
  }
}

// Store original EventSource
const originalEventSource = global.EventSource;

describe('PipelineLog', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error - mocking EventSource
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
  });

  describe('Without runId', () => {
    it('should show no run executed message when runId is null', async () => {
      render(<PipelineLog runId={null} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun run exécuté')).toBeInTheDocument();
      });
    });

    it('should show no run executed message when runId is undefined', async () => {
      render(<PipelineLog />);

      await waitFor(() => {
        expect(screen.getByText('Aucun run exécuté')).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading state initially', () => {
      render(<PipelineLog runId="test-run-123" />);

      expect(screen.getByText('Chargement du run...')).toBeInTheDocument();
    });

    it('should create EventSource with correct URL', () => {
      render(<PipelineLog runId="test-run-123" />);

      expect(MockEventSource.instances.length).toBe(1);
      expect(MockEventSource.instances[0].url).toContain('/catalog/job-stream/test-run-123');
    });
  });

  describe('Receiving job data', () => {
    it('should render job data when received', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run-123',
          job_type: 'extraction',
          status: 'completed',
          progress: 100,
          current_step: null,
          step_index: null,
          total_steps: null,
          result: { tables: 10, columns: 50 },
          error_message: null,
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:01:00Z',
        },
      ];

      render(<PipelineLog runId="test-run-123" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('Extraction')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('10 tables')).toBeInTheDocument();
        expect(screen.getByText('50 colonnes')).toBeInTheDocument();
      });
    });

    it('should show status icons for completed jobs', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run',
          job_type: 'extraction',
          status: 'completed',
          progress: 100,
          current_step: null,
          step_index: null,
          total_steps: null,
          result: null,
          error_message: null,
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:01:00Z',
        },
      ];

      render(<PipelineLog runId="test-run" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('✓')).toBeInTheDocument();
      });
    });

    it('should show status icon for failed jobs', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run',
          job_type: 'extraction',
          status: 'failed',
          progress: 50,
          current_step: null,
          step_index: null,
          total_steps: null,
          result: null,
          error_message: 'Something went wrong',
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:00:30Z',
        },
      ];

      render(<PipelineLog runId="test-run" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('✗')).toBeInTheDocument();
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('should show progress bar for running jobs', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run',
          job_type: 'enrichment',
          status: 'running',
          progress: 45,
          current_step: 'llm_batch_2',
          step_index: 1,
          total_steps: 5,
          result: null,
          error_message: null,
          started_at: '2024-01-15T10:00:00Z',
          completed_at: null,
        },
      ];

      render(<PipelineLog runId="test-run" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('Enrichissement')).toBeInTheDocument();
        expect(screen.getByText('45%')).toBeInTheDocument();
        expect(screen.getByText(/Enrichissement LLM batch 2/)).toBeInTheDocument();
        expect(screen.getByText('(2/5)')).toBeInTheDocument();
      });
    });
  });

  describe('Result badges', () => {
    it('should render all result badges', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run',
          job_type: 'enrichment',
          status: 'completed',
          progress: 100,
          current_step: null,
          step_index: null,
          total_steps: null,
          result: {
            tables: 5,
            columns: 25,
            synonyms: 100,
            kpis: 10,
            questions: 15,
          },
          error_message: null,
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:05:00Z',
        },
      ];

      render(<PipelineLog runId="test-run" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('5 tables')).toBeInTheDocument();
        expect(screen.getByText('25 colonnes')).toBeInTheDocument();
        expect(screen.getByText('100 synonymes')).toBeInTheDocument();
        expect(screen.getByText('10 KPIs')).toBeInTheDocument();
        expect(screen.getByText('15 questions')).toBeInTheDocument();
      });
    });
  });

  describe('SSE lifecycle', () => {
    it('should close EventSource when done message received', async () => {
      render(<PipelineLog runId="test-run" />);

      const eventSource = MockEventSource.instances[0];

      await act(async () => {
        eventSource.simulateMessage({ done: true });
      });

      expect(eventSource.readyState).toBe(2); // CLOSED
    });

    it('should close EventSource on error', async () => {
      render(<PipelineLog runId="test-run" />);

      const eventSource = MockEventSource.instances[0];

      await act(async () => {
        eventSource.simulateError();
      });

      expect(eventSource.readyState).toBe(2); // CLOSED
    });

    it('should close EventSource on unmount', () => {
      const { unmount } = render(<PipelineLog runId="test-run" />);

      const eventSource = MockEventSource.instances[0];

      unmount();

      expect(eventSource.readyState).toBe(2); // CLOSED
    });
  });

  describe('Multiple jobs', () => {
    it('should render multiple jobs with separators', async () => {
      const mockJobs: CatalogJob[] = [
        {
          id: 1,
          run_id: 'test-run',
          job_type: 'extraction',
          status: 'completed',
          progress: 100,
          current_step: null,
          step_index: null,
          total_steps: null,
          result: { tables: 10 },
          error_message: null,
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:01:00Z',
        },
        {
          id: 2,
          run_id: 'test-run',
          job_type: 'enrichment',
          status: 'running',
          progress: 30,
          current_step: 'llm_batch_1',
          step_index: 0,
          total_steps: 3,
          result: null,
          error_message: null,
          started_at: '2024-01-15T10:01:00Z',
          completed_at: null,
        },
      ];

      render(<PipelineLog runId="test-run" />);

      await act(async () => {
        MockEventSource.instances[0].simulateMessage(mockJobs);
      });

      await waitFor(() => {
        expect(screen.getByText('Extraction')).toBeInTheDocument();
        expect(screen.getByText('Enrichissement')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
      });
    });
  });
});
