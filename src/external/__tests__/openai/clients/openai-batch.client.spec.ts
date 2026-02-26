import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAiBatchClient } from '../../../../external/openai/clients/openai-batch.client';
import {
  BatchRequest,
  BatchResponse,
} from '@/batch/types/preference-batch.types';

describe('OpenAiBatchClient', () => {
  let client: OpenAiBatchClient;
  let mockOpenAi: {
    files: {
      content: jest.Mock;
      create: jest.Mock;
    };
    batches: {
      create: jest.Mock;
      retrieve: jest.Mock;
      cancel: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockOpenAi = {
      files: {
        content: jest.fn(),
        create: jest.fn(),
      },
      batches: {
        create: jest.fn(),
        retrieve: jest.fn(),
        cancel: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiBatchClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
            getOrThrow: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    client = module.get<OpenAiBatchClient>(OpenAiBatchClient);

    // Inject mock OpenAI client
    (client as any).openai = mockOpenAi;
  });

  // =========================================================================
  // createBatchContent
  // =========================================================================

  describe('createBatchContent', () => {
    it('should serialize each request as a JSON line separated by newlines', () => {
      const requests: BatchRequest[] = [
        {
          custom_id: 'pref_1_10',
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hello' }],
          },
        },
        {
          custom_id: 'pref_2_20',
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'world' }],
          },
        },
      ];

      const result = client.createBatchContent(requests);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(requests[0]);
      expect(JSON.parse(lines[1])).toEqual(requests[1]);
    });

    it('should return an empty string when requests array is empty', () => {
      const result = client.createBatchContent([]);
      expect(result).toBe('');
    });

    it('should handle a single request without trailing newline', () => {
      const request: BatchRequest = {
        custom_id: 'pref_1_10',
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'test' }],
        },
      };

      const result = client.createBatchContent([request]);
      expect(result).not.toContain('\n');
      expect(JSON.parse(result)).toEqual(request);
    });
  });

  // =========================================================================
  // uploadBatchContent
  // =========================================================================

  describe('uploadBatchContent', () => {
    it('should upload content and return the file ID', async () => {
      mockOpenAi.files.create.mockResolvedValue({ id: 'file_abc123' });

      const result = await client.uploadBatchContent('{"test":"data"}');

      expect(result).toBe('file_abc123');
      expect(mockOpenAi.files.create).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'batch' }),
      );
    });

    it('should throw ConfigMissingException when client is not initialized', async () => {
      (client as any).openai = null;

      await expect(client.uploadBatchContent('data')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });

    it('should propagate error when files.create throws', async () => {
      const apiError = new Error('API upload failed');
      mockOpenAi.files.create.mockRejectedValue(apiError);

      await expect(client.uploadBatchContent('data')).rejects.toThrow(
        'API upload failed',
      );
    });
  });

  // =========================================================================
  // createBatch
  // =========================================================================

  describe('createBatch', () => {
    it('should create a batch and return the batch ID', async () => {
      mockOpenAi.batches.create.mockResolvedValue({ id: 'batch_xyz789' });

      const result = await client.createBatch('file_abc123');

      expect(result).toBe('batch_xyz789');
      expect(mockOpenAi.batches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input_file_id: 'file_abc123',
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
        }),
      );
    });

    it('should include provided metadata in the batch creation call', async () => {
      mockOpenAi.batches.create.mockResolvedValue({ id: 'batch_xyz789' });

      await client.createBatch('file_abc123', {
        job_type: 'preference_analysis',
        batch_job_id: '42',
      });

      expect(mockOpenAi.batches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_type: 'preference_analysis',
            batch_job_id: '42',
          }),
        }),
      );
    });

    it('should include created_at in metadata even when no metadata provided', async () => {
      mockOpenAi.batches.create.mockResolvedValue({ id: 'batch_xyz789' });

      await client.createBatch('file_abc123');

      expect(mockOpenAi.batches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            created_at: expect.any(String),
          }),
        }),
      );
    });

    it('should throw ConfigMissingException when client is not initialized', async () => {
      (client as any).openai = null;

      await expect(client.createBatch('file_abc123')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });

    it('should propagate error when batches.create throws', async () => {
      const apiError = new Error('Batch creation failed');
      mockOpenAi.batches.create.mockRejectedValue(apiError);

      await expect(client.createBatch('file_abc123')).rejects.toThrow(
        'Batch creation failed',
      );
    });
  });

  // =========================================================================
  // getBatchStatus
  // =========================================================================

  describe('getBatchStatus', () => {
    it('should return status result with all fields when batch is in_progress', async () => {
      mockOpenAi.batches.retrieve.mockResolvedValue({
        status: 'in_progress',
        output_file_id: null,
        error_file_id: null,
        request_counts: { total: 100, completed: 50, failed: 2 },
      });

      const result = await client.getBatchStatus('batch_123');

      expect(result.status).toBe('in_progress');
      expect(result.outputFileId).toBeUndefined();
      expect(result.errorFileId).toBeUndefined();
      expect(result.progress).toEqual({ total: 100, completed: 50, failed: 2 });
    });

    it('should return outputFileId when batch is completed', async () => {
      mockOpenAi.batches.retrieve.mockResolvedValue({
        status: 'completed',
        output_file_id: 'file_output_123',
        error_file_id: null,
        request_counts: { total: 100, completed: 100, failed: 0 },
      });

      const result = await client.getBatchStatus('batch_123');

      expect(result.status).toBe('completed');
      expect(result.outputFileId).toBe('file_output_123');
    });

    it('should return errorFileId when batch has errors', async () => {
      mockOpenAi.batches.retrieve.mockResolvedValue({
        status: 'failed',
        output_file_id: null,
        error_file_id: 'file_error_456',
        request_counts: { total: 10, completed: 0, failed: 10 },
      });

      const result = await client.getBatchStatus('batch_123');

      expect(result.errorFileId).toBe('file_error_456');
    });

    it('should default progress counts to 0 when request_counts is null', async () => {
      mockOpenAi.batches.retrieve.mockResolvedValue({
        status: 'validating',
        output_file_id: null,
        error_file_id: null,
        request_counts: null,
      });

      const result = await client.getBatchStatus('batch_123');

      expect(result.progress).toEqual({ total: 0, completed: 0, failed: 0 });
    });

    it('should throw ConfigMissingException when client is not initialized', async () => {
      (client as any).openai = null;

      await expect(client.getBatchStatus('batch_123')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });

    it('should propagate error when batches.retrieve throws', async () => {
      mockOpenAi.batches.retrieve.mockRejectedValue(
        new Error('Batch not found'),
      );

      await expect(client.getBatchStatus('batch_123')).rejects.toThrow(
        'Batch not found',
      );
    });
  });

  // =========================================================================
  // downloadResults
  // =========================================================================

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

    it('should throw ConfigMissingException when client is not initialized', async () => {
      // Arrange
      (client as any).openai = null;

      // Act & Assert
      await expect(client.downloadResults('file-123')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });
  });

  // =========================================================================
  // downloadErrors
  // =========================================================================

  describe('downloadErrors', () => {
    it('should return parsed errors from error file', async () => {
      const errorLine = JSON.stringify({
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: null,
        error: { code: 'token_limit', message: 'Token limit exceeded' },
      });

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(errorLine),
      });

      const result = await client.downloadErrors('file-error-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        customId: 'pref_1_100',
        code: 'token_limit',
        message: 'Token limit exceeded',
      });
    });

    it('should default code to "unknown" when error is null', async () => {
      const errorLine = JSON.stringify({
        id: 'batch-1',
        custom_id: 'pref_1_100',
        response: null,
        error: null,
      });

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(errorLine),
      });

      const result = await client.downloadErrors('file-error-123');

      expect(result[0].code).toBe('unknown');
      expect(result[0].message).toBe('Unknown error');
    });

    it('should skip invalid JSON lines and continue', async () => {
      const content = `invalid json line\n${JSON.stringify({
        id: 'batch-2',
        custom_id: 'pref_2_200',
        response: null,
        error: { code: 'bad_request', message: 'Bad request' },
      })}`;

      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(content),
      });

      const result = await client.downloadErrors('file-error-123');

      expect(result).toHaveLength(1);
      expect(result[0].customId).toBe('pref_2_200');
    });

    it('should return empty array when error file is empty', async () => {
      mockOpenAi.files.content.mockResolvedValue({
        text: jest.fn().mockResolvedValue(''),
      });

      const result = await client.downloadErrors('file-error-123');

      expect(result).toEqual([]);
    });

    it('should throw ConfigMissingException when client is not initialized', async () => {
      (client as any).openai = null;

      await expect(client.downloadErrors('file-error-123')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });
  });

  // =========================================================================
  // cancelBatch
  // =========================================================================

  describe('cancelBatch', () => {
    it('should call batches.cancel with the provided batch ID', async () => {
      mockOpenAi.batches.cancel.mockResolvedValue(undefined);

      await client.cancelBatch('batch_to_cancel');

      expect(mockOpenAi.batches.cancel).toHaveBeenCalledWith('batch_to_cancel');
    });

    it('should throw ConfigMissingException when client is not initialized', async () => {
      (client as any).openai = null;

      await expect(client.cancelBatch('batch_to_cancel')).rejects.toThrow(
        '필수 환경변수가 설정되지 않았습니다: OPENAI_API_KEY',
      );
    });

    it('should propagate error when batches.cancel throws', async () => {
      mockOpenAi.batches.cancel.mockRejectedValue(
        new Error('Batch already completed'),
      );

      await expect(client.cancelBatch('batch_to_cancel')).rejects.toThrow(
        'Batch already completed',
      );
    });
  });

  // =========================================================================
  // ensureClient
  // =========================================================================

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

  // =========================================================================
  // isReady
  // =========================================================================

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

  // =========================================================================
  // onModuleInit
  // =========================================================================

  describe('onModuleInit', () => {
    it('should initialize the openai client with the API key from config', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue('test-api-key'),
        getOrThrow: jest.fn().mockReturnValue('my-test-api-key'),
      };

      const freshModule: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAiBatchClient,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const freshClient = freshModule.get<OpenAiBatchClient>(OpenAiBatchClient);
      // Simulate module initialization
      freshClient.onModuleInit();

      expect(freshClient.isReady()).toBe(true);
    });
  });
});
