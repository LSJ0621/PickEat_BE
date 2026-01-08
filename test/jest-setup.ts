// Global Jest setup file
// This file is executed before each test file
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set test environment variables
process.env.NODE_ENV = 'test';

// Load test environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Increase Jest timeout for integration tests if needed
jest.setTimeout(10000);

// Global beforeEach to ensure clean state
beforeEach(() => {
  // Clear all mocks before each test to ensure isolation
  jest.clearAllMocks();
});

// Global afterEach for cleanup
afterEach(async () => {
  // Clear all timers after each test
  jest.clearAllTimers();

  // Allow pending microtasks to complete
  await new Promise((resolve) => setImmediate(resolve));
});

// Global afterAll hook to clean up resources
afterAll(async () => {
  // Clear all timers to prevent open handles
  jest.clearAllTimers();
  jest.useRealTimers();

  // Clear any pending mocks
  jest.clearAllMocks();
  jest.restoreAllMocks();

  // Clear any module cache
  jest.resetModules();

  // Allow async operations to complete
  await new Promise((resolve) => setImmediate(resolve));

  // Final delay to ensure all cleanup is complete
  await new Promise((resolve) => setTimeout(resolve, 100));
});
