/**
 * Tests for ChatInput component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '@/components/chat/ChatInput';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'chat.placeholder': 'Posez votre question...',
      'chat.stop_request': 'Arrêter',
      'chat.with_context': 'Avec contexte',
      'chat.without_context': 'Sans contexte',
      'chat.enter_to_send': 'Entrée pour envoyer',
    };
    return translations[key] || key;
  },
}));

describe('ChatInput', () => {
  const defaultProps = {
    question: '',
    loading: false,
    useContext: false,
    onQuestionChange: jest.fn(),
    onSubmit: jest.fn(),
    onStop: jest.fn(),
    onUseContextChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render textarea with placeholder', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      expect(textarea).toBeInTheDocument();
    });

    it('should render send button when not loading', () => {
      render(<ChatInput {...defaultProps} question="test" />);

      // Send button should be visible (no stop button)
      expect(screen.queryByTitle('Arrêter')).not.toBeInTheDocument();
    });

    it('should render stop button when loading', () => {
      render(<ChatInput {...defaultProps} loading={true} />);

      expect(screen.getByTitle('Arrêter')).toBeInTheDocument();
    });

    it('should render context toggle button', () => {
      render(<ChatInput {...defaultProps} />);

      expect(screen.getByText('Sans contexte')).toBeInTheDocument();
    });

    it('should render Enter to send instruction', () => {
      render(<ChatInput {...defaultProps} />);

      expect(screen.getByText('Entrée pour envoyer')).toBeInTheDocument();
    });
  });

  describe('Textarea interaction', () => {
    it('should call onQuestionChange when typing', () => {
      const onQuestionChange = jest.fn();
      render(<ChatInput {...defaultProps} onQuestionChange={onQuestionChange} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      fireEvent.change(textarea, { target: { value: 'Test question' } });

      expect(onQuestionChange).toHaveBeenCalledWith('Test question');
    });

    it('should display the question value', () => {
      render(<ChatInput {...defaultProps} question="My question" />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      expect(textarea).toHaveValue('My question');
    });

    it('should be disabled when loading', () => {
      render(<ChatInput {...defaultProps} loading={true} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      expect(textarea).toBeDisabled();
    });
  });

  describe('Form submission', () => {
    it('should call onSubmit when form is submitted', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatInput {...defaultProps} question="test" onSubmit={onSubmit} />);

      const form = screen.getByPlaceholderText('Posez votre question...').closest('form');
      fireEvent.submit(form!);

      expect(onSubmit).toHaveBeenCalled();
    });

    it('should submit on Enter key (without Shift)', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatInput {...defaultProps} question="test" onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSubmit).toHaveBeenCalled();
    });

    it('should not submit on Shift+Enter (allow newline)', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatInput {...defaultProps} question="test" onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not submit on Enter if question is empty', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatInput {...defaultProps} question="   " onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not submit on Enter if loading', () => {
      const onSubmit = jest.fn((e) => e.preventDefault());
      render(<ChatInput {...defaultProps} question="test" loading={true} onSubmit={onSubmit} />);

      const textarea = screen.getByPlaceholderText('Posez votre question...');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Stop button', () => {
    it('should call onStop when stop button is clicked', () => {
      const onStop = jest.fn();
      render(<ChatInput {...defaultProps} loading={true} onStop={onStop} />);

      const stopButton = screen.getByTitle('Arrêter');
      fireEvent.click(stopButton);

      expect(onStop).toHaveBeenCalled();
    });
  });

  describe('Context toggle', () => {
    it('should display "Sans contexte" when useContext is false', () => {
      render(<ChatInput {...defaultProps} useContext={false} />);

      expect(screen.getByText('Sans contexte')).toBeInTheDocument();
    });

    it('should display "Avec contexte" when useContext is true', () => {
      render(<ChatInput {...defaultProps} useContext={true} />);

      expect(screen.getByText('Avec contexte')).toBeInTheDocument();
    });

    it('should call onUseContextChange when toggle is clicked', () => {
      const onUseContextChange = jest.fn();
      render(<ChatInput {...defaultProps} useContext={false} onUseContextChange={onUseContextChange} />);

      const toggleButton = screen.getByText('Sans contexte');
      fireEvent.click(toggleButton);

      expect(onUseContextChange).toHaveBeenCalledWith(true);
    });

    it('should toggle from true to false', () => {
      const onUseContextChange = jest.fn();
      render(<ChatInput {...defaultProps} useContext={true} onUseContextChange={onUseContextChange} />);

      const toggleButton = screen.getByText('Avec contexte');
      fireEvent.click(toggleButton);

      expect(onUseContextChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Send button state', () => {
    it('should be disabled when question is empty', () => {
      render(<ChatInput {...defaultProps} question="" />);

      // Find submit button (not the stop button)
      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');

      expect(submitButton).toBeDisabled();
    });

    it('should be disabled when question is only whitespace', () => {
      render(<ChatInput {...defaultProps} question="   " />);

      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');

      expect(submitButton).toBeDisabled();
    });

    it('should be enabled when question has content', () => {
      render(<ChatInput {...defaultProps} question="Hello" />);

      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');

      expect(submitButton).not.toBeDisabled();
    });
  });
});
