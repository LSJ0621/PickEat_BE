// Global Jest setup file
// This file is executed before each test file

// Set test environment variables if needed
process.env.NODE_ENV = 'test';

// Increase Jest timeout for integration tests if needed
jest.setTimeout(10000);

// Global beforeEach to ensure clean state
beforeEach(() => {
  // Clear all mocks before each test to ensure isolation
  jest.clearAllMocks();
});

// Global afterEach for cleanup
afterEach(() => {
  // Additional cleanup if needed
});
