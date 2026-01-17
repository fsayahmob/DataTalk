/**
 * Tests for FiltersPanel component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FiltersPanel, Filters } from '@/components/panels/FiltersPanel';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'common.filters': 'Filtres',
      'common.all': 'Tous',
      'filters.date_start': 'Date début',
      'filters.date_end': 'Date fin',
      'filters.note_min': 'Note min',
      'filters.note_max': 'Note max',
      'filters.reset': 'Réinitialiser',
      'filters.apply_hint': 'Les filtres s\'appliquent à la prochaine question',
    };
    return translations[key] || key;
  },
}));

describe('FiltersPanel', () => {
  const defaultFilters: Filters = {
    dateStart: '',
    dateEnd: '',
    noteMin: '',
    noteMax: '',
  };

  const defaultProps = {
    filters: defaultFilters,
    onFiltersChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Collapsed state', () => {
    it('should render filters button', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText('Filtres')).toBeInTheDocument();
    });

    it('should not show filter inputs initially', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.queryByText('Date début')).not.toBeInTheDocument();
    });

    it('should not show badge when no filters active', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should show badge with active filter count', () => {
      const filtersWithValues: Filters = {
        dateStart: '2024-01-01',
        dateEnd: '2024-12-31',
        noteMin: '',
        noteMax: '',
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithValues} />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('Expanded state', () => {
    it('should expand when filters button is clicked', () => {
      render(<FiltersPanel {...defaultProps} />);

      fireEvent.click(screen.getByText('Filtres'));

      expect(screen.getByText('Date début')).toBeInTheDocument();
      expect(screen.getByText('Date fin')).toBeInTheDocument();
      expect(screen.getByText('Note min')).toBeInTheDocument();
      expect(screen.getByText('Note max')).toBeInTheDocument();
    });

    it('should collapse when filters button is clicked again', () => {
      render(<FiltersPanel {...defaultProps} />);

      // Expand
      fireEvent.click(screen.getByText('Filtres'));
      expect(screen.getByText('Date début')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText('Filtres'));
      expect(screen.queryByText('Date début')).not.toBeInTheDocument();
    });

    it('should show reset button when expanded', () => {
      render(<FiltersPanel {...defaultProps} />);

      fireEvent.click(screen.getByText('Filtres'));

      expect(screen.getByText('Réinitialiser')).toBeInTheDocument();
    });

    it('should show hint text', () => {
      render(<FiltersPanel {...defaultProps} />);

      fireEvent.click(screen.getByText('Filtres'));

      expect(screen.getByText("Les filtres s'appliquent à la prochaine question")).toBeInTheDocument();
    });
  });

  describe('Filter changes', () => {
    it('should call onFiltersChange when date start changes', () => {
      const onFiltersChange = jest.fn();
      render(
        <FiltersPanel {...defaultProps} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Filtres'));

      // Use querySelector for date inputs since they don't have role="textbox"
      const container = screen.getByText('Date début').parentElement;
      const dateInput = container?.querySelector('input[type="date"]');
      fireEvent.change(dateInput!, { target: { value: '2024-01-15' } });

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        dateStart: '2024-01-15',
      });
    });

    it('should call onFiltersChange when date end changes', () => {
      const onFiltersChange = jest.fn();
      render(
        <FiltersPanel {...defaultProps} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Filtres'));

      const container = screen.getByText('Date fin').parentElement;
      const dateInput = container?.querySelector('input[type="date"]');
      fireEvent.change(dateInput!, { target: { value: '2024-12-31' } });

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        dateEnd: '2024-12-31',
      });
    });

    it('should call onFiltersChange when note min changes', () => {
      const onFiltersChange = jest.fn();
      render(
        <FiltersPanel {...defaultProps} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Filtres'));

      const selectInputs = screen.getAllByRole('combobox');
      fireEvent.change(selectInputs[0], { target: { value: '3' } });

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        noteMin: '3',
      });
    });

    it('should call onFiltersChange when note max changes', () => {
      const onFiltersChange = jest.fn();
      render(
        <FiltersPanel {...defaultProps} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Filtres'));

      const selectInputs = screen.getAllByRole('combobox');
      fireEvent.change(selectInputs[1], { target: { value: '5' } });

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        noteMax: '5',
      });
    });
  });

  describe('Reset functionality', () => {
    it('should reset all filters when reset is clicked', () => {
      const onFiltersChange = jest.fn();
      const activeFilters: Filters = {
        dateStart: '2024-01-01',
        dateEnd: '2024-12-31',
        noteMin: '2',
        noteMax: '5',
      };

      render(
        <FiltersPanel
          filters={activeFilters}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.click(screen.getByText('Filtres'));
      fireEvent.click(screen.getByText('Réinitialiser'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        dateStart: '',
        dateEnd: '',
        noteMin: '',
        noteMax: '',
      });
    });
  });

  describe('Select options', () => {
    it('should have all note options (1-5)', () => {
      render(<FiltersPanel {...defaultProps} />);

      fireEvent.click(screen.getByText('Filtres'));

      const selectInputs = screen.getAllByRole('combobox');
      const options = selectInputs[0].querySelectorAll('option');

      expect(options).toHaveLength(6); // "Tous" + 1-5
      expect(options[0]).toHaveTextContent('Tous');
      expect(options[1]).toHaveTextContent('1');
      expect(options[5]).toHaveTextContent('5');
    });
  });

  describe('Display current filter values', () => {
    it('should display current filter values', () => {
      const activeFilters: Filters = {
        dateStart: '2024-01-15',
        dateEnd: '2024-06-30',
        noteMin: '3',
        noteMax: '5',
      };

      render(<FiltersPanel filters={activeFilters} onFiltersChange={jest.fn()} />);

      fireEvent.click(screen.getByText('Filtres'));

      const dateStartContainer = screen.getByText('Date début').parentElement;
      const dateEndContainer = screen.getByText('Date fin').parentElement;
      const dateStart = dateStartContainer?.querySelector('input[type="date"]') as HTMLInputElement;
      const dateEnd = dateEndContainer?.querySelector('input[type="date"]') as HTMLInputElement;
      const selectInputs = screen.getAllByRole('combobox') as HTMLSelectElement[];

      expect(dateStart.value).toBe('2024-01-15');
      expect(dateEnd.value).toBe('2024-06-30');
      expect(selectInputs[0].value).toBe('3');
      expect(selectInputs[1].value).toBe('5');
    });
  });
});
