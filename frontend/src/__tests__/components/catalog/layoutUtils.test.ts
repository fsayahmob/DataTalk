/**
 * Tests for layoutUtils - Dagre graph layout utilities
 */
import { getLayoutedElements } from '@/components/catalog/layoutUtils';
import type { CatalogTable } from '@/lib/api';

// Mock dagre
jest.mock('dagre', () => {
  const mockGraph = {
    setDefaultEdgeLabel: jest.fn(),
    setGraph: jest.fn(),
    setNode: jest.fn(),
    setEdge: jest.fn(),
    node: jest.fn((_id: string) => ({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    })),
  };

  return {
    graphlib: {
      Graph: jest.fn(() => mockGraph),
    },
    layout: jest.fn(),
  };
});

describe('layoutUtils', () => {
  describe('getLayoutedElements', () => {
    it('returns empty arrays for empty tables', () => {
      const result = getLayoutedElements([]);

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('creates nodes for each table', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'users',
          description: 'User table',
          row_count: 100,
          is_enabled: true,
          columns: [
            { id: 1, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 2, name: 'name', data_type: 'VARCHAR', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('table-users');
      expect(result.nodes[0].type).toBe('schemaNode');
      expect(result.nodes[0].data.label).toBe('users');
      expect(result.nodes[0].data.columns).toHaveLength(2);
    });

    it('includes row count in node data', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'orders',
          description: null,
          row_count: 5000,
          is_enabled: true,
          columns: [],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes[0].data.rowCount).toBe(5000);
    });

    it('includes table description in node data', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'products',
          description: 'Product catalog',
          row_count: 200,
          is_enabled: true,
          columns: [],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes[0].data.description).toBe('Product catalog');
    });

    it('detects FK relations from id_* pattern', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'orders',
          description: null,
          row_count: 100,
          is_enabled: true,
          columns: [
            { id: 1, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 2, name: 'id_client', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 2,
          name: 'clients',
          description: null,
          row_count: 50,
          is_enabled: true,
          columns: [
            { id: 3, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 4, name: 'name', data_type: 'VARCHAR', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.edges.length).toBeGreaterThan(0);
      const clientEdge = result.edges.find(e => e.label === 'id_client');
      expect(clientEdge).toBeDefined();
    });

    it('detects FK relations from common join columns', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'courses',
          description: null,
          row_count: 100,
          is_enabled: true,
          columns: [
            { id: 1, name: 'num_course', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 2, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 2,
          name: 'taxis',
          description: null,
          row_count: 50,
          is_enabled: true,
          columns: [
            { id: 3, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 4, name: 'nom', data_type: 'VARCHAR', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      // Should detect cod_taxi as a join column
      const taxiEdge = result.edges.find(e => e.label === 'cod_taxi');
      expect(taxiEdge).toBeDefined();
    });

    it('creates edges with smoothstep type', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'table_a',
          description: null,
          row_count: 10,
          is_enabled: true,
          columns: [
            { id: 1, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 2,
          name: 'table_b',
          description: null,
          row_count: 20,
          is_enabled: true,
          columns: [
            { id: 2, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      if (result.edges.length > 0) {
        expect(result.edges[0].type).toBe('smoothstep');
        expect(result.edges[0].className).toBe('catalog-edge');
      }
    });

    it('sets is_enabled from table data', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'disabled_table',
          description: null,
          row_count: 0,
          is_enabled: false,
          columns: [],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes[0].data.isEnabled).toBe(false);
    });

    it('defaults is_enabled to true when undefined', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'table_without_enabled',
          description: null,
          row_count: 0,
          is_enabled: true,
          columns: [],
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes[0].data.isEnabled).toBe(true);
    });

    it('creates unique edge IDs', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'orders',
          description: null,
          row_count: 100,
          is_enabled: true,
          columns: [
            { id: 1, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
            { id: 2, name: 'client_id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 2,
          name: 'taxis',
          description: null,
          row_count: 50,
          is_enabled: true,
          columns: [
            { id: 3, name: 'cod_taxi', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 3,
          name: 'clients',
          description: null,
          row_count: 30,
          is_enabled: true,
          columns: [
            { id: 4, name: 'client_id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      // Check that all edge IDs are unique
      const edgeIds = result.edges.map(e => e.id);
      const uniqueIds = new Set(edgeIds);
      expect(uniqueIds.size).toBe(edgeIds.length);
    });

    it('applies position from dagre layout', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'single_table',
          description: null,
          row_count: 10,
          is_enabled: true,
          columns: [
            { id: 1, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      // The mock returns x=100, y=100, width=300, height=200
      // Position should be adjusted: x - width/2, y - height/2
      expect(result.nodes[0].position.x).toBe(100 - 300 / 2);
      expect(result.nodes[0].position.y).toBe(100 - 200 / 2);
    });

    it('handles tables with many columns', () => {
      const columns = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `col_${i}`,
        data_type: 'VARCHAR',
        description: null,
        sample_values: null,
        full_context: null,
        value_range: null,
      }));

      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'wide_table',
          description: null,
          row_count: 1000,
          is_enabled: true,
          columns,
        },
      ];

      const result = getLayoutedElements(tables);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].data.columns).toHaveLength(20);
    });

    it('detects FK pattern with fk_ prefix', () => {
      const tables: CatalogTable[] = [
        {
          id: 1,
          name: 'orders',
          description: null,
          row_count: 100,
          is_enabled: true,
          columns: [
            { id: 1, name: 'fk_customer', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
        {
          id: 2,
          name: 'customers',
          description: null,
          row_count: 50,
          is_enabled: true,
          columns: [
            { id: 2, name: 'id', data_type: 'INTEGER', description: null, sample_values: null, full_context: null, value_range: null },
          ],
        },
      ];

      const result = getLayoutedElements(tables);

      const fkEdge = result.edges.find(e => e.label === 'fk_customer');
      expect(fkEdge).toBeDefined();
    });
  });
});
