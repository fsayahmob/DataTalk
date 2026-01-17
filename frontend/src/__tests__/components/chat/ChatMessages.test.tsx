/**
 * Tests for ChatMessages component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { Message, PredefinedQuestion } from '@/types';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'chat.ask_natural_language': 'Posez votre question en langage naturel',
      'chat.or_select_suggestion': 'Ou sélectionnez une suggestion',
      'chat.analyzing': 'Analyse en cours',
      'chat.retry': 'Réessayer',
    };
    return translations[key] || key;
  },
}));

// Mock react-markdown
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children }: { children: string }) {
    return <div data-testid="markdown-content">{children}</div>;
  };
});

// Mock PredefinedQuestions component
jest.mock('@/components/PredefinedQuestions', () => ({
  PredefinedQuestions: ({ questions, onQuestionClick }: { questions: PredefinedQuestion[], onQuestionClick: (q: string) => void }) => (
    <div data-testid="predefined-questions">
      {questions.map((q) => (
        <button key={q.id} onClick={() => onQuestionClick(q.question)}>
          {q.question}
        </button>
      ))}
    </div>
  ),
}));

// Mock scrollIntoView
const mockScrollIntoView = jest.fn();
Element.prototype.scrollIntoView = mockScrollIntoView;

describe('ChatMessages', () => {
  const defaultProps = {
    messages: [] as Message[],
    loading: false,
    selectedMessage: null as Message | null,
    onSelectMessage: jest.fn(),
    predefinedQuestions: [] as PredefinedQuestion[],
    onQuestionClick: jest.fn(),
    onReplayMessage: jest.fn(),
  };

  const mockMessages: Message[] = [
    {
      id: 1,
      role: 'user',
      content: 'What is the average rating?',
    },
    {
      id: 2,
      role: 'assistant',
      content: 'The average rating is 4.2',
      response_time_ms: 1500,
      tokens_input: 50,
      tokens_output: 100,
    },
  ];

  const mockPredefinedQuestions: PredefinedQuestion[] = [
    { id: 1, question: 'What is the average?', category: 'Satisfaction', icon: '⭐' },
    { id: 2, question: 'Top 10 drivers?', category: 'Performance', icon: '🏆' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should show empty state when no messages', () => {
      render(<ChatMessages {...defaultProps} />);

      expect(screen.getByText('Posez votre question en langage naturel')).toBeInTheDocument();
      expect(screen.getByText('Ou sélectionnez une suggestion')).toBeInTheDocument();
    });

    it('should show predefined questions in empty state', () => {
      render(
        <ChatMessages
          {...defaultProps}
          predefinedQuestions={mockPredefinedQuestions}
        />
      );

      expect(screen.getByTestId('predefined-questions')).toBeInTheDocument();
    });

    it('should handle predefined question click', () => {
      const onQuestionClick = jest.fn();
      render(
        <ChatMessages
          {...defaultProps}
          predefinedQuestions={mockPredefinedQuestions}
          onQuestionClick={onQuestionClick}
        />
      );

      const questionButton = screen.getByText('What is the average?');
      fireEvent.click(questionButton);

      expect(onQuestionClick).toHaveBeenCalledWith('What is the average?');
    });
  });

  describe('Messages rendering', () => {
    it('should render user messages', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      expect(screen.getByText('What is the average rating?')).toBeInTheDocument();
    });

    it('should render assistant messages with markdown', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      expect(screen.getByText('The average rating is 4.2')).toBeInTheDocument();
    });

    it('should show response time for assistant messages', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      // 1500ms = 1.5s
      expect(screen.getByText('1.5s')).toBeInTheDocument();
    });

    it('should show token count for assistant messages', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      // 50 + 100 = 150 tokens
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('should not show predefined questions when there are messages', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      expect(screen.queryByTestId('predefined-questions')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading indicator when loading', () => {
      render(<ChatMessages {...defaultProps} loading={true} />);

      expect(screen.getByText('Analyse en cours')).toBeInTheDocument();
    });

    it('should render loading dots animation', () => {
      const { container } = render(<ChatMessages {...defaultProps} loading={true} />);

      // Check for animated dots
      const dots = container.querySelectorAll('.animate-bounce');
      expect(dots.length).toBeGreaterThan(0);
    });
  });

  describe('Message selection', () => {
    it('should call onSelectMessage when assistant message is clicked', () => {
      const onSelectMessage = jest.fn();
      render(
        <ChatMessages
          {...defaultProps}
          messages={mockMessages}
          onSelectMessage={onSelectMessage}
        />
      );

      const assistantMessage = screen.getByText('The average rating is 4.2');
      fireEvent.click(assistantMessage.closest('[class*="cursor-pointer"]')!);

      expect(onSelectMessage).toHaveBeenCalledWith(mockMessages[1]);
    });

    it('should not call onSelectMessage when user message is clicked', () => {
      const onSelectMessage = jest.fn();
      render(
        <ChatMessages
          {...defaultProps}
          messages={mockMessages}
          onSelectMessage={onSelectMessage}
        />
      );

      const userMessage = screen.getByText('What is the average rating?');
      fireEvent.click(userMessage.closest('[class*="cursor-pointer"]')!);

      // Should not call for user messages
      expect(onSelectMessage).not.toHaveBeenCalled();
    });

    it('should highlight selected message', () => {
      render(
        <ChatMessages
          {...defaultProps}
          messages={mockMessages}
          selectedMessage={mockMessages[1]}
        />
      );

      const assistantMessage = screen.getByText('The average rating is 4.2')
        .closest('[class*="cursor-pointer"]');

      expect(assistantMessage).toHaveClass('ring-1');
    });
  });

  describe('Replay functionality', () => {
    it('should show replay button on user messages', () => {
      render(<ChatMessages {...defaultProps} messages={mockMessages} />);

      expect(screen.getByText('Réessayer')).toBeInTheDocument();
    });

    it('should call onReplayMessage when replay is clicked', () => {
      const onReplayMessage = jest.fn();
      render(
        <ChatMessages
          {...defaultProps}
          messages={mockMessages}
          onReplayMessage={onReplayMessage}
        />
      );

      const replayButton = screen.getByText('Réessayer');
      fireEvent.click(replayButton);

      expect(onReplayMessage).toHaveBeenCalledWith(mockMessages[0]);
    });
  });

  describe('Auto-scroll', () => {
    it('should scroll to bottom when messages change', () => {
      const { rerender } = render(
        <ChatMessages {...defaultProps} messages={[]} />
      );

      mockScrollIntoView.mockClear();

      rerender(
        <ChatMessages {...defaultProps} messages={mockMessages} />
      );

      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  describe('Message without metadata', () => {
    it('should not show response time if not available', () => {
      const messagesWithoutMetadata: Message[] = [
        {
          id: 1,
          role: 'assistant',
          content: 'Response without metadata',
        },
      ];

      render(<ChatMessages {...defaultProps} messages={messagesWithoutMetadata} />);

      expect(screen.queryByText(/\d+\.\d+s/)).not.toBeInTheDocument();
    });
  });
});
