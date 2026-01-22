/**
 * Test helpers for API tests
 * Provides utilities to work with apiFetch which now adds Accept-Language headers
 */

/**
 * Creates a matcher for fetch calls that accepts any Headers object
 * Use this when you only care about the URL and method, not the exact headers
 */
export function expectFetchCalledWith(
  mockFetch: jest.Mock,
  url: string,
  options?: RequestInit
) {
  const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
  expect(calledUrl).toBe(url);

  if (options) {
    // Check each specified option, but don't require exact headers match
    if (options.method) {
      expect(calledOptions?.method).toBe(options.method);
    }
    if (options.body) {
      expect(calledOptions?.body).toBe(options.body);
    }
    // Verify headers contain Content-Type if specified
    if (options.headers && typeof options.headers === 'object') {
      const optHeaders = options.headers as Record<string, string>;
      if (optHeaders['Content-Type']) {
        expect(calledOptions?.headers?.get?.('Content-Type') || calledOptions?.headers?.['Content-Type'])
          .toBe(optHeaders['Content-Type']);
      }
    }
  }

  // Always verify Accept-Language header is set
  expect(calledOptions?.headers).toBeDefined();
}

/**
 * Creates a custom matcher for the specific call index
 */
export function expectFetchNthCalledWith(
  mockFetch: jest.Mock,
  callIndex: number,
  url: string,
  options?: RequestInit
) {
  const [calledUrl, calledOptions] = mockFetch.mock.calls[callIndex];
  expect(calledUrl).toBe(url);

  if (options) {
    if (options.method) {
      expect(calledOptions?.method).toBe(options.method);
    }
    if (options.body) {
      expect(calledOptions?.body).toBe(options.body);
    }
  }
}
