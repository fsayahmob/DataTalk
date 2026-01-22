/**
 * Tests for reports API module
 */
import {
  fetchSavedReports,
  saveReport,
  deleteReport,
  executeReport,
  fetchSharedReport,
} from '@/lib/api/reports';
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

describe('Reports API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchSavedReports', () => {
    it('should fetch saved reports successfully', async () => {
      const mockReports = [
        { id: 1, title: 'Report 1', question: 'Q1' },
        { id: 2, title: 'Report 2', question: 'Q2' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ reports: mockReports }),
      });

      const result = await fetchSavedReports();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/reports');
      expect(result).toEqual(mockReports);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchSavedReports();

      expect(result).toEqual([]);
    });

    it('should return empty array when reports is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchSavedReports();

      expect(result).toEqual([]);
    });
  });

  describe('saveReport', () => {
    it('should save a report successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 1 }),
      });

      const result = await saveReport(
        'My Report',
        'What is the average?',
        'SELECT AVG(value) FROM data',
        '{"type": "bar"}',
        42
      );

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'My Report',
          question: 'What is the average?',
          sql_query: 'SELECT AVG(value) FROM data',
          chart_config: '{"type": "bar"}',
          message_id: 42,
        }),
      });
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await saveReport('Title', 'Q', 'SQL', '{}', 1);

      expect(result).toBe(false);
    });
  });

  describe('deleteReport', () => {
    it('should delete a report successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await deleteReport(5);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/reports/5', {
        method: 'DELETE',
      });
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await deleteReport(5);

      expect(result).toBe(false);
    });
  });

  describe('executeReport', () => {
    it('should execute a report and return data', async () => {
      const mockResponse = {
        report_id: 1,
        title: 'Report',
        sql: 'SELECT * FROM users',
        chart: { type: 'bar' },
        data: [{ id: 1, name: 'Test' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await executeReport(1);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/reports/1/execute', {
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Report not found' }),
      });

      await expect(executeReport(999)).rejects.toThrow('Report not found');
    });

    it('should use default error message when detail is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(executeReport(999)).rejects.toThrow('Erreur exécution rapport');
    });
  });

  describe('fetchSharedReport', () => {
    it('should fetch a shared report by token', async () => {
      const mockResponse = {
        title: 'Shared Report',
        question: 'What is this?',
        sql: 'SELECT 1',
        chart: { type: 'line' },
        data: [{ value: 1 }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await fetchSharedReport('abc123');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/reports/shared/abc123');
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Token invalid' }),
      });

      await expect(fetchSharedReport('invalid')).rejects.toThrow('Token invalid');
    });

    it('should use default error message when detail is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(fetchSharedReport('invalid')).rejects.toThrow('Rapport non trouvé');
    });
  });
});
