/**
 * Tests for settings API module
 */
import {
  fetchCatalogContextMode,
  setCatalogContextMode,
  fetchDatabaseStatus,
  setDuckdbPath,
  fetchMaxTablesPerBatch,
  setMaxTablesPerBatch,
  fetchMaxChartRows,
  setMaxChartRows,
} from '@/lib/api/settings';
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

describe('Settings API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchCatalogContextMode', () => {
    it('should fetch context mode successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: 'compact' }),
      });

      const result = await fetchCatalogContextMode();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/catalog_context_mode');
      expect(result).toBe('compact');
    });

    it('should return "full" as default when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchCatalogContextMode();

      expect(result).toBe('full');
    });

    it('should return "full" as default on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchCatalogContextMode();

      expect(result).toBe('full');
    });
  });

  describe('setCatalogContextMode', () => {
    it('should set context mode to compact', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setCatalogContextMode('compact');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/catalog_context_mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'compact' }),
      });
      expect(result).toBe(true);
    });

    it('should set context mode to full', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setCatalogContextMode('full');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/catalog_context_mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'full' }),
      });
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await setCatalogContextMode('compact');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setCatalogContextMode('compact');

      expect(result).toBe(false);
    });
  });

  describe('fetchDatabaseStatus', () => {
    it('should fetch database status successfully', async () => {
      const mockStatus = {
        status: 'connected',
        path: '/data/db.duckdb',
        configured_path: '/data/db.duckdb',
        engine: 'duckdb',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      const result = await fetchDatabaseStatus();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/database/status');
      expect(result).toEqual(mockStatus);
    });

    it('should return null when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchDatabaseStatus();

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchDatabaseStatus();

      expect(result).toBeNull();
    });
  });

  describe('setDuckdbPath', () => {
    it('should set duckdb path successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resolved_path: '/absolute/path/to/db.duckdb' }),
      });

      const result = await setDuckdbPath('/path/to/db.duckdb');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/duckdb_path', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '/path/to/db.duckdb' }),
      });
      expect(result).toEqual({
        success: true,
        resolved_path: '/absolute/path/to/db.duckdb',
      });
    });

    it('should return error when not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'File not found' }),
      });

      const result = await setDuckdbPath('/invalid/path');

      expect(result).toEqual({
        success: false,
        error: 'File not found',
      });
    });

    it('should use default error when detail is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const result = await setDuckdbPath('/invalid/path');

      expect(result).toEqual({
        success: false,
        error: 'Erreur',
      });
    });

    it('should return error on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setDuckdbPath('/path');

      expect(result).toEqual({
        success: false,
        error: 'Error: Network error',
      });
    });
  });

  describe('fetchMaxTablesPerBatch', () => {
    it('should fetch max tables per batch successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: '20' }),
      });

      const result = await fetchMaxTablesPerBatch();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/max_tables_per_batch');
      expect(result).toBe(20);
    });

    it('should return default 15 when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchMaxTablesPerBatch();

      expect(result).toBe(15);
    });

    it('should return default 15 on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchMaxTablesPerBatch();

      expect(result).toBe(15);
    });

    it('should return default 15 when value is not a number', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: 'invalid' }),
      });

      const result = await fetchMaxTablesPerBatch();

      expect(result).toBe(15);
    });
  });

  describe('setMaxTablesPerBatch', () => {
    it('should set max tables per batch successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setMaxTablesPerBatch(25);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/max_tables_per_batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '25' }),
      });
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await setMaxTablesPerBatch(10);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setMaxTablesPerBatch(10);

      expect(result).toBe(false);
    });
  });

  describe('fetchMaxChartRows', () => {
    it('should fetch max chart rows successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: '10000' }),
      });

      const result = await fetchMaxChartRows();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/max_chart_rows');
      expect(result).toBe(10000);
    });

    it('should return default 5000 when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchMaxChartRows();

      expect(result).toBe(5000);
    });

    it('should return default 5000 on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchMaxChartRows();

      expect(result).toBe(5000);
    });

    it('should return default 5000 when value is not a number', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: 'not-a-number' }),
      });

      const result = await fetchMaxChartRows();

      expect(result).toBe(5000);
    });
  });

  describe('setMaxChartRows', () => {
    it('should set max chart rows successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setMaxChartRows(8000);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings/max_chart_rows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '8000' }),
      });
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await setMaxChartRows(1000);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setMaxChartRows(1000);

      expect(result).toBe(false);
    });
  });
});
