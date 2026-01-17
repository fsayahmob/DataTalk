/**
 * Tests for ChatHeader component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from '@/components/chat/ChatHeader';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'chat.history': 'Historique',
      'chat.new_conversation': 'Nouvelle conversation',
      'common.collapse': 'Réduire',
    };
    return translations[key] || key;
  },
}));

describe('ChatHeader', () => {
  const defaultProps = {
    showHistory: false,
    onShowHistoryChange: jest.fn(),
    onNewConversation: jest.fn(),
    onCollapse: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the Chat title', () => {
      render(<ChatHeader {...defaultProps} />);

      expect(screen.getByText('Chat')).toBeInTheDocument();
    });

    it('should render history button', () => {
      render(<ChatHeader {...defaultProps} />);

      expect(screen.getByTitle('Historique')).toBeInTheDocument();
    });

    it('should render new conversation button', () => {
      render(<ChatHeader {...defaultProps} />);

      expect(screen.getByTitle('Nouvelle conversation')).toBeInTheDocument();
    });

    it('should render collapse button', () => {
      render(<ChatHeader {...defaultProps} />);

      expect(screen.getByTitle('Réduire')).toBeInTheDocument();
    });
  });

  describe('History toggle', () => {
    it('should call onShowHistoryChange when history button is clicked', () => {
      const onShowHistoryChange = jest.fn();
      render(
        <ChatHeader {...defaultProps} onShowHistoryChange={onShowHistoryChange} />
      );

      fireEvent.click(screen.getByTitle('Historique'));

      expect(onShowHistoryChange).toHaveBeenCalledWith(true);
    });

    it('should toggle history off when showHistory is true', () => {
      const onShowHistoryChange = jest.fn();
      render(
        <ChatHeader
          {...defaultProps}
          showHistory={true}
          onShowHistoryChange={onShowHistoryChange}
        />
      );

      fireEvent.click(screen.getByTitle('Historique'));

      expect(onShowHistoryChange).toHaveBeenCalledWith(false);
    });

    it('should highlight history button when showHistory is true', () => {
      render(<ChatHeader {...defaultProps} showHistory={true} />);

      const historyButton = screen.getByTitle('Historique');
      expect(historyButton).toHaveClass('bg-primary/20');
    });
  });

  describe('New conversation', () => {
    it('should call onNewConversation when new button is clicked', () => {
      const onNewConversation = jest.fn();
      const onShowHistoryChange = jest.fn();
      render(
        <ChatHeader
          {...defaultProps}
          onNewConversation={onNewConversation}
          onShowHistoryChange={onShowHistoryChange}
        />
      );

      fireEvent.click(screen.getByTitle('Nouvelle conversation'));

      expect(onNewConversation).toHaveBeenCalled();
    });

    it('should also close history when creating new conversation', () => {
      const onShowHistoryChange = jest.fn();
      render(
        <ChatHeader
          {...defaultProps}
          showHistory={true}
          onShowHistoryChange={onShowHistoryChange}
        />
      );

      fireEvent.click(screen.getByTitle('Nouvelle conversation'));

      expect(onShowHistoryChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Collapse', () => {
    it('should call onCollapse when collapse button is clicked', () => {
      const onCollapse = jest.fn();
      render(<ChatHeader {...defaultProps} onCollapse={onCollapse} />);

      fireEvent.click(screen.getByTitle('Réduire'));

      expect(onCollapse).toHaveBeenCalled();
    });
  });
});
