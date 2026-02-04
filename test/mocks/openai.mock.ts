/**
 * OpenAI Mock Utilities
 *
 * This file provides utility functions for creating OpenAI mock instances.
 * The actual module-level mock is in openai.setup.ts (which must be imported first).
 *
 * @see openai.setup.ts - Contains the top-level jest.mock() for the 'openai' module
 */
import { mockOpenAIResponses } from './external-clients.mock';
import { OpenAIResponse } from '@/external/openai/openai.types';
import { mockChatCompletionsCreate } from './openai.setup';

/**
 * Mock OpenAI SDK for unit tests
 * This creates a mock instance that prevents real API calls to OpenAI
 */
export function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
  };
}

/**
 * Creates a mock OpenAI instance with validation response
 */
export function createMockOpenAIForValidation() {
  return {
    chat: {
      completions: {
        create: jest
          .fn()
          .mockResolvedValue(mockOpenAIResponses.menuValidationSuccess),
      },
    },
  };
}

/**
 * Creates a mock OpenAI instance with custom response
 */
export function createMockOpenAIWithResponse(response: OpenAIResponse) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue(response),
      },
    },
  };
}

/**
 * Creates a mock OpenAI instance that throws an error
 */
export function createMockOpenAIWithError(error: Error) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockRejectedValue(error),
      },
    },
  };
}

/**
 * Mock place recommendation response for OpenAiPlacesService
 */
export const mockPlaceRecommendationResponse = {
  id: 'chatcmpl-place-123',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          recommendations: [
            {
              placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
              name: '맛있는 식당',
              reason: '가까운 거리에 있고 평점이 높으며 리뷰가 좋습니다.',
            },
          ],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  },
};
