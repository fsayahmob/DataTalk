/**
 * Tests for LLM API module
 */
import {
  fetchLLMStatus,
  saveApiKey,
  saveProviderConfig,
  fetchLLMProviders,
  fetchLLMModels,
  fetchDefaultModel,
  setDefaultModel,
  fetchLLMCosts,
  fetchLLMPrompts,
  setActivePromptVersion,
  fetchPrompts,
  fetchPrompt,
  updatePrompt,
} from '@/lib/api/llm';
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

describe('LLM API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchLLMStatus', () => {
    it('should fetch LLM status successfully', async () => {
      const mockStatus = { status: 'ok', model: 'gemini-2.0-flash', provider: 'google' };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockStatus),
      });

      const result = await fetchLLMStatus();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/status');
      expect(result).toEqual(mockStatus);
    });

    it('should return error status on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLLMStatus();

      expect(result).toEqual({ status: 'error', message: 'Connexion impossible' });
    });
  });

  describe('saveApiKey', () => {
    it('should save API key successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await saveApiKey('google', 'my-api-key');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_name: 'google', api_key: 'my-api-key' }),
      });
      expect(result).toBe(true);
    });

    it('should return false when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await saveApiKey('google', 'invalid');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await saveApiKey('google', 'key');

      expect(result).toBe(false);
    });
  });

  describe('saveProviderConfig', () => {
    it('should save provider config with base URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await saveProviderConfig('ollama', 'http://localhost:11434');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/providers/ollama/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: 'http://localhost:11434' }),
      });
      expect(result).toBe(true);
    });

    it('should save provider config with null base URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await saveProviderConfig('google', null);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/providers/google/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: null }),
      });
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await saveProviderConfig('ollama', 'url');

      expect(result).toBe(false);
    });
  });

  describe('fetchLLMProviders', () => {
    it('should fetch providers successfully', async () => {
      const mockProviders = [
        { id: 1, name: 'google', display_name: 'Google AI' },
        { id: 2, name: 'ollama', display_name: 'Ollama' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ providers: mockProviders }),
      });

      const result = await fetchLLMProviders();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/providers');
      expect(result).toEqual(mockProviders);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLLMProviders();

      expect(result).toEqual([]);
    });

    it('should return empty array when providers is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchLLMProviders();

      expect(result).toEqual([]);
    });
  });

  describe('fetchLLMModels', () => {
    it('should fetch all models when no provider specified', async () => {
      const mockModels = [
        { id: 1, model_id: 'gemini-2.0-flash', display_name: 'Gemini Flash' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ models: mockModels }),
      });

      const result = await fetchLLMModels();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/models');
      expect(result).toEqual(mockModels);
    });

    it('should fetch models for specific provider', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ models: [] }),
      });

      await fetchLLMModels('google');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/models?provider_name=google');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLLMModels();

      expect(result).toEqual([]);
    });
  });

  describe('fetchDefaultModel', () => {
    it('should fetch default model successfully', async () => {
      const mockModel = { id: 1, model_id: 'gemini-2.0-flash', is_default: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ model: mockModel }),
      });

      const result = await fetchDefaultModel();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/models/default');
      expect(result).toEqual(mockModel);
    });

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchDefaultModel();

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchDefaultModel();

      expect(result).toBeNull();
    });
  });

  describe('setDefaultModel', () => {
    it('should set default model successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setDefaultModel('5');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/models/default/5', {
        method: 'PUT',
      });
      expect(result).toBe(true);
    });

    it('should return false when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await setDefaultModel('999');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setDefaultModel('1');

      expect(result).toBe(false);
    });
  });

  describe('fetchLLMCosts', () => {
    it('should fetch costs with default days', async () => {
      const mockCosts = {
        period_days: 30,
        total: { total_calls: 100, total_cost: 5.0 },
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockCosts),
      });

      const result = await fetchLLMCosts();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/costs?days=30');
      expect(result).toEqual(mockCosts);
    });

    it('should fetch costs with custom days', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ period_days: 7 }),
      });

      await fetchLLMCosts(7);

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/costs?days=7');
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLLMCosts();

      expect(result).toBeNull();
    });
  });

  describe('fetchLLMPrompts', () => {
    it('should fetch all prompts when no category', async () => {
      const mockPrompts = [{ id: 1, key: 'sql_gen', name: 'SQL Generator' }];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ prompts: mockPrompts }),
      });

      const result = await fetchLLMPrompts();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/prompts');
      expect(result).toEqual(mockPrompts);
    });

    it('should fetch prompts by category', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ prompts: [] }),
      });

      await fetchLLMPrompts('analysis');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/prompts?category=analysis');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchLLMPrompts();

      expect(result).toEqual([]);
    });
  });

  describe('setActivePromptVersion', () => {
    it('should set active prompt version successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await setActivePromptVersion('sql_gen', 'v2');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/llm/prompts/sql_gen/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 'v2' }),
      });
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setActivePromptVersion('key', 'v1');

      expect(result).toBe(false);
    });
  });

  describe('fetchPrompts (legacy)', () => {
    it('should fetch prompts from legacy endpoint', async () => {
      const mockPrompts = [{ id: 1, key: 'prompt1' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompts: mockPrompts }),
      });

      const result = await fetchPrompts();

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/prompts');
      expect(result).toEqual(mockPrompts);
    });

    it('should return empty array when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchPrompts();

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchPrompts();

      expect(result).toEqual([]);
    });
  });

  describe('fetchPrompt (legacy)', () => {
    it('should fetch a single prompt', async () => {
      const mockPrompt = { id: 1, key: 'sql_gen', content: 'Generate SQL...' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPrompt),
      });

      const result = await fetchPrompt('sql_gen');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/prompts/sql_gen');
      expect(result).toEqual(mockPrompt);
    });

    it('should return null when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchPrompt('unknown');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchPrompt('key');

      expect(result).toBeNull();
    });
  });

  describe('updatePrompt (legacy)', () => {
    it('should update a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await updatePrompt('sql_gen', 'New content');

      expectFetchCalledWith(mockFetch, 'http://localhost:8000/prompts/sql_gen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New content' }),
      });
      expect(result).toBe(true);
    });

    it('should return false when not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await updatePrompt('key', 'content');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await updatePrompt('key', 'content');

      expect(result).toBe(false);
    });
  });
});
