/**
 * Tests for ChatHistory component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHistory } from '@/components/chat/ChatHistory';
import { Conversation } from '@/types';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'chat.no_conversations': 'Aucune conversation',
      'chat.delete_all_history': 'Supprimer tout l\'historique',
      'chat.untitled_conversation': 'Conversation sans titre',
    };
    return translations[key] || key;
  },
}));

describe('ChatHistory', () => {
  const defaultProps = {
    conversations: [] as Conversation[],
    currentConversationId: null,
    onLoadConversation: jest.fn(),
    onDeleteAllConversations: jest.fn(),
  };

  const mockConversations: Conversation[] = [
    {
      id: 1,
      title: 'First conversation',
      message_count: 5,
      created_at: new Date().toISOString(), // Now
    },
    {
      id: 2,
      title: 'Second conversation',
      message_count: 3,
      created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      id: 3,
      title: '',
      message_count: 2,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should show empty message when no conversations', () => {
      render(<ChatHistory {...defaultProps} />);

      expect(screen.getByText('Aucune conversation')).toBeInTheDocument();
    });

    it('should not show delete button when empty', () => {
      render(<ChatHistory {...defaultProps} />);

      expect(screen.queryByText("Supprimer tout l'historique")).not.toBeInTheDocument();
    });
  });

  describe('Conversations list', () => {
    it('should render conversation titles', () => {
      render(
        <ChatHistory {...defaultProps} conversations={mockConversations} />
      );

      expect(screen.getByText('First conversation')).toBeInTheDocument();
      expect(screen.getByText('Second conversation')).toBeInTheDocument();
    });

    it('should show fallback title for untitled conversations', () => {
      render(
        <ChatHistory {...defaultProps} conversations={mockConversations} />
      );

      expect(screen.getByText('Conversation sans titre')).toBeInTheDocument();
    });

    it('should show delete all button when conversations exist', () => {
      render(
        <ChatHistory {...defaultProps} conversations={mockConversations} />
      );

      expect(screen.getByText("Supprimer tout l'historique")).toBeInTheDocument();
    });

    it('should limit to 15 conversations', () => {
      const manyConversations: Conversation[] = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        title: `Conversation ${i + 1}`,
        message_count: 1,
        created_at: new Date().toISOString(),
      }));

      render(
        <ChatHistory {...defaultProps} conversations={manyConversations} />
      );

      // Should show 15 conversations + delete button
      expect(screen.getByText('Conversation 1')).toBeInTheDocument();
      expect(screen.getByText('Conversation 15')).toBeInTheDocument();
      expect(screen.queryByText('Conversation 16')).not.toBeInTheDocument();
    });
  });

  describe('Current conversation highlighting', () => {
    it('should highlight the current conversation', () => {
      render(
        <ChatHistory
          {...defaultProps}
          conversations={mockConversations}
          currentConversationId={1}
        />
      );

      const currentConvButton = screen.getByText('First conversation').closest('button');
      expect(currentConvButton).toHaveClass('bg-primary/15');
    });

    it('should not highlight other conversations', () => {
      render(
        <ChatHistory
          {...defaultProps}
          conversations={mockConversations}
          currentConversationId={1}
        />
      );

      const otherConvButton = screen.getByText('Second conversation').closest('button');
      expect(otherConvButton).not.toHaveClass('bg-primary/15');
    });
  });

  describe('Interactions', () => {
    it('should call onLoadConversation when conversation is clicked', () => {
      const onLoadConversation = jest.fn();
      render(
        <ChatHistory
          {...defaultProps}
          conversations={mockConversations}
          onLoadConversation={onLoadConversation}
        />
      );

      fireEvent.click(screen.getByText('First conversation'));

      expect(onLoadConversation).toHaveBeenCalledWith(mockConversations[0]);
    });

    it('should call onDeleteAllConversations when delete button is clicked', () => {
      const onDeleteAllConversations = jest.fn();
      render(
        <ChatHistory
          {...defaultProps}
          conversations={mockConversations}
          onDeleteAllConversations={onDeleteAllConversations}
        />
      );

      fireEvent.click(screen.getByText("Supprimer tout l'historique"));

      expect(onDeleteAllConversations).toHaveBeenCalled();
    });
  });

  describe('Timestamp formatting', () => {
    it('should display relative timestamps', () => {
      render(
        <ChatHistory {...defaultProps} conversations={mockConversations} />
      );

      // These tests depend on the formatTimestamp function
      // The exact text depends on how recent the timestamps are
      const timestamps = screen.getAllByText(/il y a|a l'instant/);
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });
});
