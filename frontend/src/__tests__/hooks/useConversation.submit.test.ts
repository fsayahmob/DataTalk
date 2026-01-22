/**
 * Tests for useConversation hook - handleSubmit functionality
 *
 * Note: useConversation now uses useConversationStore (Zustand) for state management.
 * We reset the store between tests.
 */
import { renderHook, act } from '@testing-library/react';
import { useConversation } from '@/hooks/useConversation';
import { useConversationStore } from '@/stores/useConversationStore';
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

// Helper to reset store between tests
const resetStore = () => {
  useConversationStore.setState({
    question: "",
    loading: false,
    messages: [],
    selectedMessage: null,
    conversations: [],
    currentConversationId: null,
    showHistory: false,
    useContext: false,
    error: null,
    _abortController: null,
  });
};

describe('useConversation - handleSubmit', () => {
  const mockEvent = { preventDefault: jest.fn() } as unknown as React.FormEvent;
  const mockFilters = { dateStart: '', dateEnd: '', noteMin: '', noteMax: '' };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    resetStore();
  });

  it('should not submit if question is empty', async () => {
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.handleSubmit(mockEvent, mockFilters);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('should set loading state during submission', async () => {
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

    let submitPromise: Promise<void>;
    await act(async () => {
      submitPromise = result.current.handleSubmit(mockEvent, mockFilters);
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveAnalyze({ message_id: 1, message: 'test' });
      await submitPromise;
    });

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
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});
