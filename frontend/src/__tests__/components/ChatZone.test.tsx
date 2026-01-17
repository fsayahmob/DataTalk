/**
 * Tests for ChatZone component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatZone } from '@/components/ChatZone';
import { Message, PredefinedQuestion, Conversation } from '@/types';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'chat.open': 'Ouvrir le chat',
    };
    return translations[key] || key;
  },
}));

// Mock child components
jest.mock('@/components/chat', () => ({
  ChatHeader: ({ onCollapse, onNewConversation, onShowHistoryChange, showHistory }: {
    onCollapse: () => void;
    onNewConversation: () => void;
    onShowHistoryChange: (show: boolean) => void;
    showHistory: boolean;
  }) => (
    <div data-testid="chat-header">
      <button data-testid="collapse-btn" onClick={onCollapse}>Collapse</button>
      <button data-testid="new-conv-btn" onClick={onNewConversation}>New</button>
      <button data-testid="history-btn" onClick={() => onShowHistoryChange(!showHistory)}>History</button>
    </div>
  ),
  ChatHistory: ({ conversations, onLoadConversation }: {
    conversations: Conversation[];
    onLoadConversation: (conv: Conversation) => void;
  }) => (
    <div data-testid="chat-history">
      {conversations.map(c => (
        <button key={c.id} onClick={() => onLoadConversation(c)}>{c.title}</button>
      ))}
    </div>
  ),
  ChatMessages: ({ messages, loading }: { messages: Message[]; loading: boolean }) => (
    <div data-testid="chat-messages">
      {messages.length} messages
      {loading && <span>Loading...</span>}
    </div>
  ),
  ChatInput: ({ question, onQuestionChange, onSubmit }: {
    question: string;
    onQuestionChange: (q: string) => void;
    onSubmit: (e: React.FormEvent) => void;
  }) => (
    <form data-testid="chat-input" onSubmit={onSubmit}>
      <input
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        data-testid="question-input"
      />
      <button type="submit">Send</button>
    </form>
  ),
}));

describe('ChatZone', () => {
  const mockMessages: Message[] = [
    { id: 1, role: 'user', content: 'Hello' },
    { id: 2, role: 'assistant', content: 'Hi there' },
  ];

  const mockConversations: Conversation[] = [
    { id: 1, title: 'Conv 1', message_count: 5, created_at: '2024-01-01' },
  ];

  const mockPredefinedQuestions: PredefinedQuestion[] = [
    { id: 1, question: 'Test?', category: 'Test', icon: '?' },
  ];

  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
    width: 30,
    isResizing: false,
    messages: mockMessages,
    loading: false,
    question: '',
    onQuestionChange: jest.fn(),
    onSubmit: jest.fn(),
    selectedMessage: null,
    onSelectMessage: jest.fn(),
    conversations: mockConversations,
    currentConversationId: null,
    showHistory: false,
    onShowHistoryChange: jest.fn(),
    onLoadConversation: jest.fn(),
    onNewConversation: jest.fn(),
    predefinedQuestions: mockPredefinedQuestions,
    onQuestionClick: jest.fn(),
    onReplayMessage: jest.fn(),
    onStop: jest.fn(),
    useContext: false,
    onUseContextChange: jest.fn(),
    onDeleteAllConversations: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Expanded state', () => {
    it('should render all chat components when not collapsed', () => {
      render(<ChatZone {...defaultProps} />);

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('should not render history by default', () => {
      render(<ChatZone {...defaultProps} showHistory={false} />);

      expect(screen.queryByTestId('chat-history')).not.toBeInTheDocument();
    });

    it('should render history when showHistory is true', () => {
      render(<ChatZone {...defaultProps} showHistory={true} />);

      expect(screen.getByTestId('chat-history')).toBeInTheDocument();
    });

    it('should apply width style when not collapsed', () => {
      const { container } = render(<ChatZone {...defaultProps} width={35} />);

      const chatZone = container.firstChild as HTMLElement;
      expect(chatZone).toHaveStyle({ width: '35%' });
    });
  });

  describe('Collapsed state', () => {
    it('should render expand button when collapsed', () => {
      render(<ChatZone {...defaultProps} collapsed={true} />);

      expect(screen.getByTitle('Ouvrir le chat')).toBeInTheDocument();
    });

    it('should not render chat components when collapsed', () => {
      render(<ChatZone {...defaultProps} collapsed={true} />);

      expect(screen.queryByTestId('chat-header')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chat-messages')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    });

    it('should call onCollapse(false) when expand button is clicked', () => {
      const onCollapse = jest.fn();
      render(<ChatZone {...defaultProps} collapsed={true} onCollapse={onCollapse} />);

      fireEvent.click(screen.getByTitle('Ouvrir le chat'));

      expect(onCollapse).toHaveBeenCalledWith(false);
    });

    it('should have fixed width when collapsed', () => {
      const { container } = render(<ChatZone {...defaultProps} collapsed={true} />);

      const chatZone = container.firstChild as HTMLElement;
      expect(chatZone).toHaveClass('w-14');
    });
  });

  describe('Interactions', () => {
    it('should call onCollapse from header collapse button', () => {
      const onCollapse = jest.fn();
      render(<ChatZone {...defaultProps} onCollapse={onCollapse} />);

      fireEvent.click(screen.getByTestId('collapse-btn'));

      expect(onCollapse).toHaveBeenCalledWith(true);
    });

    it('should call onNewConversation from header', () => {
      const onNewConversation = jest.fn();
      render(<ChatZone {...defaultProps} onNewConversation={onNewConversation} />);

      fireEvent.click(screen.getByTestId('new-conv-btn'));

      expect(onNewConversation).toHaveBeenCalled();
    });

    it('should call onShowHistoryChange from header', () => {
      const onShowHistoryChange = jest.fn();
      render(<ChatZone {...defaultProps} onShowHistoryChange={onShowHistoryChange} />);

      fireEvent.click(screen.getByTestId('history-btn'));

      expect(onShowHistoryChange).toHaveBeenCalledWith(true);
    });

    it('should call onLoadConversation from history', () => {
      const onLoadConversation = jest.fn();
      render(
        <ChatZone
          {...defaultProps}
          showHistory={true}
          onLoadConversation={onLoadConversation}
        />
      );

      fireEvent.click(screen.getByText('Conv 1'));

      expect(onLoadConversation).toHaveBeenCalledWith(mockConversations[0]);
    });

    it('should call onSubmit from input', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatZone {...defaultProps} onSubmit={onSubmit} />);

      fireEvent.submit(screen.getByTestId('chat-input'));

      expect(onSubmit).toHaveBeenCalled();
    });

    it('should call onQuestionChange from input', () => {
      const onQuestionChange = jest.fn();
      render(<ChatZone {...defaultProps} onQuestionChange={onQuestionChange} />);

      fireEvent.change(screen.getByTestId('question-input'), {
        target: { value: 'New question' },
      });

      expect(onQuestionChange).toHaveBeenCalledWith('New question');
    });
  });

  describe('Transition classes', () => {
    it('should have transition class when not resizing', () => {
      const { container } = render(<ChatZone {...defaultProps} isResizing={false} />);

      const chatZone = container.firstChild as HTMLElement;
      expect(chatZone).toHaveClass('transition-all');
    });

    it('should not have transition class when resizing', () => {
      const { container } = render(<ChatZone {...defaultProps} isResizing={true} />);

      const chatZone = container.firstChild as HTMLElement;
      expect(chatZone).not.toHaveClass('transition-all');
    });
  });
});
