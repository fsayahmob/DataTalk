/**
 * Tests for ModelsTab component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelsTab } from '@/components/settings/ModelsTab';
import type { LLMProvider, LLMModel } from '@/lib/api';

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'settings.search_models': 'Rechercher un modèle...',
        'settings.all_providers': 'Tous les fournisseurs',
        'settings.set_as_default': 'Définir par défaut',
        'common.models': 'modèles',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => {
    const translations: Record<string, string> = {
      'settings.search_models': 'Rechercher un modèle...',
      'settings.all_providers': 'Tous les fournisseurs',
      'settings.set_as_default': 'Définir par défaut',
      'common.models': 'modèles',
    };
    return translations[key] || key;
  },
}));

const mockProviders: LLMProvider[] = [
  {
    id: 1,
    name: 'google',
    display_name: 'Google AI',
    type: 'cloud',
    api_key_configured: true,
    api_key_hint: 'AIza...xyz',
    requires_api_key: true,
    is_available: true,
    base_url: null,
  },
  {
    id: 2,
    name: 'openai',
    display_name: 'OpenAI',
    type: 'cloud',
    api_key_configured: false,
    api_key_hint: null,
    requires_api_key: true,
    is_available: false,
    base_url: null,
  },
  {
    id: 3,
    name: 'ollama',
    display_name: 'Ollama',
    type: 'self-hosted',
    api_key_configured: false,
    api_key_hint: null,
    requires_api_key: false,
    is_available: false,
    base_url: 'http://localhost:11434',
  },
];

const mockModels: LLMModel[] = [
  {
    id: 1,
    provider_id: 1,
    model_id: 'gemini-2.0-flash',
    display_name: 'Gemini 2.0 Flash',
    context_window: 1000000,
    cost_per_1m_input: 0.15,
    cost_per_1m_output: 0.60,
  },
  {
    id: 2,
    provider_id: 1,
    model_id: 'gemini-1.5-pro',
    display_name: 'Gemini 1.5 Pro',
    context_window: 2000000,
    cost_per_1m_input: 3.50,
    cost_per_1m_output: 10.50,
  },
  {
    id: 3,
    provider_id: 2,
    model_id: 'gpt-4o-mini',
    display_name: 'GPT-4o Mini',
    context_window: 128000,
    cost_per_1m_input: 0.15,
    cost_per_1m_output: 0.60,
  },
  {
    id: 4,
    provider_id: 3,
    model_id: 'llama3.1:8b',
    display_name: 'Llama 3.1 8B',
    context_window: 128000,
    cost_per_1m_input: null,
    cost_per_1m_output: null,
  },
];

describe('ModelsTab', () => {
  const defaultProps = {
    providers: mockProviders,
    allModels: mockModels,
    defaultModel: mockModels[0],
    selectedProvider: 'all',
    searchQuery: '',
    onProviderChange: jest.fn(),
    onSearchChange: jest.fn(),
    onSetDefaultModel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render search input', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getByPlaceholderText('Rechercher un modèle...')).toBeInTheDocument();
    });

    it('should render provider selector', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getByText('Tous les fournisseurs')).toBeInTheDocument();
    });

    it('should render model count', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getByText('4 modèles')).toBeInTheDocument();
    });

    it('should render table headers', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Provider')).toBeInTheDocument();
      expect(screen.getByText('Context')).toBeInTheDocument();
      expect(screen.getByText('$/1M in')).toBeInTheDocument();
      expect(screen.getByText('$/1M out')).toBeInTheDocument();
      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('should render all models', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
      expect(screen.getByText('gemini-1.5-pro')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.getByText('llama3.1:8b')).toBeInTheDocument();
    });
  });

  describe('Model data display', () => {
    it('should show context window formatted as k', () => {
      render(<ModelsTab {...defaultProps} />);

      // 1000000 -> 1000k, 2000000 -> 2000k, 128000 -> 128k
      expect(screen.getByText('1000k')).toBeInTheDocument();
      expect(screen.getByText('2000k')).toBeInTheDocument();
      expect(screen.getAllByText('128k').length).toBe(2);
    });

    it('should show pricing for models with costs', () => {
      render(<ModelsTab {...defaultProps} />);

      expect(screen.getAllByText('0.15').length).toBeGreaterThan(0);
      expect(screen.getAllByText('0.6').length).toBeGreaterThan(0);
      expect(screen.getByText('3.5')).toBeInTheDocument();
      expect(screen.getByText('10.5')).toBeInTheDocument();
    });

    it('should show dash for models without pricing', () => {
      render(<ModelsTab {...defaultProps} />);

      // llama model has null costs
      expect(screen.getAllByText('—').length).toBe(2);
    });
  });

  describe('Provider status badges', () => {
    it('should show ready badge for available providers', () => {
      render(<ModelsTab {...defaultProps} />);

      // Google AI models should show ready
      expect(screen.getAllByText('ready').length).toBe(2);
    });

    it('should show no key badge for providers missing API key', () => {
      render(<ModelsTab {...defaultProps} />);

      // OpenAI model should show no key
      expect(screen.getByText('no key')).toBeInTheDocument();
    });

    it('should show offline badge for unavailable self-hosted providers', () => {
      render(<ModelsTab {...defaultProps} />);

      // Ollama model should show offline
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });

  describe('Default model indicator', () => {
    it('should show filled indicator for default model', () => {
      render(<ModelsTab {...defaultProps} />);

      // Default model (gemini-2.0-flash) should show filled circle
      expect(screen.getByText('●')).toBeInTheDocument();
    });

    it('should show empty indicator button for non-default models', () => {
      render(<ModelsTab {...defaultProps} />);

      // Other models should show clickable empty circle
      const buttons = screen.getAllByRole('button', { name: '○' });
      expect(buttons.length).toBe(3); // 3 non-default models
    });

    it('should highlight default model row', () => {
      render(<ModelsTab {...defaultProps} />);

      const rows = screen.getAllByRole('row');
      // First data row (index 1, after header) should have highlight class
      const defaultRow = rows.find(row => row.textContent?.includes('gemini-2.0-flash'));
      expect(defaultRow).toHaveClass('bg-primary/5');
    });
  });

  describe('Search functionality', () => {
    it('should call onSearchChange when typing in search', () => {
      const onSearchChange = jest.fn();
      render(<ModelsTab {...defaultProps} onSearchChange={onSearchChange} />);

      const searchInput = screen.getByPlaceholderText('Rechercher un modèle...');
      fireEvent.change(searchInput, { target: { value: 'gemini' } });

      expect(onSearchChange).toHaveBeenCalledWith('gemini');
    });

    it('should filter models based on search query', () => {
      render(<ModelsTab {...defaultProps} searchQuery="gemini" />);

      expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
      expect(screen.getByText('gemini-1.5-pro')).toBeInTheDocument();
      expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument();
      expect(screen.queryByText('llama3.1:8b')).not.toBeInTheDocument();
    });

    it('should show filtered count', () => {
      render(<ModelsTab {...defaultProps} searchQuery="gemini" />);

      expect(screen.getByText('2 modèles')).toBeInTheDocument();
    });
  });

  describe('Provider filtering', () => {
    it('should filter models when provider is selected', () => {
      render(<ModelsTab {...defaultProps} selectedProvider="google" />);

      expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
      expect(screen.getByText('gemini-1.5-pro')).toBeInTheDocument();
      expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument();
      expect(screen.queryByText('llama3.1:8b')).not.toBeInTheDocument();
    });

    it('should show all models when all providers selected', () => {
      render(<ModelsTab {...defaultProps} selectedProvider="all" />);

      expect(screen.getByText('4 modèles')).toBeInTheDocument();
    });
  });

  describe('Set default model', () => {
    it('should call onSetDefaultModel when clicking set default button', () => {
      const onSetDefaultModel = jest.fn();
      render(<ModelsTab {...defaultProps} onSetDefaultModel={onSetDefaultModel} />);

      // Find a non-default model's button
      const buttons = screen.getAllByRole('button', { name: '○' });
      fireEvent.click(buttons[0]);

      expect(onSetDefaultModel).toHaveBeenCalled();
    });

    it('should pass correct model id to onSetDefaultModel', () => {
      const onSetDefaultModel = jest.fn();
      render(<ModelsTab {...defaultProps} onSetDefaultModel={onSetDefaultModel} />);

      // The first ○ button should be for gemini-1.5-pro (second row, first non-default)
      const buttons = screen.getAllByRole('button', { name: '○' });
      fireEvent.click(buttons[0]);

      // Should be called with model_id of the model
      expect(onSetDefaultModel).toHaveBeenCalledWith('gemini-1.5-pro');
    });
  });

  describe('Empty state', () => {
    it('should show 0 models when no models match filter', () => {
      render(<ModelsTab {...defaultProps} searchQuery="nonexistent" />);

      expect(screen.getByText('0 modèles')).toBeInTheDocument();
    });

    it('should render empty table body when no models match', () => {
      render(<ModelsTab {...defaultProps} searchQuery="nonexistent" />);

      // Table should still render but with no data rows
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBe(1); // Only header row
    });
  });
});
