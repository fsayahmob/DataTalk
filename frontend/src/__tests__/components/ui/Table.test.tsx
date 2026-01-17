/**
 * Tests for Table UI component
 */
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table';

describe('Table', () => {
  describe('Basic rendering', () => {
    it('renders table element', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with data-slot attributes', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('table')).toHaveAttribute('data-slot', 'table');
    });

    it('wraps table in scrollable container', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      const container = screen.getByRole('table').parentElement;
      expect(container).toHaveAttribute('data-slot', 'table-container');
      expect(container).toHaveClass('overflow-x-auto');
    });
  });

  describe('Table structure', () => {
    it('renders complete table structure', () => {
      render(
        <Table>
          <TableCaption>Sample Data</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>John</TableCell>
              <TableCell>30</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Jane</TableCell>
              <TableCell>25</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total: 2</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      expect(screen.getByText('Sample Data')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Age')).toBeInTheDocument();
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Jane')).toBeInTheDocument();
      expect(screen.getByText('Total: 2')).toBeInTheDocument();
    });

    it('renders header rows with correct role', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column 1</TableHead>
              <TableHead>Column 2</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Data 1</TableCell>
              <TableCell>Data 2</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    });

    it('renders body cells with correct role', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell 1</TableCell>
              <TableCell>Cell 2</TableCell>
              <TableCell>Cell 3</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getAllByRole('cell')).toHaveLength(3);
    });
  });

  describe('Data slot attributes', () => {
    it('has correct data-slot on all elements', () => {
      render(
        <Table>
          <TableCaption>Caption</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Head</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      expect(screen.getByText('Caption')).toHaveAttribute('data-slot', 'table-caption');
      expect(screen.getByText('Head')).toHaveAttribute('data-slot', 'table-head');
      expect(screen.getByText('Cell')).toHaveAttribute('data-slot', 'table-cell');
    });
  });

  describe('Custom className', () => {
    it('merges custom className on Table', () => {
      render(
        <Table className="custom-table">
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('table')).toHaveClass('custom-table');
    });

    it('merges custom className on TableHeader', () => {
      render(
        <Table>
          <TableHeader className="custom-header">
            <TableRow>
              <TableHead>Head</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      // Find the thead by its custom class
      const header = screen.getByText('Head').closest('thead');
      expect(header).toHaveClass('custom-header');
    });

    it('merges custom className on TableRow', () => {
      render(
        <Table>
          <TableBody>
            <TableRow className="custom-row">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('row')).toHaveClass('custom-row');
    });

    it('merges custom className on TableHead', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="custom-head">Header</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('columnheader')).toHaveClass('custom-head');
    });

    it('merges custom className on TableCell', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="custom-cell">Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByRole('cell')).toHaveClass('custom-cell');
    });

    it('merges custom className on TableCaption', () => {
      render(
        <Table>
          <TableCaption className="custom-caption">Caption</TableCaption>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByText('Caption')).toHaveClass('custom-caption');
    });

    it('merges custom className on TableFooter', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter className="custom-footer">
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      const footerCell = screen.getByText('Footer');
      expect(footerCell.closest('tfoot')).toHaveClass('custom-footer');
    });
  });

  describe('Multiple rows', () => {
    it('renders multiple rows correctly', () => {
      const data = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com' },
      ];

      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );

      expect(screen.getAllByRole('row')).toHaveLength(4); // 1 header + 3 body
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  });

  describe('Empty table', () => {
    it('renders empty table body', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody />
        </Table>
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(1); // Only header
    });
  });
});
