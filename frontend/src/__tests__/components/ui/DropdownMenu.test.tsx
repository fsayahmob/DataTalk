/**
 * Tests for DropdownMenu UI component
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';

describe('DropdownMenu', () => {
  describe('Basic rendering', () => {
    it('renders trigger button', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.getByRole('button', { name: 'Open Menu' })).toBeInTheDocument();
    });

    it('does not show content initially', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('has data-slot attribute on trigger', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'dropdown-menu-trigger');
    });
  });

  describe('Opening and closing', () => {
    it('opens menu when trigger is clicked', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Action 1</DropdownMenuItem>
            <DropdownMenuItem>Action 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button', { name: 'Open Menu' }));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('shows all menu items when opened', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Copy</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
      });
    });

    it('closes menu when pressing Escape', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('Menu items', () => {
    it('triggers onClick when item is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleClick}>Click Me</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('menuitem', { name: 'Click Me' }));

      expect(handleClick).toHaveBeenCalled();
    });

    it('renders destructive variant', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menuitem')).toHaveAttribute('data-variant', 'destructive');
      });
    });

    it('renders disabled item', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled>Disabled Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menuitem')).toHaveAttribute('data-disabled');
      });
    });
  });

  describe('Labels and separators', () => {
    it('renders label', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuItem>Profile</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('My Account')).toBeInTheDocument();
      });
    });

    it('renders separator', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Item 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('separator')).toBeInTheDocument();
      });
    });
  });

  describe('Groups', () => {
    it('renders grouped items', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem>Group Item 1</DropdownMenuItem>
              <DropdownMenuItem>Group Item 2</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('group')).toBeInTheDocument();
      });
    });
  });

  describe('Checkbox items', () => {
    it('renders checkbox item', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked>Show Panel</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menuitemcheckbox')).toBeInTheDocument();
      });
    });
  });

  describe('Radio items', () => {
    it('renders radio group', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value="option1">
              <DropdownMenuRadioItem value="option1">Option 1</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="option2">Option 2</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
      });
    });
  });

  describe('Shortcuts', () => {
    it('renders keyboard shortcut', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              Save
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('⌘S')).toBeInTheDocument();
      });
    });
  });

  describe('Inset items', () => {
    it('renders inset item', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem inset>Inset Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menuitem')).toHaveAttribute('data-inset', 'true');
      });
    });

    it('renders inset label', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel inset>Inset Label</DropdownMenuLabel>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Inset Label')).toHaveAttribute('data-inset', 'true');
      });
    });
  });

  describe('Custom className', () => {
    it('merges custom className on content', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent className="custom-content">
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toHaveClass('custom-content');
      });
    });
  });
});
