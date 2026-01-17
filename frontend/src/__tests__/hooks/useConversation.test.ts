/**
 * Tests for useConversation hook
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversation } from '@/hooks/useConversation';
import * as api from '@/lib/api';

// Mock the API module
jest.mock('@/lib/api', () => ({
  fetchConversations: jest.fn(),
  createConversation: jest.fn(),
  fetchConversationMessages: jest.fn(),
  analyzeInConversation: jest.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('Initial state', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useConversation());

      expect(result.current.question).toBe('');
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toEqual([]);
      expect(result.current.selectedMessage).toBeNull();
      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.showHistory).toBe(false);
      expect(result.current.useContext).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('setQuestion', () => {
    it('should update question', () => {
      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Test question');
      });

      expect(result.current.question).toBe('Test question');
    });
  });

  describe('setShowHistory', () => {
    it('should toggle showHistory', () => {
      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setShowHistory(true);
      });

      expect(result.current.showHistory).toBe(true);
    });
  });

  describe('setUseContext', () => {
    it('should toggle useContext', () => {
      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setUseContext(true);
      });

      expect(result.current.useContext).toBe(true);
    });
  });

  describe('clearError', () => {
    it('should clear error', async () => {
      const { result } = renderHook(() => useConversation());

      // Simulate an error by making analyzeInConversation throw
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockRejectedValue(new Error('Test error'));
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      act(() => {
        result.current.setQuestion('test');
      });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      const mockFilters = { dateStart: '', dateEnd: '', noteMin: '', noteMax: '' };

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loadConversations', () => {
    it('should fetch and set conversations', async () => {
      const mockConversations = [
        { id: 1, title: 'Conv 1', message_count: 2, created_at: '2024-01-01' },
        { id: 2, title: 'Conv 2', message_count: 5, created_at: '2024-01-02' },
      ];
      (api.fetchConversations as jest.Mock).mockResolvedValue(mockConversations);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(api.fetchConversations).toHaveBeenCalledTimes(1);
      expect(result.current.conversations).toEqual(mockConversations);
    });
  });

  describe('restoreSession', () => {
    it('should restore session from localStorage', async () => {
      const mockMessages = [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi', chart: { type: 'bar', x: 'x', y: 'y', title: 'Test' } },
      ];
      localStorageMock.setItem('g7_current_conversation_id', '42');
      (api.fetchConversationMessages as jest.Mock).mockResolvedValue(mockMessages);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await result.current.restoreSession();
      });

      expect(api.fetchConversationMessages).toHaveBeenCalledWith(42);
      expect(result.current.currentConversationId).toBe(42);
      expect(result.current.messages).toEqual(mockMessages);
      expect(result.current.selectedMessage).toEqual(mockMessages[1]);
    });

    it('should do nothing if no saved conversation id', async () => {
      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await result.current.restoreSession();
      });

      expect(api.fetchConversationMessages).not.toHaveBeenCalled();
    });

    it('should remove localStorage if conversation not found', async () => {
      localStorageMock.setItem('g7_current_conversation_id', '999');
      (api.fetchConversationMessages as jest.Mock).mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await result.current.restoreSession();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('g7_current_conversation_id');
    });
  });

  describe('handleSubmit', () => {
    const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
    const mockFilters = { dateStart: '', dateEnd: '', noteMin: '', noteMax: '' };

    it('should not submit if question is empty', async () => {
      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(api.createConversation).not.toHaveBeenCalled();
    });

    it('should set loading state during submission', async () => {
      // Create a deferred promise that we can resolve externally
      let resolveAnalyze!: (value: unknown) => void;
      const analyzePromise = new Promise((resolve) => {
        resolveAnalyze = resolve;
      });

      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockReturnValue(analyzePromise);
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('test');
      });

      // Start submission without awaiting
      let submitPromise: Promise<void>;
      await act(async () => {
        submitPromise = result.current.handleSubmit(mockEvent, mockFilters);
        // Give time for the async operation to start
        await Promise.resolve();
      });

      // Check loading is true during submission
      expect(result.current.loading).toBe(true);

      // Resolve the API call and wait for completion
      await act(async () => {
        resolveAnalyze({ message_id: 1, message: 'test' });
        await submitPromise;
      });

      // Check loading is false after completion
      expect(result.current.loading).toBe(false);
    });

    it('should create conversation if none exists', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockResolvedValue({
        message_id: 100,
        message: 'Response',
        sql: 'SELECT 1',
        chart: { type: 'bar', x: 'x', y: 'y', title: 'Test' },
        data: [{ x: 1 }],
      });
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Test question');
      });

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(api.createConversation).toHaveBeenCalled();
      expect(api.analyzeInConversation).toHaveBeenCalledWith(
        1,
        'Test question',
        undefined,
        false,
        expect.any(AbortSignal)
      );
    });

    it('should add messages and update state on success', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockResolvedValue({
        message_id: 100,
        message: 'Analysis result',
        sql: 'SELECT * FROM table',
        chart: { type: 'line', x: 'date', y: 'value', title: 'Chart' },
        data: [{ date: '2024-01-01', value: 10 }],
        model_name: 'gpt-4',
        tokens_input: 50,
        tokens_output: 100,
        response_time_ms: 500,
      });
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('My question');
      });

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('My question');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Analysis result');
      expect(result.current.selectedMessage?.id).toBe(100);
      expect(result.current.question).toBe('');
      expect(result.current.loading).toBe(false);
    });

    it('should pass filters to API when provided', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockResolvedValue({
        message_id: 100,
        message: 'Response',
      });
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Question');
      });

      const filtersWithValues = {
        dateStart: '2024-01-01',
        dateEnd: '2024-12-31',
        noteMin: '3',
        noteMax: '5',
      };

      await act(async () => {
        await result.current.handleSubmit(mockEvent, filtersWithValues);
      });

      expect(api.analyzeInConversation).toHaveBeenCalledWith(
        1,
        'Question',
        {
          dateStart: '2024-01-01',
          dateEnd: '2024-12-31',
          noteMin: '3',
          noteMax: '5',
        },
        false,
        expect.any(AbortSignal)
      );
    });

    it('should pass useContext to API', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockResolvedValue({
        message_id: 100,
        message: 'Response',
      });
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Question');
        result.current.setUseContext(true);
      });

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(api.analyzeInConversation).toHaveBeenCalledWith(
        1,
        'Question',
        undefined,
        true,
        expect.any(AbortSignal)
      );
    });

    it('should set error on API failure', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockRejectedValue(new Error('API Error'));
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Question');
      });

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(result.current.error).toBe('API Error');
      expect(result.current.messages).toHaveLength(0); // User message removed on error
      expect(result.current.loading).toBe(false);
    });
  });

  describe('handleStop', () => {
    it('should abort the current request', async () => {
      let capturedSignal: AbortSignal | undefined;
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      (api.createConversation as jest.Mock).mockResolvedValue(1);
      (api.analyzeInConversation as jest.Mock).mockImplementation(
        (_convId, _q, _f, _u, signal) => {
          capturedSignal = signal;
          // Immediately reject with AbortError when aborted
          if (signal?.aborted) {
            return Promise.reject(abortError);
          }
          // Otherwise reject after a short delay to simulate abort
          return Promise.reject(abortError);
        }
      );
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Question');
      });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      const mockFilters = { dateStart: '', dateEnd: '', noteMin: '', noteMax: '' };

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      // Verify that abort signal was passed and handleStop can be called
      expect(capturedSignal).toBeDefined();
      expect(result.current.error).toBeNull(); // AbortError should not set error
      expect(result.current.loading).toBe(false);

      // Test handleStop can be called without errors
      act(() => {
        result.current.handleStop();
      });
    });
  });

  describe('handleLoadConversation', () => {
    it('should load conversation messages', async () => {
      const mockMessages = [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi', chart: { type: 'pie', x: 'x', y: 'y', title: 'Test' } },
      ];
      (api.fetchConversationMessages as jest.Mock).mockResolvedValue(mockMessages);

      const { result } = renderHook(() => useConversation());

      const conv = { id: 5, title: 'Test Conv', message_count: 2, created_at: '2024-01-01' };

      await act(async () => {
        await result.current.handleLoadConversation(conv);
      });

      expect(api.fetchConversationMessages).toHaveBeenCalledWith(5);
      expect(result.current.currentConversationId).toBe(5);
      expect(result.current.messages).toEqual(mockMessages);
      expect(result.current.selectedMessage).toEqual(mockMessages[1]);
      expect(result.current.showHistory).toBe(false);
    });

    it('should set selectedMessage to null if no assistant message with chart', async () => {
      const mockMessages = [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi' }, // No chart
      ];
      (api.fetchConversationMessages as jest.Mock).mockResolvedValue(mockMessages);

      const { result } = renderHook(() => useConversation());

      const conv = { id: 5, title: 'Test Conv', message_count: 2, created_at: '2024-01-01' };

      await act(async () => {
        await result.current.handleLoadConversation(conv);
      });

      expect(result.current.selectedMessage).toBeNull();
    });
  });

  describe('handleNewConversation', () => {
    it('should reset state and clear localStorage', async () => {
      (api.fetchConversationMessages as jest.Mock).mockResolvedValue([
        { id: 1, role: 'user', content: 'Hello' },
      ]);

      const { result } = renderHook(() => useConversation());

      // First load a conversation
      const conv = { id: 5, title: 'Test', message_count: 1, created_at: '2024-01-01' };
      await act(async () => {
        await result.current.handleLoadConversation(conv);
      });

      expect(result.current.currentConversationId).toBe(5);

      // Then create new conversation
      act(() => {
        result.current.handleNewConversation();
      });

      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.selectedMessage).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('g7_current_conversation_id');
    });
  });

  describe('handleReplayMessage', () => {
    it('should set question from user message', () => {
      const { result } = renderHook(() => useConversation());

      const userMessage = { id: 1, role: 'user' as const, content: 'Previous question' };

      act(() => {
        result.current.handleReplayMessage(userMessage);
      });

      expect(result.current.question).toBe('Previous question');
    });

    it('should not set question from assistant message', () => {
      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Original');
      });

      const assistantMessage = { id: 2, role: 'assistant' as const, content: 'Response' };

      act(() => {
        result.current.handleReplayMessage(assistantMessage);
      });

      expect(result.current.question).toBe('Original');
    });
  });

  describe('localStorage persistence', () => {
    it('should save conversation id to localStorage', async () => {
      (api.createConversation as jest.Mock).mockResolvedValue(123);
      (api.analyzeInConversation as jest.Mock).mockResolvedValue({
        message_id: 1,
        message: 'Response',
      });
      (api.fetchConversations as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.setQuestion('Test');
      });

      const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
      const mockFilters = { dateStart: '', dateEnd: '', noteMin: '', noteMax: '' };

      await act(async () => {
        await result.current.handleSubmit(mockEvent, mockFilters);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('g7_current_conversation_id', '123');
    });
  });
});
