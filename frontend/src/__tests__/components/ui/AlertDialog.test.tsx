/**
 * Tests for AlertDialog UI component
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

describe('AlertDialog', () => {
  describe('Basic rendering', () => {
    it('renders trigger button', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    });

    it('does not render content initially', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  describe('Opening and closing', () => {
    it('opens dialog when trigger is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
    });

    it('closes dialog when cancel is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('closes dialog when action is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Content elements', () => {
    it('renders title', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item</AlertDialogTitle>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByText('Delete Item')).toBeInTheDocument();
      });
    });

    it('renders description', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });
    });

    it('renders header and footer', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
      });
    });
  });

  describe('Data slot attributes', () => {
    it('has correct data-slot attributes', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Title</AlertDialogTitle>
              <AlertDialogDescription>Description</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute(
        'data-slot',
        'alert-dialog-trigger'
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toHaveAttribute(
          'data-slot',
          'alert-dialog-content'
        );
      });
    });
  });

  describe('Custom className', () => {
    it('merges custom className on content', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent className="custom-dialog">
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toHaveClass('custom-dialog');
      });
    });

    it('merges custom className on header', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="custom-header">
              <AlertDialogTitle>Title</AlertDialogTitle>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));

      await waitFor(() => {
        expect(screen.getByText('Title').parentElement).toHaveClass('custom-header');
      });
    });
  });

  describe('Controlled mode', () => {
    it('works with controlled open state', async () => {
      const TestComponent = () => {
        const [open, setOpen] = React.useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>External Open</button>
            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>Controlled</AlertDialogTitle>
                <AlertDialogFooter>
                  <AlertDialogCancel>Close</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        );
      };

      const user = userEvent.setup();
      render(<TestComponent />);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'External Open' }));

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
    });
  });
});

// Need to import React for the controlled mode test
import * as React from 'react';
