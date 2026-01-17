/**
 * Tests for AnalyticsZone component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalyticsZone } from '@/components/AnalyticsZone';
import type { SavedReport } from '@/types';
import * as api from '@/lib/api';
import { toast } from 'sonner';

// Mock API
jest.mock('@/lib/api', () => ({
  fetchKpis: jest.fn(),
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock icons
jest.mock('@/components/icons', () => ({
  ChartIcon: ({ size }: { size: number }) => <span data-testid="chart-icon" />,
  ChevronRightIcon: ({ size }: { size: number }) => <span data-testid="chevron-right" />,
  SaveIcon: ({ size }: { size: number }) => <span data-testid="save-icon" />,
  ShareIcon: ({ size }: { size: number }) => <span data-testid="share-icon" />,
}));

// Mock KpiGridCompact
jest.mock('@/components/KpiCardCompact', () => ({
  KpiGridCompact: ({ kpis }: { kpis: unknown[] }) => (
    <div data-testid="kpi-grid">{kpis.length} KPIs</div>
  ),
}));

// Mock useTranslation
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'analytics.open': 'Open Analytics',
      'analytics.title': 'Analytics',
      'analytics.reports': 'Saved Reports',
      'analytics.link_copied': 'Link copied',
      'analytics.copy_share_link': 'Copy share link',
      'common.collapse': 'Collapse',
    };
    return translations[key] || key;
  },
}));

// Mock clipboard
const mockClipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe('AnalyticsZone', () => {
  const mockOnCollapse = jest.fn();
  const mockOnReportClick = jest.fn();
  const mockOnReportDelete = jest.fn();

  const createReport = (overrides: Partial<SavedReport> = {}): SavedReport => ({
    id: 1,
    title: 'Test Report',
    question: 'Test question?',
    sql_query: 'SELECT * FROM test',
    chart_config: null,
    is_pinned: false,
    share_token: 'test-token-123',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const defaultProps = {
    collapsed: false,
    onCollapse: mockOnCollapse,
    width: 20,
    isResizing: false,
    savedReports: [] as SavedReport[],
    onReportClick: mockOnReportClick,
    onReportDelete: mockOnReportDelete,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (api.fetchKpis as jest.Mock).mockResolvedValue([]);
  });

  describe('Expanded state', () => {
    it('renders header with analytics title', () => {
      render(<AnalyticsZone {...defaultProps} />);

      expect(screen.getByText('Analytics')).toBeInTheDocument();
    });

    it('renders collapse button', () => {
      render(<AnalyticsZone {...defaultProps} />);

      expect(screen.getByTitle('Collapse')).toBeInTheDocument();
    });

    it('calls onCollapse when collapse button clicked', async () => {
      const user = userEvent.setup();
      render(<AnalyticsZone {...defaultProps} />);

      await user.click(screen.getByTitle('Collapse'));

      expect(mockOnCollapse).toHaveBeenCalledWith(true);
    });

    it('renders KPI grid', () => {
      render(<AnalyticsZone {...defaultProps} />);

      expect(screen.getByTestId('kpi-grid')).toBeInTheDocument();
    });

    it('applies width style from props', () => {
      const { container } = render(<AnalyticsZone {...defaultProps} width={25} />);

      const zone = container.firstChild as HTMLElement;
      expect(zone.style.width).toBe('25%');
    });
  });

  describe('Collapsed state', () => {
    it('renders expand button when collapsed', () => {
      render(<AnalyticsZone {...defaultProps} collapsed={true} />);

      expect(screen.getByTitle('Open Analytics')).toBeInTheDocument();
    });

    it('calls onCollapse(false) when expand button clicked', async () => {
      const user = userEvent.setup();
      render(<AnalyticsZone {...defaultProps} collapsed={true} />);

      await user.click(screen.getByTitle('Open Analytics'));

      expect(mockOnCollapse).toHaveBeenCalledWith(false);
    });

    it('does not render header when collapsed', () => {
      render(<AnalyticsZone {...defaultProps} collapsed={true} />);

      expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    });

    it('applies w-14 class when collapsed', () => {
      const { container } = render(<AnalyticsZone {...defaultProps} collapsed={true} />);

      const zone = container.firstChild as HTMLElement;
      expect(zone.className).toContain('w-14');
    });
  });

  describe('Saved reports', () => {
    it('renders saved reports section when reports exist', () => {
      render(
        <AnalyticsZone
          {...defaultProps}
          savedReports={[createReport()]}
        />
      );

      expect(screen.getByText('Saved Reports')).toBeInTheDocument();
    });

    it('does not render saved reports section when empty', () => {
      render(<AnalyticsZone {...defaultProps} savedReports={[]} />);

      expect(screen.queryByText('Saved Reports')).not.toBeInTheDocument();
    });

    it('renders report title', () => {
      render(
        <AnalyticsZone
          {...defaultProps}
          savedReports={[createReport({ title: 'My Report' })]}
        />
      );

      expect(screen.getByText('My Report')).toBeInTheDocument();
    });

    it('shows pinned indicator for pinned reports', () => {
      render(
        <AnalyticsZone
          {...defaultProps}
          savedReports={[createReport({ is_pinned: true })]}
        />
      );

      expect(screen.getByText('●')).toBeInTheDocument();
    });

    it('calls onReportClick when report clicked', async () => {
      const user = userEvent.setup();
      const report = createReport();
      render(<AnalyticsZone {...defaultProps} savedReports={[report]} />);

      await user.click(screen.getByText('Test Report'));

      expect(mockOnReportClick).toHaveBeenCalledWith(report);
    });

    it('renders share button for reports', () => {
      render(
        <AnalyticsZone
          {...defaultProps}
          savedReports={[createReport({ share_token: 'my-token' })]}
        />
      );

      // The share button should be in the DOM (hidden with opacity-0 but present)
      expect(screen.getByTitle('Copy share link')).toBeInTheDocument();
    });

    it('calls onReportDelete when delete button clicked', async () => {
      const user = userEvent.setup();
      render(
        <AnalyticsZone
          {...defaultProps}
          savedReports={[createReport({ id: 5 })]}
        />
      );

      // Hover to show buttons
      const reportElement = screen.getByText('Test Report').closest('div');
      fireEvent.mouseEnter(reportElement!);

      await user.click(screen.getByText('✕'));

      expect(mockOnReportDelete).toHaveBeenCalledWith(5);
    });

    it('limits displayed reports to 5', () => {
      const reports = Array.from({ length: 10 }, (_, i) =>
        createReport({ id: i + 1, title: `Report ${i + 1}` })
      );

      render(<AnalyticsZone {...defaultProps} savedReports={reports} />);

      expect(screen.getByText('Report 1')).toBeInTheDocument();
      expect(screen.getByText('Report 5')).toBeInTheDocument();
      expect(screen.queryByText('Report 6')).not.toBeInTheDocument();
    });
  });

  describe('KPI loading', () => {
    it('fetches KPIs on mount', async () => {
      (api.fetchKpis as jest.Mock).mockResolvedValue([
        { id: 'test', title: 'Test KPI', value: '100', footer: 'Test' },
      ]);

      render(<AnalyticsZone {...defaultProps} />);

      await waitFor(() => {
        expect(api.fetchKpis).toHaveBeenCalled();
      });
    });

    it('displays fallback KPIs while loading', () => {
      render(<AnalyticsZone {...defaultProps} />);

      expect(screen.getByTestId('kpi-grid')).toHaveTextContent('4 KPIs');
    });
  });

  describe('Resizing behavior', () => {
    it('removes transition class when resizing', () => {
      const { container } = render(<AnalyticsZone {...defaultProps} isResizing={true} />);

      const zone = container.firstChild as HTMLElement;
      expect(zone.className).not.toContain('transition-all');
    });

    it('includes transition class when not resizing', () => {
      const { container } = render(<AnalyticsZone {...defaultProps} isResizing={false} />);

      const zone = container.firstChild as HTMLElement;
      expect(zone.className).toContain('transition-all');
    });
  });
});
