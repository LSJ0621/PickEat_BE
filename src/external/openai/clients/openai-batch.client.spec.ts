import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAiBatchClient } from './openai-batch.client';
import { BatchResponse } from '@/batch/types/preference-batch.types';

describe('OpenAiBatchClient', () => {
  let client: OpenAiBatchClient;
  let mockOpenAi: {
    files: {
      content: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockOpenAi = {
      files: {
        content: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiBatchClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    client = module.get<OpenAiBatchClient>(OpenAiBatchClient);

    // Inject mock OpenAI client
    (client as any).openai = mockOpenAi;
  });

  describe('downloadResults', () => {
    it('should return results and empty errors array when all responses are successful', async () => {
      // Arrange
      const successfulResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ analysis: 'test analysis' }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const jsonlContent = JSON.stringify(successfulResponse);

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(1);
      expect(result.results.get('pref_1_100')).toBe(
        JSON.stringify({ analysis: 'test analysis' }),
      );
      expect(result.errors).toEqual([]);
    });

    it('should add error when status_code is not 200', async () => {
      // Arrange
      const invalidStatusResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: {
          status_code: 400,
          body: {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'test',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const jsonlContent = JSON.stringify(invalidStatusResponse);

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        customId: 'pref_1_100',
        reason: 'invalid_status_code',
        statusCode: 400,
      });
    });

    it('should add error when content is null', async () => {
      // Arrange
      const nullContentResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const jsonlContent = JSON.stringify(nullContentResponse);

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        customId: 'pref_1_100',
        reason: 'null_content',
      });
    });

    it('should add error when response contains API error', async () => {
      // Arrange
      const apiErrorResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: null,
        error: {
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded',
        },
      };

      const jsonlContent = JSON.stringify(apiErrorResponse);

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        customId: 'pref_1_100',
        reason: 'api_error',
        errorCode: 'rate_limit_exceeded',
        errorMessage: 'Rate limit exceeded',
      });
    });

    it('should handle multiple errors in a single batch', async () => {
      // Arrange
      const successResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ analysis: 'test' }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const nullContentResponse: BatchResponse = {
        id: 'batch-2',
        custom_id: 'pref_2_200',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-124',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const apiErrorResponse: BatchResponse = {
        id: 'batch-3',
        custom_id: 'pref_3_300',
        response: null,
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
        },
      };

      const jsonlContent = [
        JSON.stringify(successResponse),
        JSON.stringify(nullContentResponse),
        JSON.stringify(apiErrorResponse),
      ].join('\n');

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toEqual({
        customId: 'pref_2_200',
        reason: 'null_content',
      });
      expect(result.errors[1]).toEqual({
        customId: 'pref_3_300',
        reason: 'api_error',
        errorCode: 'invalid_request',
        errorMessage: 'Invalid request',
      });
    });

    it('should handle parse errors gracefully', async () => {
      // Arrange
      const invalidJsonContent = 'invalid json line';

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(invalidJsonContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        customId: 'unknown',
        reason: 'parse_error',
        errorMessage: expect.stringContaining('Failed to parse line'),
      });
    });

    it('should skip empty lines', async () => {
      // Arrange
      const successResponse: BatchResponse = {
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ analysis: 'test' }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          },
        },
        error: null,
      };

      const jsonlContent = `\n${JSON.stringify(successResponse)}\n\n`;

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(jsonlContent),
      });

      // Act
      const result = await client.downloadResults('file-123');

      // Assert
      expect(result.results.size).toBe(1);
      expect(result.errors).toEqual([]);
    });
  });

  describe('ensureClient', () => {
    it('should throw error when OpenAI client is not initialized', async () => {
      // Arrange
      (client as any).openai = null;

      // Act & Assert
      await expect(client.downloadResults('file-123')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });
  });

  describe('isReady', () => {
    it('should return true when client is initialized', () => {
      // Arrange
      (client as any).openai = mockOpenAi;

      // Act & Assert
      expect(client.isReady()).toBe(true);
    });

    it('should return false when client is not initialized', () => {
      // Arrange
      (client as any).openai = null;

      // Act & Assert
      expect(client.isReady()).toBe(false);
    });
  });
});
