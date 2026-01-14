import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiUsageLogService } from '../services/api-usage-log.service';
import { ApiUsageLog } from '../entities/api-usage-log.entity';
import { API_PROVIDERS } from '../monitoring.constants';
import { createMockRepository } from '../../../../test/mocks/repository.mock';

describe('ApiUsageLogService', () => {
  let service: ApiUsageLogService;
  let mockRepository: ReturnType<typeof createMockRepository<ApiUsageLog>>;

  beforeEach(async () => {
    mockRepository = createMockRepository<ApiUsageLog>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiUsageLogService,
        {
          provide: getRepositoryToken(ApiUsageLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ApiUsageLogService>(ApiUsageLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create and save API usage log with all fields', async () => {
      // Arrange
      const logData = {
        provider: API_PROVIDERS.OPENAI,
        endpoint: '/chat/completions',
        success: true,
        statusCode: 200,
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        model: 'gpt-4o-mini',
        errorMessage: null,
      };
      const mockEntity = { id: 'test-id', ...logData } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.log(logData);

      // Assert
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: logData.provider,
        endpoint: logData.endpoint,
        success: logData.success,
        statusCode: logData.statusCode,
        responseTimeMs: logData.responseTimeMs,
        promptTokens: logData.promptTokens,
        completionTokens: logData.completionTokens,
        totalTokens: logData.totalTokens,
        model: logData.model,
        errorMessage: logData.errorMessage,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });

    it('should create and save API usage log with minimal fields', async () => {
      // Arrange
      const logData = {
        provider: API_PROVIDERS.GOOGLE_PLACES,
        endpoint: '/searchNearby',
        success: true,
        responseTimeMs: 500,
      };
      const mockEntity = {
        id: 'test-id',
        ...logData,
        statusCode: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: null,
      } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.log(logData);

      // Assert
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: logData.provider,
        endpoint: logData.endpoint,
        success: logData.success,
        statusCode: null,
        responseTimeMs: logData.responseTimeMs,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: null,
      });
      expect(result).toEqual(mockEntity);
    });

    it('should convert undefined values to null when creating log', async () => {
      // Arrange
      const logData = {
        provider: API_PROVIDERS.KAKAO_LOCAL,
        endpoint: '/v2/local/search/keyword.json',
        success: false,
        statusCode: undefined,
        responseTimeMs: 300,
        promptTokens: undefined,
        completionTokens: undefined,
        totalTokens: undefined,
        model: undefined,
        errorMessage: 'Network timeout',
      };
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      await service.log(logData);

      // Assert
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: logData.provider,
        endpoint: logData.endpoint,
        success: logData.success,
        statusCode: null,
        responseTimeMs: logData.responseTimeMs,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: logData.errorMessage,
      });
    });

    it('should log failed API call with error message', async () => {
      // Arrange
      const logData = {
        provider: API_PROVIDERS.GOOGLE_CSE,
        endpoint: '/customsearch/v1',
        success: false,
        statusCode: 429,
        responseTimeMs: 200,
        errorMessage: 'Rate limit exceeded',
      };
      const mockEntity = { id: 'test-id', ...logData } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.log(logData);

      // Assert
      expect(mockRepository.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });
  });

  describe('wrapApiCall', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should log successful API call and return result', async () => {
      // Arrange
      const mockResult = { data: 'test response' };
      const apiCall = jest.fn().mockResolvedValue(mockResult);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.GOOGLE_PLACES,
        '/searchNearby',
        apiCall,
      );

      // Simulate time passing
      jest.advanceTimersByTime(1200);
      const result = await resultPromise;

      // Assert
      expect(result).toEqual(mockResult);
      expect(apiCall).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.GOOGLE_PLACES,
        endpoint: '/searchNearby',
        success: true,
        statusCode: 200,
        responseTimeMs: 1200,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: null,
      });
    });

    it('should extract token info from OpenAI response', async () => {
      // Arrange
      const mockResult = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: 'gpt-4o-mini',
      };
      const apiCall = jest.fn().mockResolvedValue(mockResult);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.OPENAI,
        '/chat/completions',
        apiCall,
        {
          extractTokenInfo: (result: typeof mockResult) => ({
            promptTokens: result.usage.prompt_tokens,
            completionTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
            model: result.model,
          }),
        },
      );

      jest.advanceTimersByTime(2000);
      const result = await resultPromise;

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.OPENAI,
        endpoint: '/chat/completions',
        success: true,
        statusCode: 200,
        responseTimeMs: 2000,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        model: 'gpt-4o-mini',
        errorMessage: null,
      });
    });

    it('should log failed API call and rethrow error', async () => {
      // Arrange
      const mockError = new Error('API call failed');
      const apiCall = jest.fn().mockRejectedValue(mockError);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act & Assert
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.KAKAO_OAUTH,
        '/oauth/token',
        apiCall,
      );

      jest.advanceTimersByTime(500);

      await expect(resultPromise).rejects.toThrow('API call failed');
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.KAKAO_OAUTH,
        endpoint: '/oauth/token',
        success: false,
        statusCode: null,
        responseTimeMs: 500,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: 'API call failed',
      });
    });

    it('should log error with status code when available', async () => {
      // Arrange
      const mockError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      const apiCall = jest.fn().mockRejectedValue(mockError);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act & Assert
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.GOOGLE_CSE,
        '/customsearch/v1',
        apiCall,
      );

      jest.advanceTimersByTime(300);

      await expect(resultPromise).rejects.toEqual(mockError);
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.GOOGLE_CSE,
        endpoint: '/customsearch/v1',
        success: false,
        statusCode: 429,
        responseTimeMs: 300,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: 'Rate limit exceeded',
      });
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      const mockError = 'String error message';
      const apiCall = jest.fn().mockRejectedValue(mockError);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act & Assert
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.OPENAI,
        '/chat/completions',
        apiCall,
      );

      jest.advanceTimersByTime(100);

      await expect(resultPromise).rejects.toBe(mockError);
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.OPENAI,
        endpoint: '/chat/completions',
        success: false,
        statusCode: null,
        responseTimeMs: 100,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        errorMessage: 'String error message',
      });
    });

    it('should not throw error if logging fails', async () => {
      // Arrange
      const mockResult = { data: 'test' };
      const apiCall = jest.fn().mockResolvedValue(mockResult);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.GOOGLE_PLACES,
        '/searchNearby',
        apiCall,
      );

      jest.advanceTimersByTime(800);
      const result = await resultPromise;

      // Assert - API call should succeed even if logging fails
      expect(result).toEqual(mockResult);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should handle extractTokenInfo returning partial data', async () => {
      // Arrange
      const mockResult = {
        usage: {
          total_tokens: 100,
        },
      };
      const apiCall = jest.fn().mockResolvedValue(mockResult);
      const mockEntity = { id: 'test-id' } as ApiUsageLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Act
      const resultPromise = service.wrapApiCall(
        API_PROVIDERS.OPENAI,
        '/chat/completions',
        apiCall,
        {
          extractTokenInfo: (result: typeof mockResult) => ({
            totalTokens: result.usage.total_tokens,
          }),
        },
      );

      jest.advanceTimersByTime(1000);
      const result = await resultPromise;

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockRepository.create).toHaveBeenCalledWith({
        provider: API_PROVIDERS.OPENAI,
        endpoint: '/chat/completions',
        success: true,
        statusCode: 200,
        responseTimeMs: 1000,
        promptTokens: null,
        completionTokens: null,
        totalTokens: 100,
        model: null,
        errorMessage: null,
      });
    });
  });
});
