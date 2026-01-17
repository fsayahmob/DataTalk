/**
 * Test de validation du setup Jest + RTL
 */

describe('Jest Setup', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to jest-dom matchers', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello';
    document.body.appendChild(div);

    expect(div).toBeInTheDocument();
    expect(div).toHaveTextContent('Hello');

    document.body.removeChild(div);
  });

  it('should mock ResizeObserver', () => {
    expect(global.ResizeObserver).toBeDefined();
    const observer = new ResizeObserver(() => {});
    expect(observer.observe).toBeDefined();
    expect(observer.disconnect).toBeDefined();
  });

  it('should mock matchMedia', () => {
    expect(window.matchMedia).toBeDefined();
    const result = window.matchMedia('(min-width: 768px)');
    expect(result.matches).toBe(false);
  });
});
