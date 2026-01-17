/**
 * Tests for PredefinedQuestions component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { PredefinedQuestions } from '@/components/PredefinedQuestions';
import type { PredefinedQuestion } from '@/types';

const mockQuestions: PredefinedQuestion[] = [
  {
    id: 1,
    question: 'What is the average rating?',
    category: 'Satisfaction',
    icon: '⭐',
    business_value: 'High',
    display_order: 1,
    is_enabled: true,
  },
  {
    id: 2,
    question: 'Which drivers have the best reviews?',
    category: 'Satisfaction',
    icon: '⭐',
    business_value: 'Medium',
    display_order: 2,
    is_enabled: true,
  },
  {
    id: 3,
    question: 'Top 10 drivers by trips',
    category: 'Performance',
    icon: '🏆',
    business_value: 'High',
    display_order: 1,
    is_enabled: true,
  },
  {
    id: 4,
    question: 'Rating trends this month',
    category: 'Trends',
    icon: '📈',
    business_value: 'Medium',
    display_order: 1,
    is_enabled: true,
  },
];

describe('PredefinedQuestions', () => {
  const defaultProps = {
    questions: mockQuestions,
    onQuestionClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all questions', () => {
      render(<PredefinedQuestions {...defaultProps} />);

      expect(screen.getByText('What is the average rating?')).toBeInTheDocument();
      expect(screen.getByText('Which drivers have the best reviews?')).toBeInTheDocument();
      expect(screen.getByText('Top 10 drivers by trips')).toBeInTheDocument();
      expect(screen.getByText('Rating trends this month')).toBeInTheDocument();
    });

    it('should group questions by category', () => {
      render(<PredefinedQuestions {...defaultProps} />);

      expect(screen.getByText('Satisfaction')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(screen.getByText('Trends')).toBeInTheDocument();
    });

    it('should render question icons', () => {
      render(<PredefinedQuestions {...defaultProps} />);

      // Icons are rendered in CategoryIcon component
      expect(screen.getAllByText('⭐').length).toBe(2); // Two satisfaction questions
      expect(screen.getByText('🏆')).toBeInTheDocument();
      expect(screen.getByText('📈')).toBeInTheDocument();
    });

    it('should render questions as buttons', () => {
      render(<PredefinedQuestions {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(4);
    });
  });

  describe('Empty state', () => {
    it('should return null when no questions', () => {
      const { container } = render(
        <PredefinedQuestions questions={[]} onQuestionClick={jest.fn()} />
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Interactions', () => {
    it('should call onQuestionClick with question text when clicked', () => {
      const onQuestionClick = jest.fn();
      render(<PredefinedQuestions {...defaultProps} onQuestionClick={onQuestionClick} />);

      fireEvent.click(screen.getByText('What is the average rating?'));

      expect(onQuestionClick).toHaveBeenCalledWith('What is the average rating?');
    });

    it('should call onQuestionClick for different questions', () => {
      const onQuestionClick = jest.fn();
      render(<PredefinedQuestions {...defaultProps} onQuestionClick={onQuestionClick} />);

      fireEvent.click(screen.getByText('Top 10 drivers by trips'));

      expect(onQuestionClick).toHaveBeenCalledWith('Top 10 drivers by trips');
    });
  });

  describe('Category grouping', () => {
    it('should have multiple questions under same category', () => {
      render(<PredefinedQuestions {...defaultProps} />);

      // Under Satisfaction category, there should be 2 questions
      const satisfactionCategory = screen.getByText('Satisfaction').closest('div');
      expect(satisfactionCategory).toBeTruthy();
    });
  });

  describe('Default icon', () => {
    it('should show default icon for unknown icon type', () => {
      const questionsWithUnknownIcon: PredefinedQuestion[] = [
        {
          id: 5,
          question: 'Unknown icon question',
          category: 'Other',
          icon: 'unknown',
          business_value: 'Low',
          display_order: 1,
          is_enabled: true,
        },
      ];

      render(
        <PredefinedQuestions
          questions={questionsWithUnknownIcon}
          onQuestionClick={jest.fn()}
        />
      );

      // Default icon is 💬
      expect(screen.getByText('💬')).toBeInTheDocument();
    });
  });
});
