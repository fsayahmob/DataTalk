/**
 * Tests for SchemaNode component
 */
import { render, screen } from '@testing-library/react';
import { SchemaNode, type SchemaNodeData } from '@/components/catalog/SchemaNode';

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
  },
}));

// Mock useTranslation
jest.mock('@/hooks/useTranslation', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'catalog.excluded': 'Excluded',
      'catalog.not_enriched': 'Not enriched',
      'catalog.columns': 'columns',
    };
    return translations[key] || key;
  },
}));

describe('SchemaNode', () => {
  const defaultColumns = [
    { id: 1, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
    { id: 2, name: 'name', data_type: 'VARCHAR(255)', description: null, sample_values: null, full_context: null, value_range: null },
  ];

  const createNodeData = (overrides: Partial<SchemaNodeData> = {}): SchemaNodeData => ({
    label: 'users',
    description: null,
    rowCount: 100,
    columns: defaultColumns,
    isPreview: false,
    isEnabled: true,
    ...overrides,
  });

  describe('Basic rendering', () => {
    it('renders table name', () => {
      render(<SchemaNode data={createNodeData()} />);

      expect(screen.getByText('users')).toBeInTheDocument();
    });

    it('renders row count badge', () => {
      render(<SchemaNode data={createNodeData({ rowCount: 1500 })} />);

      expect(screen.getByText('1,500 rows')).toBeInTheDocument();
    });

    it('renders column names', () => {
      render(<SchemaNode data={createNodeData()} />);

      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('renders handles for connections', () => {
      render(<SchemaNode data={createNodeData()} />);

      expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'left');
      expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'right');
    });
  });

  describe('Description', () => {
    it('shows description when provided', () => {
      render(<SchemaNode data={createNodeData({ description: 'User accounts table' })} />);

      expect(screen.getByText('User accounts table')).toBeInTheDocument();
    });

    it('does not show description section when null', () => {
      render(<SchemaNode data={createNodeData({ description: null })} />);

      expect(screen.queryByText(/table/i)).not.toBeInTheDocument();
    });
  });

  describe('Data type icons', () => {
    it('shows # icon for integer types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'count', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('#')).toBeInTheDocument();
    });

    it('shows Aa icon for varchar types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'title', data_type: 'VARCHAR', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('Aa')).toBeInTheDocument();
    });

    it('shows timer icon for date types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'created_at', data_type: 'TIMESTAMP', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      // Timer icon is ⏱
      expect(screen.getByText('⏱')).toBeInTheDocument();
    });

    it('shows checkmark icon for boolean types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'active', data_type: 'BOOLEAN', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('shows {} icon for json types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'metadata', data_type: 'JSON', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('{}')).toBeInTheDocument();
    });

    it('shows ? icon for unknown types', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'data', data_type: 'BLOB', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('?')).toBeInTheDocument();
    });
  });

  describe('Column truncation', () => {
    it('shows all columns when under limit', () => {
      const columns = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `col_${i}`,
        data_type: 'VARCHAR',
        description: null,
        sample_values: null,
        full_context: null,
        value_range: null,
      }));

      render(<SchemaNode data={createNodeData({ columns })} />);

      expect(screen.getByText('col_0')).toBeInTheDocument();
      expect(screen.getByText('col_4')).toBeInTheDocument();
      expect(screen.queryByText(/\+\d+ columns/)).not.toBeInTheDocument();
    });

    it('truncates columns over limit and shows count', () => {
      const columns = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        name: `col_${i}`,
        data_type: 'VARCHAR',
        description: null,
        sample_values: null,
        full_context: null,
        value_range: null,
      }));

      render(<SchemaNode data={createNodeData({ columns })} />);

      // First 12 columns should be visible
      expect(screen.getByText('col_0')).toBeInTheDocument();
      expect(screen.getByText('col_11')).toBeInTheDocument();

      // Column 12+ should be hidden
      expect(screen.queryByText('col_12')).not.toBeInTheDocument();

      // Should show "+3 columns..."
      expect(screen.getByText('+3 columns...')).toBeInTheDocument();
    });
  });

  describe('Enabled state', () => {
    it('shows excluded badge when disabled', () => {
      render(<SchemaNode data={createNodeData({ isEnabled: false })} />);

      expect(screen.getByText('Excluded')).toBeInTheDocument();
    });

    it('does not show excluded badge when enabled', () => {
      render(<SchemaNode data={createNodeData({ isEnabled: true })} />);

      expect(screen.queryByText('Excluded')).not.toBeInTheDocument();
    });
  });

  describe('Enrichment state', () => {
    it('shows not enriched badge when enabled but no description', () => {
      render(<SchemaNode data={createNodeData({ isEnabled: true, description: null })} />);

      expect(screen.getByText('Not enriched')).toBeInTheDocument();
    });

    it('does not show not enriched badge when has description', () => {
      render(<SchemaNode data={createNodeData({ isEnabled: true, description: 'Has desc' })} />);

      expect(screen.queryByText('Not enriched')).not.toBeInTheDocument();
    });

    it('does not show not enriched badge when disabled', () => {
      render(<SchemaNode data={createNodeData({ isEnabled: false, description: null })} />);

      expect(screen.queryByText('Not enriched')).not.toBeInTheDocument();
    });
  });

  describe('Preview state', () => {
    it('applies preview styling when isPreview is true', () => {
      const { container } = render(<SchemaNode data={createNodeData({ isPreview: true })} />);

      // Check for amber/preview related classes
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('amber');
    });
  });

  describe('Column value range', () => {
    it('shows value range badge when present', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [
              { id: 1, name: 'rating', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: '1-5' },
            ],
          })}
        />
      );

      expect(screen.getByText('1-5')).toBeInTheDocument();
    });

    it('does not show value range when not present', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.queryByText(/\d+-\d+/)).not.toBeInTheDocument();
    });
  });

  describe('Data type display', () => {
    it('strips parentheses from data type', () => {
      render(
        <SchemaNode
          data={createNodeData({
            columns: [{ id: 1, name: 'name', data_type: 'VARCHAR(255)', description: null, sample_values: null, full_context: null, value_range: null }],
          })}
        />
      );

      expect(screen.getByText('VARCHAR')).toBeInTheDocument();
      expect(screen.queryByText('VARCHAR(255)')).not.toBeInTheDocument();
    });
  });

  describe('Row count handling', () => {
    it('does not show row count when undefined', () => {
      render(<SchemaNode data={createNodeData({ rowCount: undefined })} />);

      expect(screen.queryByText(/rows/)).not.toBeInTheDocument();
    });

    it('does not show row count when null', () => {
      render(<SchemaNode data={createNodeData({ rowCount: null })} />);

      expect(screen.queryByText(/rows/)).not.toBeInTheDocument();
    });

    it('formats large row counts with locale', () => {
      render(<SchemaNode data={createNodeData({ rowCount: 1000000 })} />);

      expect(screen.getByText('1,000,000 rows')).toBeInTheDocument();
    });
  });
});
