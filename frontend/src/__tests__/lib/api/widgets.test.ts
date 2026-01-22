/**
 * Tests for widgets API module
 */
import { fetchSuggestedQuestions, fetchKpis } from '@/lib/api/widgets';
import { expectFetchCalledWith } from './helpers';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console.error during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe('Widgets API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchSuggestedQuestions', () => {
    it('should fetch suggested questions successfully', async () => {
      const mockQuestions = [
        {
          id: 1,
          question: 'What is the average rating?',
          category: 'Satisfaction',
          icon: '⭐',
          business_value: 'High',
          display_order: 1,
          is_enabled: true,
        },
        {
          id: 2,
          question: 'Top 10 drivers',
          category: 'Performance',
          icon: '🏆',
          business_value: 'Medium',
          display_order: 2,
          is_enabled: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ questions: mockQuestions }),
      });

      const result = await fetchSuggestedQuestions();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/suggested-questions');
      expect(result).toEqual(mockQuestions);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchSuggestedQuestions();

      expect(result).toEqual([]);
    });

    it('should return empty array when questions is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchSuggestedQuestions();

      expect(result).toEqual([]);
    });

    it('should handle questions with null optional fields', async () => {
      const mockQuestions = [
        {
          id: 1,
          question: 'Test question',
          category: null,
          icon: null,
          business_value: null,
          display_order: 1,
          is_enabled: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ questions: mockQuestions }),
      });

      const result = await fetchSuggestedQuestions();

      expect(result).toEqual(mockQuestions);
    });
  });

  describe('fetchKpis', () => {
    it('should fetch KPIs successfully', async () => {
      const mockKpis = [
        {
          id: 'avg_rating',
          title: 'Average Rating',
          value: 4.2,
          trend: { value: 5, direction: 'up', label: '+5%' },
          sparkline: { data: [4.0, 4.1, 4.2], type: 'area' },
          footer: 'Based on 1000 reviews',
        },
        {
          id: 'total_trips',
          title: 'Total Trips',
          value: '15,234',
          trend: { value: 10, direction: 'down', invert: true },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ kpis: mockKpis }),
      });

      const result = await fetchKpis();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/kpis');
      expect(result).toEqual(mockKpis);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchKpis();

      expect(result).toEqual([]);
    });

    it('should return empty array when kpis is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchKpis();

      expect(result).toEqual([]);
    });

    it('should handle KPIs without optional fields', async () => {
      const mockKpis = [
        {
          id: 'simple_kpi',
          title: 'Simple KPI',
          value: 100,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ kpis: mockKpis }),
      });

      const result = await fetchKpis();

      expect(result).toEqual(mockKpis);
    });

    it('should handle KPIs with sparkline bar type', async () => {
      const mockKpis = [
        {
          id: 'bar_chart_kpi',
          title: 'Bar Chart KPI',
          value: 50,
          sparkline: { data: [10, 20, 30, 40, 50], type: 'bar' },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ kpis: mockKpis }),
      });

      const result = await fetchKpis();

      expect(result).toEqual(mockKpis);
      expect(result[0].sparkline?.type).toBe('bar');
    });
  });
});
