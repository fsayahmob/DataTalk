/**
 * Tests for PromptsTab component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptsTab } from '@/components/settings/PromptsTab';
import * as api from '@/lib/api';
import type { Prompt } from '@/lib/api';

// Mock API
jest.mock('@/lib/api', () => ({
  fetchPrompts: jest.fn(),
  fetchCatalogContextMode: jest.fn(),
  setCatalogContextMode: jest.fn(),
  updatePrompt: jest.fn(),
}));

// Mock translation hook
jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'common.edit': 'Modifier',
        'common.save': 'Enregistrer',
        'common.cancel': 'Annuler',
        'prompts.description': 'Gérez vos prompts systèmes',
        'prompts.show': 'Voir',
        'prompts.hide': 'Masquer',
        'prompts.saving': 'Enregistrement...',
        'prompts.mode_label': `Mode ${vars?.mode || ''}`,
        'prompts.mode_compact_desc': 'Mode compact pour économiser les tokens',
        'prompts.mode_full_desc': 'Mode complet avec tout le contexte',
        'prompts.context_mode_updated': `Mode mis à jour: ${vars?.mode || ''}`,
        'prompts.init_help': 'Lancez le script init pour créer les prompts',
        'settings.prompt_updated': 'Prompt mis à jour',
        'settings.prompt_error': 'Erreur lors de la mise à jour',
        'settings.no_prompts': 'Aucun prompt configuré',
      };
      return translations[key] || key;
    },
  }),
  t: (key: string) => key,
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { toast } from 'sonner';

const mockPrompts: Prompt[] = [
  {
    id: 1,
    key: 'analytics_system',
    name: 'Analytics System',
    category: 'analytics',
    content: 'You are an analytics assistant...',
    description: 'Main system prompt for analytics',
    is_active: true,
    tokens_estimate: 800,
    version: '1.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 2,
    key: 'catalog_enrichment',
    name: 'Catalog Enrichment',
    category: 'catalog',
    content: 'Enrich the catalog metadata...',
    description: 'Prompt for catalog enrichment',
    is_active: true,
    tokens_estimate: 500,
    version: '1.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
  },
  {
    id: 3,
    key: 'inactive_prompt',
    name: 'Inactive Prompt',
    category: 'widgets',
    content: 'This is inactive',
    description: null,
    is_active: false,
    tokens_estimate: null,
    version: '1.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
  },
];

describe('PromptsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.fetchPrompts as jest.Mock).mockResolvedValue(mockPrompts);
    (api.fetchCatalogContextMode as jest.Mock).mockResolvedValue('full');
  });

  describe('Loading state', () => {
    it('should show loading spinner initially', () => {
      (api.fetchPrompts as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<PromptsTab />);

      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Rendering', () => {
    it('should render description', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Gérez vos prompts systèmes')).toBeInTheDocument();
      });
    });

    it('should render only active prompts', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      expect(screen.getByText('Catalog Enrichment')).toBeInTheDocument();
      expect(screen.queryByText('Inactive Prompt')).not.toBeInTheDocument();
    });

    it('should render category labels with colors', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics')).toBeInTheDocument();
      });

      expect(screen.getByText('Catalogue')).toBeInTheDocument();
    });

    it('should render prompt descriptions', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Main system prompt for analytics')).toBeInTheDocument();
      });

      expect(screen.getByText('Prompt for catalog enrichment')).toBeInTheDocument();
    });

    it('should render Edit and Show buttons', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getAllByText('Modifier').length).toBe(2);
      });

      expect(screen.getAllByText('Voir').length).toBe(2);
    });
  });

  describe('Expand/Collapse', () => {
    it('should expand prompt content when Show is clicked', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const showButtons = screen.getAllByText('Voir');
      fireEvent.click(showButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('You are an analytics assistant...')).toBeInTheDocument();
      });
    });

    it('should show Hide button when expanded', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const showButtons = screen.getAllByText('Voir');
      fireEvent.click(showButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Masquer')).toBeInTheDocument();
      });
    });

    it('should collapse when Hide is clicked', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      // Expand first
      const showButtons = screen.getAllByText('Voir');
      fireEvent.click(showButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Masquer')).toBeInTheDocument();
      });

      // Collapse
      fireEvent.click(screen.getByText('Masquer'));

      await waitFor(() => {
        expect(screen.queryByText('You are an analytics assistant...')).not.toBeInTheDocument();
      });
    });

    it('should show metadata when expanded', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const showButtons = screen.getAllByText('Voir');
      fireEvent.click(showButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Key: analytics_system')).toBeInTheDocument();
        expect(screen.getByText('Tokens: 800')).toBeInTheDocument();
      });
    });
  });

  describe('Context mode selector (analytics_system)', () => {
    it('should show context mode selector for analytics_system', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      // Expand analytics_system
      const showButtons = screen.getAllByText('Voir');
      fireEvent.click(showButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('full ~2200t')).toBeInTheDocument();
      });
    });

    it('should render context mode selector with correct initial value', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      // Check that full mode is displayed (initial value from mock)
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('full ~2200t')).toBeInTheDocument();
    });

    it('should have context mode API functions available', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      // Verify API functions are available (will be called on interaction)
      expect(api.setCatalogContextMode).toBeDefined();
      expect(api.fetchCatalogContextMode).toHaveBeenCalled();
    });
  });

  describe('Edit functionality', () => {
    it('should enter edit mode when Edit is clicked', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('should populate textarea with current content', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveValue('You are an analytics assistant...');
      });
    });

    it('should show Save and Cancel buttons in edit mode', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).toBeInTheDocument();
        expect(screen.getByText('Annuler')).toBeInTheDocument();
      });
    });

    it('should exit edit mode when Cancel is clicked', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Annuler')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Annuler'));

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });

    it('should call updatePrompt when Save is clicked', async () => {
      (api.updatePrompt as jest.Mock).mockResolvedValue(true);

      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Updated content' } });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(api.updatePrompt).toHaveBeenCalledWith('analytics_system', 'Updated content');
      });
    });

    it('should disable Save button when content is unchanged', async () => {
      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        const saveButton = screen.getByText('Enregistrer');
        expect(saveButton).toBeDisabled();
      });
    });

    it('should show success toast when save succeeds', async () => {
      (api.updatePrompt as jest.Mock).mockResolvedValue(true);

      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Updated content' } });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Prompt mis à jour');
      });
    });

    it('should show error toast when save fails', async () => {
      (api.updatePrompt as jest.Mock).mockResolvedValue(false);

      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Analytics System')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Updated content' } });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur lors de la mise à jour');
      });
    });
  });

  describe('Empty state', () => {
    it('should show empty message when no prompts', async () => {
      (api.fetchPrompts as jest.Mock).mockResolvedValue([]);

      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Aucun prompt configuré')).toBeInTheDocument();
      });

      expect(screen.getByText('Lancez le script init pour créer les prompts')).toBeInTheDocument();
    });

    it('should show empty message when all prompts are inactive', async () => {
      (api.fetchPrompts as jest.Mock).mockResolvedValue([
        { ...mockPrompts[2], is_active: false },
      ]);

      render(<PromptsTab />);

      await waitFor(() => {
        expect(screen.getByText('Aucun prompt configuré')).toBeInTheDocument();
      });
    });
  });
});
