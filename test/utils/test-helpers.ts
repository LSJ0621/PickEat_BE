/**
 * Creates a mock service with specified methods
 * Each method is mocked with jest.fn()
 *
 * @example
 * const mockService = createMockService<UserService>(['findOne', 'create', 'update']);
 * mockService.findOne.mockResolvedValue(user);
 */
export function createMockService<T>(methods: (keyof T)[]): jest.Mocked<T> {
  const mock = {} as any;
  methods.forEach((method) => {
    mock[method] = jest.fn();
  });
  return mock as jest.Mocked<T>;
}

/**
 * Delay execution for testing async operations
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock console methods to prevent noise in test output
 * Returns restore function to restore original console methods
 *
 * @returns Function to restore original console methods
 */
export function mockConsole(): () => void {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();

  return () => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  };
}
