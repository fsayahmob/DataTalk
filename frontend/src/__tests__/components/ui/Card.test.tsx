/**
 * Tests for Card components
 */
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  it('should render a card', () => {
    render(<Card data-testid="card">Card Content</Card>);

    const card = screen.getByTestId('card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Card Content');
  });

  it('should have data-slot attribute', () => {
    render(<Card data-testid="card">Content</Card>);

    const card = screen.getByTestId('card');
    expect(card).toHaveAttribute('data-slot', 'card');
  });

  it('should accept custom className', () => {
    render(<Card className="custom-class" data-testid="card">Content</Card>);

    const card = screen.getByTestId('card');
    expect(card).toHaveClass('custom-class');
  });
});

describe('CardHeader', () => {
  it('should render a card header', () => {
    render(<CardHeader data-testid="header">Header Content</CardHeader>);

    const header = screen.getByTestId('header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Header Content');
  });

  it('should have data-slot attribute', () => {
    render(<CardHeader data-testid="header">Content</CardHeader>);

    const header = screen.getByTestId('header');
    expect(header).toHaveAttribute('data-slot', 'card-header');
  });

  it('should accept custom className', () => {
    render(<CardHeader className="custom-class" data-testid="header">Content</CardHeader>);

    const header = screen.getByTestId('header');
    expect(header).toHaveClass('custom-class');
  });
});

describe('CardTitle', () => {
  it('should render a card title', () => {
    render(<CardTitle data-testid="title">My Title</CardTitle>);

    const title = screen.getByTestId('title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('My Title');
  });

  it('should have data-slot attribute', () => {
    render(<CardTitle data-testid="title">Title</CardTitle>);

    const title = screen.getByTestId('title');
    expect(title).toHaveAttribute('data-slot', 'card-title');
  });

  it('should have font-semibold class', () => {
    render(<CardTitle data-testid="title">Title</CardTitle>);

    const title = screen.getByTestId('title');
    expect(title).toHaveClass('font-semibold');
  });
});

describe('CardDescription', () => {
  it('should render a card description', () => {
    render(<CardDescription data-testid="desc">Description text</CardDescription>);

    const desc = screen.getByTestId('desc');
    expect(desc).toBeInTheDocument();
    expect(desc).toHaveTextContent('Description text');
  });

  it('should have data-slot attribute', () => {
    render(<CardDescription data-testid="desc">Desc</CardDescription>);

    const desc = screen.getByTestId('desc');
    expect(desc).toHaveAttribute('data-slot', 'card-description');
  });

  it('should have muted foreground color', () => {
    render(<CardDescription data-testid="desc">Desc</CardDescription>);

    const desc = screen.getByTestId('desc');
    expect(desc).toHaveClass('text-muted-foreground');
  });
});

describe('CardAction', () => {
  it('should render a card action', () => {
    render(<CardAction data-testid="action">Action Button</CardAction>);

    const action = screen.getByTestId('action');
    expect(action).toBeInTheDocument();
    expect(action).toHaveTextContent('Action Button');
  });

  it('should have data-slot attribute', () => {
    render(<CardAction data-testid="action">Action</CardAction>);

    const action = screen.getByTestId('action');
    expect(action).toHaveAttribute('data-slot', 'card-action');
  });
});

describe('CardContent', () => {
  it('should render card content', () => {
    render(<CardContent data-testid="content">Main content</CardContent>);

    const content = screen.getByTestId('content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent('Main content');
  });

  it('should have data-slot attribute', () => {
    render(<CardContent data-testid="content">Content</CardContent>);

    const content = screen.getByTestId('content');
    expect(content).toHaveAttribute('data-slot', 'card-content');
  });

  it('should have padding class', () => {
    render(<CardContent data-testid="content">Content</CardContent>);

    const content = screen.getByTestId('content');
    expect(content).toHaveClass('px-6');
  });
});

describe('CardFooter', () => {
  it('should render card footer', () => {
    render(<CardFooter data-testid="footer">Footer content</CardFooter>);

    const footer = screen.getByTestId('footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent('Footer content');
  });

  it('should have data-slot attribute', () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);

    const footer = screen.getByTestId('footer');
    expect(footer).toHaveAttribute('data-slot', 'card-footer');
  });

  it('should use flexbox layout', () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);

    const footer = screen.getByTestId('footer');
    expect(footer).toHaveClass('flex');
  });
});

describe('Card Composition', () => {
  it('should render a complete card with all components', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
          <CardAction>
            <button>Action</button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>Main content goes here</p>
        </CardContent>
        <CardFooter>
          <button>Save</button>
          <button>Cancel</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Description')).toBeInTheDocument();
    expect(screen.getByText('Main content goes here')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
