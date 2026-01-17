/**
 * Tests for conversations API module
 */
import {
  fetchConversations,
  createConversation,
  fetchConversationMessages,
  deleteAllConversations,
  analyzeInConversation,
} from '@/lib/api/conversations';

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

describe('Conversations API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchConversations', () => {
    it('should fetch conversations successfully', async () => {
      const mockConversations = [
        { id: 1, title: 'Conv 1', created_at: '2024-01-01' },
        { id: 2, title: 'Conv 2', created_at: '2024-01-02' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ conversations: mockConversations }),
      });

      const result = await fetchConversations();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/conversations');
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchConversations();

      expect(result).toEqual([]);
    });

    it('should return empty array when conversations is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchConversations();

      expect(result).toEqual([]);
    });
  });

  describe('createConversation', () => {
    it('should create a conversation and return id', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 42 }),
      });

      const result = await createConversation();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/conversations', {
        method: 'POST',
      });
      expect(result).toBe(42);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await createConversation();

      expect(result).toBeNull();
    });
  });

  describe('fetchConversationMessages', () => {
    it('should fetch messages for a conversation', async () => {
      const mockMessages = [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi there!' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ messages: mockMessages }),
      });

      const result = await fetchConversationMessages(5);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/conversations/5/messages');
      expect(result).toEqual(mockMessages);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchConversationMessages(5);

      expect(result).toEqual([]);
    });

    it('should return empty array when messages is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await fetchConversationMessages(5);

      expect(result).toEqual([]);
    });
  });

  describe('deleteAllConversations', () => {
    it('should delete all conversations and return count', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ count: 10 }),
      });

      const result = await deleteAllConversations();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/conversations', {
        method: 'DELETE',
      });
      expect(result).toBe(10);
    });

    it('should return 0 on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await deleteAllConversations();

      expect(result).toBe(0);
    });

    it('should return 0 when count is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const result = await deleteAllConversations();

      expect(result).toBe(0);
    });
  });

  describe('analyzeInConversation', () => {
    it('should analyze a question and return response', async () => {
      const mockResponse = {
        message_id: 1,
        message: 'Analysis result',
        sql: 'SELECT * FROM users',
        data: [{ id: 1, name: 'Test' }],
        chart: { type: 'bar' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await analyzeInConversation(1, 'What is the average?');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/conversations/1/analyze',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'What is the average?', filters: undefined, use_context: false }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should pass filters when provided', async () => {
      const filters = { dateStart: '2024-01-01', dateEnd: '2024-12-31' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: 1, message: 'OK', sql: '', data: [], chart: {} }),
      });

      await analyzeInConversation(1, 'Question', filters);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/conversations/1/analyze',
        expect.objectContaining({
          body: JSON.stringify({ question: 'Question', filters, use_context: false }),
        })
      );
    });

    it('should pass useContext flag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: 1, message: 'OK', sql: '', data: [], chart: {} }),
      });

      await analyzeInConversation(1, 'Question', undefined, true);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/conversations/1/analyze',
        expect.objectContaining({
          body: JSON.stringify({ question: 'Question', filters: undefined, use_context: true }),
        })
      );
    });

    it('should pass abort signal', async () => {
      const controller = new AbortController();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: 1, message: 'OK', sql: '', data: [], chart: {} }),
      });

      await analyzeInConversation(1, 'Question', undefined, false, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/conversations/1/analyze',
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Server error' }),
      });

      await expect(analyzeInConversation(1, 'Question')).rejects.toThrow('Server error');
    });

    it('should use default error message when detail is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(analyzeInConversation(1, 'Question')).rejects.toThrow('Erreur serveur');
    });
  });
});
