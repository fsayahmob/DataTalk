/**
 * Tests for catalog API module
 */
import {
  fetchCatalog,
  generateCatalog,
  extractCatalog,
  enrichCatalog,
  deleteCatalog,
  toggleTableEnabled,
  updateColumnDescription,
  fetchLatestRun,
  fetchRun,
  fetchCatalogJobs,
  fetchRuns,
} from '@/lib/api/catalog';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console during tests
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
beforeAll(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

describe('Catalog API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchCatalog', () => {
    it('should fetch catalog successfully', async () => {
      const mockCatalog = {
        catalog: [
          {
            id: 1,
            name: 'main',
            type: 'duckdb',
            tables: [{ name: 'users', columns: [] }],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockCatalog),
      });

      const result = await fetchCatalog();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog');
      expect(result).toEqual(mockCatalog);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchCatalog();

      expect(result).toBeNull();
    });
  });

  describe('generateCatalog', () => {
    it('should generate catalog successfully', async () => {
      const mockResponse = {
        status: 'success',
        message: 'Catalog generated',
        tables_count: 5,
        columns_count: 25,
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await generateCatalog();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/generate', {
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await generateCatalog();

      expect(result).toBeNull();
    });
  });

  describe('extractCatalog', () => {
    it('should extract catalog successfully', async () => {
      const mockResponse = {
        status: 'success',
        message: 'Extraction complete',
        tables_count: 3,
        columns_count: 15,
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await extractCatalog();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/extract', {
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await extractCatalog();

      expect(result).toBeNull();
    });
  });

  describe('enrichCatalog', () => {
    it('should enrich catalog with table IDs', async () => {
      const mockResponse = {
        status: 'success',
        message: 'Enrichment complete',
        tables_count: 2,
        columns_count: 10,
        synonyms_count: 5,
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await enrichCatalog([1, 2, 3]);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_ids: [1, 2, 3] }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await enrichCatalog([1]);

      expect(result).toBeNull();
    });
  });

  describe('deleteCatalog', () => {
    it('should delete catalog successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await deleteCatalog();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog', {
        method: 'DELETE',
      });
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await deleteCatalog();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await deleteCatalog();

      expect(result).toBe(false);
    });
  });

  describe('toggleTableEnabled', () => {
    it('should toggle table enabled status', async () => {
      const mockResponse = {
        status: 'success',
        table_id: 5,
        is_enabled: false,
        message: 'Table disabled',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await toggleTableEnabled(5);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/tables/5/toggle', {
        method: 'PATCH',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await toggleTableEnabled(5);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await toggleTableEnabled(5);

      expect(result).toBeNull();
    });
  });

  describe('updateColumnDescription', () => {
    it('should update column description successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await updateColumnDescription(10, 'New description');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/catalog/columns/10/description',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'New description' }),
        }
      );
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await updateColumnDescription(10, 'desc');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await updateColumnDescription(10, 'desc');

      expect(result).toBe(false);
    });
  });

  describe('fetchLatestRun', () => {
    it('should fetch latest run successfully', async () => {
      const mockRun = {
        run: [
          { id: 1, run_id: 'abc', job_type: 'extraction', status: 'completed' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRun),
      });

      const result = await fetchLatestRun();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/latest-run');
      expect(result).toEqual(mockRun);
    });

    it('should return empty run array on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetchLatestRun();

      expect(result).toEqual({ run: [] });
    });

    it('should return empty run array on other error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await fetchLatestRun();

      expect(result).toEqual({ run: [] });
    });

    it('should return empty run array on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLatestRun();

      expect(result).toEqual({ run: [] });
    });
  });

  describe('fetchRun', () => {
    it('should fetch run by ID successfully', async () => {
      const mockRun = {
        run: [
          { id: 1, run_id: 'run-123', job_type: 'enrichment', status: 'running' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRun),
      });

      const result = await fetchRun('run-123');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/run/run-123');
      expect(result).toEqual(mockRun);
    });

    it('should return empty run array on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetchRun('unknown');

      expect(result).toEqual({ run: [] });
    });

    it('should return empty run array on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchRun('run-123');

      expect(result).toEqual({ run: [] });
    });
  });

  describe('fetchCatalogJobs', () => {
    it('should fetch jobs with default limit', async () => {
      const mockJobs = [
        { id: 1, job_type: 'extraction', status: 'completed' },
        { id: 2, job_type: 'enrichment', status: 'pending' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ jobs: mockJobs }),
      });

      const result = await fetchCatalogJobs();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/jobs?limit=50');
      expect(result).toEqual(mockJobs);
    });

    it('should fetch jobs with custom limit', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ jobs: [] }),
      });

      await fetchCatalogJobs(10);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/jobs?limit=10');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchCatalogJobs();

      expect(result).toEqual([]);
    });

    it('should return empty array when jobs is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchCatalogJobs();

      expect(result).toEqual([]);
    });
  });

  describe('fetchRuns', () => {
    it('should fetch all runs successfully', async () => {
      const mockRuns = [
        { id: 1, run_id: 'run-1', job_type: 'extraction' },
        { id: 2, run_id: 'run-2', job_type: 'enrichment' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ runs: mockRuns }),
      });

      const result = await fetchRuns();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/catalog/runs');
      expect(result).toEqual(mockRuns);
    });

    it('should return empty array when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchRuns();

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchRuns();

      expect(result).toEqual([]);
    });

    it('should return empty array when runs is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchRuns();

      expect(result).toEqual([]);
    });
  });
});
