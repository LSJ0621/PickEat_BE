import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PreferenceUpdateAiService } from './preference-update-ai.service';
import { PrometheusService } from '@/prometheus/prometheus.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import { UserPreferencesFactory } from '../../test/factories/entity.factory';
import {
  createMockConfigService,
  createMockPrometheusService,
} from '../../test/mocks/external-clients.mock';

describe('PreferenceUpdateAiService', () => {
  let service: PreferenceUpdateAiService;
  let mockPrometheusService: jest.Mocked<
    ReturnType<typeof createMockPrometheusService>
  >;

  const createMockOpenAI = () => {
    return {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as any;
  };

  beforeEach(async () => {
    mockPrometheusService = createMockPrometheusService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceUpdateAiService,
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            OPENAI_API_KEY: 'test-openai-api-key',
            OPENAI_MODEL: 'gpt-4',
          }),
        },
        {
          provide: PrometheusService,
          useValue: mockPrometheusService,
        },
      ],
    }).compile();

    service = module.get<PreferenceUpdateAiService>(PreferenceUpdateAiService);
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      // Act
      service.onModuleInit();

      // Assert
      expect(service['openai']).toBeDefined();
    });

    it('should not initialize OpenAI client when API key is missing', async () => {
      // Arrange
      const moduleWithoutKey = await Test.createTestingModule({
        providers: [
          PreferenceUpdateAiService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({}),
          },
          {
            provide: PrometheusService,
            useValue: mockPrometheusService,
          },
        ],
      }).compile();

      const serviceWithoutKey = moduleWithoutKey.get<PreferenceUpdateAiService>(
        PreferenceUpdateAiService,
      );

      // Act
      serviceWithoutKey.onModuleInit();

      // Assert
      expect(serviceWithoutKey['openai']).toBeNull();
    });

    it('should use OPENAI_PREFERENCE_MODEL when configured', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          PreferenceUpdateAiService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({
              OPENAI_API_KEY: 'test-key',
              OPENAI_PREFERENCE_MODEL: 'gpt-4-turbo',
              OPENAI_MODEL: 'gpt-3.5-turbo',
            }),
          },
          {
            provide: PrometheusService,
            useValue: mockPrometheusService,
          },
        ],
      }).compile();

      const customService = module.get<PreferenceUpdateAiService>(
        PreferenceUpdateAiService,
      );

      // Assert
      expect(customService['model']).toBe('gpt-4-turbo');
    });

    it('should fallback to OPENAI_MODEL when OPENAI_PREFERENCE_MODEL is not configured', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          PreferenceUpdateAiService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({
              OPENAI_API_KEY: 'test-key',
              OPENAI_MODEL: 'gpt-3.5-turbo',
            }),
          },
          {
            provide: PrometheusService,
            useValue: mockPrometheusService,
          },
        ],
      }).compile();

      const customService = module.get<PreferenceUpdateAiService>(
        PreferenceUpdateAiService,
      );

      // Assert
      expect(customService['model']).toBe('gpt-3.5-turbo');
    });
  });

  describe('generatePreferenceAnalysis', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should generate preference analysis successfully', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: ['한식', '중식'],
        dislikes: ['양식'],
      });
      const slotMenus = {
        breakfast: ['김치찌개', '된장찌개'],
        lunch: ['짬뽕', '짜장면'],
        dinner: ['불고기', '갈비찜'],
        etc: ['떡볶이'],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                analysis:
                  '한식과 중식을 주로 선호하시며, 양식은 피하시는 경향이 있습니다.',
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe(
        '한식과 중식을 주로 선호하시며, 양식은 피하시는 경향이 있습니다.',
      );
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
          response_format: expect.objectContaining({
            type: 'json_schema',
          }),
        }),
      );
    });

    it('should throw ExternalApiException when OpenAI is not initialized', async () => {
      // Arrange
      service['openai'] = null;
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow('OpenAI API key가 없습니다');
    });

    it('should throw ExternalApiException when response content is empty', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [{ message: { content: null } }],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when JSON parsing fails', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [{ message: { content: 'invalid json {' } }],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when analysis field is missing', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ wrongField: 'value' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when analysis is not a string', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: 123 }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when analysis is empty string', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '   ' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should record Prometheus metrics on success', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      await service.generatePreferenceAnalysis(current, slotMenus);

      // Assert
      expect(mockPrometheusService.recordAiTokensOnly).toHaveBeenCalledWith(
        'preference',
        150,
      );
      expect(mockPrometheusService.recordAiDuration).toHaveBeenCalledWith(
        'preference',
        expect.any(Number),
      );
      expect(mockPrometheusService.recordExternalApi).toHaveBeenCalledWith(
        'openai',
        '2xx',
        expect.any(Number),
      );
    });

    it('should record Prometheus metrics on failure', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('API error'),
      );
      service['openai'] = mockOpenAI;

      // Act
      try {
        await service.generatePreferenceAnalysis(current, slotMenus);
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(mockPrometheusService.recordAiDuration).toHaveBeenCalledWith(
        'preference',
        expect.any(Number),
      );
      expect(mockPrometheusService.recordExternalApi).toHaveBeenCalledWith(
        'openai',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should throw ExternalApiException on OpenAI API error', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('Rate limit exceeded'),
      );
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow('취향 분석 생성에 실패했습니다');
    });

    it('should trim whitespace from analysis result', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '  분석 결과입니다.  ' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('분석 결과입니다.');
    });

    it('should handle current preferences with existing analysis', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: ['양식'],
      });
      current.analysis = '기존 분석 결과';

      const slotMenus = {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '새로운 분석 결과' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('새로운 분석 결과');
    });

    it('should handle empty slot menus', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '데이터가 부족합니다.' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('데이터가 부족합니다.');
    });

    it('should handle null likes and dislikes (use empty arrays)', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: null as any,
        dislikes: null as any,
      });
      const slotMenus = {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '선호도 없음' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('선호도 없음');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle undefined likes and dislikes (use empty arrays)', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: undefined,
        dislikes: undefined,
      });
      const slotMenus = {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '선호도 미설정' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('선호도 미설정');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle null likes with defined dislikes', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: null as any,
        dislikes: ['양식', '일식'],
      });
      const slotMenus = {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '좋아하는 음식 없음' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('좋아하는 음식 없음');
    });

    it('should handle defined likes with null dislikes', async () => {
      // Arrange
      const current = UserPreferencesFactory.create({
        likes: ['한식', '중식'],
        dislikes: null as any,
      });
      const slotMenus = {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '싫어하는 음식 없음' }),
            },
          },
        ],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('싫어하는 음식 없음');
    });

    it('should handle usage with input_tokens instead of prompt_tokens', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
        usage: {
          input_tokens: 150,
          output_tokens: 60,
          total_tokens: 210,
        },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      await service.generatePreferenceAnalysis(current, slotMenus);

      // Assert
      expect(mockPrometheusService.recordAiTokensOnly).toHaveBeenCalledWith(
        'preference',
        210,
      );
    });

    it('should handle usage with only total_tokens', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
        usage: {
          total_tokens: 250,
        },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      await service.generatePreferenceAnalysis(current, slotMenus);

      // Assert
      expect(mockPrometheusService.recordAiTokensOnly).toHaveBeenCalledWith(
        'preference',
        250,
      );
    });

    it('should handle usage without any token fields (defaults to 0)', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
        usage: {},
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      await service.generatePreferenceAnalysis(current, slotMenus);

      // Assert
      expect(mockPrometheusService.recordAiTokensOnly).toHaveBeenCalledWith(
        'preference',
        0,
      );
    });

    it('should handle null choices in response', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [],
        usage: { total_tokens: 100 },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle non-finite total tokens gracefully', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
        usage: {
          prompt_tokens: NaN,
          completion_tokens: 50,
          total_tokens: NaN,
        },
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      await service.generatePreferenceAnalysis(current, slotMenus);

      // Assert
      expect(mockPrometheusService.recordAiTokensOnly).not.toHaveBeenCalled();
    });

    it('should handle missing usage field in response', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ analysis: '분석 결과' }),
            },
          },
        ],
      };

      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      service['openai'] = mockOpenAI;

      // Act
      const result = await service.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

      // Assert
      expect(result.analysis).toBe('분석 결과');
      expect(mockPrometheusService.recordAiTokensOnly).not.toHaveBeenCalled();
    });

    it('should handle non-Error thrown objects in catch block', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const nonErrorObject = { message: 'Not an Error instance' };
      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockRejectedValue(nonErrorObject);
      service['openai'] = mockOpenAI;

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Preference LLM 실패]'),
      );
    });

    it('should throw ExternalApiException with non-Error cause', async () => {
      // Arrange
      const current = UserPreferencesFactory.create();
      const slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      const nonError = 'string error';
      const mockOpenAI = createMockOpenAI();
      mockOpenAI.chat.completions.create.mockRejectedValue(nonError);
      service['openai'] = mockOpenAI;

      // Act & Assert
      await expect(
        service.generatePreferenceAnalysis(current, slotMenus),
      ).rejects.toThrow(ExternalApiException);
    });
  });

  describe('validateSchema', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should throw OpenAIResponseException when data is null', () => {
      // Act & Assert
      expect(() => service['validateSchema'](null as any)).toThrow(
        OpenAIResponseException,
      );
      expect(() => service['validateSchema'](null as any)).toThrow(
        '응답 형식이 올바르지 않습니다',
      );
    });

    it('should throw OpenAIResponseException when data is undefined', () => {
      // Act & Assert
      expect(() => service['validateSchema'](undefined as any)).toThrow(
        OpenAIResponseException,
      );
      expect(() => service['validateSchema'](undefined as any)).toThrow(
        '응답 형식이 올바르지 않습니다',
      );
    });

    it('should validate successfully when data is valid', () => {
      // Arrange
      const validData = { analysis: '유효한 분석 결과' };

      // Act & Assert
      expect(() => service['validateSchema'](validData)).not.toThrow();
    });
  });
});
