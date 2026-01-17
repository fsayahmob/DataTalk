/**
 * Tests for ApiKeysTab component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiKeysTab } from '@/components/settings/ApiKeysTab';
import type { LLMProvider } from '@/lib/api';

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

describe('ApiKeysTab', () => {
  const defaultProps = {
    providers: mockProviders,
    onSaveApiKey: jest.fn().mockResolvedValue(undefined),
    onDeleteApiKey: jest.fn().mockResolvedValue(undefined),
    onSaveBaseUrl: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Google AI')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Ollama')).toBeInTheDocument();
    });

    it('should render table headers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Provider')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('API Key')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should show provider types', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getAllByText('cloud').length).toBe(2);
      expect(screen.getByText('self-hosted')).toBeInTheDocument();
    });
  });

  describe('Status badges', () => {
    it('should show ready badge for available providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    it('should show missing key badge for unconfigured cloud providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('missing key')).toBeInTheDocument();
    });

    it('should show offline badge for unavailable self-hosted providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });

  describe('API Key display', () => {
    it('should show api key hint when configured', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('AIza...xyz')).toBeInTheDocument();
    });

    it('should show Not configured when key is missing', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });

    it('should show N/A for providers that do not require API key', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  describe('Action buttons', () => {
    it('should show Update button for configured providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Update')).toBeInTheDocument();
    });

    it('should show Configure button for unconfigured providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Configure')).toBeInTheDocument();
    });

    it('should show Delete button for configured providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should not show action buttons for providers without API key requirement', () => {
      render(<ApiKeysTab {...defaultProps} />);

      // Ollama row should not have Configure/Update buttons
      const rows = screen.getAllByRole('row');
      const ollamaRow = rows.find(row => row.textContent?.includes('Ollama'));
      expect(ollamaRow).not.toHaveTextContent('Configure');
      expect(ollamaRow).not.toHaveTextContent('Update');
    });
  });

  describe('Edit API key', () => {
    it('should enter edit mode when Configure button is clicked', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should enter edit mode when Update button is clicked', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    });

    it('should exit edit mode when Cancel is clicked', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument();
    });

    it('should exit edit mode when Escape is pressed', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const input = screen.getByPlaceholderText('sk-...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument();
    });

    it('should call onSaveApiKey when Save is clicked', async () => {
      const onSaveApiKey = jest.fn().mockResolvedValue(undefined);
      render(<ApiKeysTab {...defaultProps} onSaveApiKey={onSaveApiKey} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const input = screen.getByPlaceholderText('sk-...');
      fireEvent.change(input, { target: { value: 'sk-test-key-123' } });

      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSaveApiKey).toHaveBeenCalledWith('openai', 'sk-test-key-123');
      });
    });

    it('should call onSaveApiKey when Enter is pressed', async () => {
      const onSaveApiKey = jest.fn().mockResolvedValue(undefined);
      render(<ApiKeysTab {...defaultProps} onSaveApiKey={onSaveApiKey} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const input = screen.getByPlaceholderText('sk-...');
      fireEvent.change(input, { target: { value: 'sk-test-key-123' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onSaveApiKey).toHaveBeenCalledWith('openai', 'sk-test-key-123');
      });
    });

    it('should not save when API key is empty', async () => {
      const onSaveApiKey = jest.fn().mockResolvedValue(undefined);
      render(<ApiKeysTab {...defaultProps} onSaveApiKey={onSaveApiKey} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      // onSaveApiKey should not be called
      expect(onSaveApiKey).not.toHaveBeenCalled();
    });

    it('should disable Save button when API key is empty', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Delete API key', () => {
    it('should call onDeleteApiKey when Delete is clicked', async () => {
      const onDeleteApiKey = jest.fn().mockResolvedValue(undefined);
      render(<ApiKeysTab {...defaultProps} onDeleteApiKey={onDeleteApiKey} />);

      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(onDeleteApiKey).toHaveBeenCalledWith('google');
      });
    });
  });

  describe('Base URL editing (self-hosted)', () => {
    it('should show base URL for self-hosted providers', () => {
      render(<ApiKeysTab {...defaultProps} />);

      expect(screen.getByText('http://localhost:11434')).toBeInTheDocument();
    });

    it('should enter edit mode when base URL is clicked', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const baseUrlButton = screen.getByText('http://localhost:11434');
      fireEvent.click(baseUrlButton);

      expect(screen.getByPlaceholderText('http://localhost:11434')).toBeInTheDocument();
    });

    it('should show placeholder when base URL is not configured', () => {
      const providersWithoutUrl: LLMProvider[] = [
        {
          ...mockProviders[2],
          base_url: null,
        },
      ];

      render(<ApiKeysTab {...defaultProps} providers={providersWithoutUrl} />);

      expect(screen.getByText('Click to configure URL')).toBeInTheDocument();
    });

    it('should call onSaveBaseUrl when Save is clicked', async () => {
      const onSaveBaseUrl = jest.fn().mockResolvedValue(undefined);
      render(<ApiKeysTab {...defaultProps} onSaveBaseUrl={onSaveBaseUrl} />);

      const baseUrlButton = screen.getByText('http://localhost:11434');
      fireEvent.click(baseUrlButton);

      const input = screen.getByPlaceholderText('http://localhost:11434');
      fireEvent.change(input, { target: { value: 'http://192.168.1.100:11434' } });

      // Find Save button in base URL row
      const saveButtons = screen.getAllByText('Save');
      fireEvent.click(saveButtons[0]);

      await waitFor(() => {
        expect(onSaveBaseUrl).toHaveBeenCalledWith('ollama', 'http://192.168.1.100:11434');
      });
    });

    it('should exit base URL edit mode when close button is clicked', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const baseUrlButton = screen.getByText('http://localhost:11434');
      fireEvent.click(baseUrlButton);

      const closeButton = screen.getByText('✕');
      fireEvent.click(closeButton);

      expect(screen.queryByPlaceholderText('http://localhost:11434')).not.toBeInTheDocument();
    });

    it('should exit base URL edit mode when Escape is pressed', () => {
      render(<ApiKeysTab {...defaultProps} />);

      const baseUrlButton = screen.getByText('http://localhost:11434');
      fireEvent.click(baseUrlButton);

      const input = screen.getByPlaceholderText('http://localhost:11434');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByPlaceholderText('http://localhost:11434')).not.toBeInTheDocument();
    });
  });
});
