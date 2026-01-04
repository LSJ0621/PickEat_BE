import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';
import { BaseMenuService } from './base-menu.service';
import { PrometheusService } from '@/prometheus/prometheus.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import {
  createMockConfigService,
  createMockPrometheusService,
} from '../../../test/mocks/external-clients.mock';

// Test implementation of abstract BaseMenuService
class TestMenuService extends BaseMenuService {
  constructor(config: ConfigService, prometheusService: PrometheusService) {
    super('TestMenuService', config, prometheusService);
  }

  protected getModel(): string {
    return 'gpt-test-model';
  }

  protected buildRequestParams(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: any,
  ): any {
    return {
      model: this.getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'menu_recommendations',
          schema: jsonSchema,
          strict: true,
        },
      },
    };
  }
}

describe('BaseMenuService', () => {
  let service: TestMenuService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPrometheusService: jest.Mocked<PrometheusService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
    }) as any;

    mockPrometheusService = createMockPrometheusService() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TestMenuService,
          useFactory: () =>
            new TestMenuService(mockConfigService, mockPrometheusService),
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrometheusService,
          useValue: mockPrometheusService,
        },
      ],
    }).compile();

    service = module.get<TestMenuService>(TestMenuService);

    // Mock OpenAI instance
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as any;

    service['openai'] = mockOpenAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      const freshService = new TestMenuService(
        mockConfigService,
        mockPrometheusService,
      );

      freshService.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
      expect(freshService['openai']).toBeDefined();
    });

    it('should log error when API key is not configured', () => {
      const noKeyConfig = createMockConfigService({}) as any;
      const freshService = new TestMenuService(
        noKeyConfig,
        mockPrometheusService,
      );

      const loggerSpy = jest.spyOn(freshService['logger'], 'error');

      freshService.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        'OPENAI_API_KEY is not configured',
      );
      expect(freshService['openai']).toBeUndefined();
    });
  });

  describe('generateMenuRecommendations', () => {
    const prompt = '오늘 점심 추천해줘';
    const likes = ['한식', '중식'];
    const dislikes = ['일식'];
    const analysis = '사용자는 매운 음식을 좋아합니다';

    it('should throw ExternalApiException when OpenAI is not initialized', async () => {
      service['openai'] = null as any;

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should successfully generate menu recommendations', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
                reason: '한식을 좋아하시는 것 같아 추천드립니다.',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

      expect(result).toEqual({
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '한식을 좋아하시는 것 같아 추천드립니다.',
      });

      expect(mockPrometheusService.recordAiSuccess).toHaveBeenCalled();
      expect(mockPrometheusService.recordAiDuration).toHaveBeenCalled();
      expect(mockPrometheusService.recordExternalApi).toHaveBeenCalled();
    });

    it('should normalize menu names by removing English and parentheses', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  '김치찌개 (Kimchi Stew)',
                  '된장찌개abc',
                  '순두부 찌 개',
                ],
                reason: '한식 추천',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result.recommendations).toEqual([
        '김치찌개',
        '된장찌개',
        '순두부찌개',
      ]);
    });

    it('should remove duplicate menu names after normalization', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', '김치찌개 (Kimchi)', '된장찌개'],
                reason: '한식 추천',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result.recommendations).toEqual(['김치찌개', '된장찌개']);
    });

    it('should throw ExternalApiException when no choices returned', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when content is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
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
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when recommendations array is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
                reason: '추천할 메뉴가 없습니다.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when reason is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should record failure metrics when OpenAI call fails', async () => {
      const error = new Error('OpenAI API error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);

      expect(mockPrometheusService.recordAiError).toHaveBeenCalled();
      expect(mockPrometheusService.recordAiDuration).toHaveBeenCalled();
      expect(mockPrometheusService.recordExternalApi).toHaveBeenCalled();
    });

    it('should handle validation context in prompt generation', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const validationContext = {
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: ['할랄'],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식', '중식'],
      };

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
      );

      expect(result).toBeDefined();
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle usage with input_tokens and output_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
      expect(mockPrometheusService.recordAiSuccess).toHaveBeenCalled();
    });

    it('should handle usage with only total_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          total_tokens: 150,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
      expect(mockPrometheusService.recordAiSuccess).toHaveBeenCalled();
    });

    it('should handle missing usage object', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
      expect(mockPrometheusService.recordAiSuccess).not.toHaveBeenCalled();
    });

    it('should handle usage with empty token fields (fallback to 0)', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
      expect(mockPrometheusService.recordAiSuccess).toHaveBeenCalled();
    });

    it('should handle parsed response with undefined recommendations', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                reason: '한식 추천',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle parsed response with undefined reason', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle non-Error instance in catch block', async () => {
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue('string error');

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);

      expect(mockPrometheusService.recordAiError).toHaveBeenCalled();
    });

    it('should handle non-finite total tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: Infinity,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
      expect(mockPrometheusService.recordAiSuccess).not.toHaveBeenCalled();
    });

    it('should handle null prometheusService', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개'],
                reason: '한식 추천',
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

      const nullPrometheusService = new TestMenuService(
        mockConfigService,
        null as any,
      );
      nullPrometheusService['openai'] = mockOpenAI;
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await nullPrometheusService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toBeDefined();
    });

    it('should handle null prometheusService in error case', async () => {
      const nullPrometheusService = new TestMenuService(
        mockConfigService,
        null as any,
      );
      nullPrometheusService['openai'] = mockOpenAI;
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      await expect(
        nullPrometheusService.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        ),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should filter out menu names with non-Korean characters after normalization', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', 'Pizza123', '된장찌개', ''],
                reason: '한식 추천',
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

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result.recommendations).toEqual(['김치찌개', '된장찌개']);
    });
  });
});
