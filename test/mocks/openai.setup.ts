/**
 * OpenAI Mock Setup for E2E Tests
 *
 * This file sets up the OpenAI module mock at the top level.
 * Import this file BEFORE creating the testing app in E2E tests.
 */

import { mockOpenAIResponses } from './external-clients.mock';

/**
 * Shared mock function for chat.completions.create
 * This allows us to control the behavior across all OpenAI instances
 */
export const mockChatCompletionsCreate = jest.fn();

/**
 * Mock OpenAI constructor
 * Returns a mock instance with the chat.completions.create method
 */
const MockOpenAI = jest.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: mockChatCompletionsCreate,
    },
  },
}));

// Mock the 'openai' module with both default and named exports
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: MockOpenAI,
    OpenAI: MockOpenAI,
  };
});

/**
 * Reset and set default mock behavior for OpenAI
 * Call this in beforeEach to ensure clean state
 *
 * Default behavior: Return validation success first, then chat completion success
 * This matches the typical flow: validate prompt -> generate recommendations
 */
export function resetOpenAIMock() {
  mockChatCompletionsCreate.mockReset();
  // Set up default responses for typical flow: validation then recommendation
  mockChatCompletionsCreate
    .mockResolvedValueOnce(mockOpenAIResponses.menuValidationSuccess)
    .mockResolvedValue(mockOpenAIResponses.chatCompletionSuccess);
}

/**
 * Export mock responses for convenience
 */
export { mockOpenAIResponses };
