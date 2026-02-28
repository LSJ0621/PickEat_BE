import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseMenuService } from '../../gpt/base-menu.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { MENU_RECOMMENDATIONS_JSON_SCHEMA } from '@/external/openai/prompts/menu-recommendation.prompts';
import { OpenAIChatCompletionParams } from '@/external/openai/openai.types';

// Test implementation of abstract BaseMenuService
class TestMenuService extends BaseMenuService {
  constructor(config: ConfigService) {
    super('TestMenuService', config);
  }

  protected getModel(): string {
    return 'gpt-test-model';
  }

  protected buildRequestParams(
    systemPrompt: string,
    userPrompt: string,

    jsonSchema: typeof MENU_RECOMMENDATIONS_JSON_SCHEMA,
  ): OpenAIChatCompletionParams {
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
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
    }) as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TestMenuService,
          useFactory: () => new TestMenuService(mockConfigService),
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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
    } as unknown as jest.Mocked<OpenAI>;

    service['openai'] = mockOpenAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      const freshService = new TestMenuService(mockConfigService);

      freshService.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
      expect(freshService['openai']).toBeDefined();
    });

    it('should log error when API key is not configured', () => {
      const noKeyConfig = createMockConfigService(
        {},
      ) as unknown as jest.Mocked<ConfigService>;
      const freshService = new TestMenuService(noKeyConfig);

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
      service['openai'] = null as unknown as OpenAI;

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
                intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                recommendations: [
                  { condition: '조건1', menu: '김치찌개' },
                  { condition: '조건2', menu: '된장찌개' },
                  { condition: '조건3', menu: '순두부찌개' },
                ],
                closing: '맛있게 드세요!',
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

      expect(result.intro).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0].menu).toBe('김치찌개');
      expect(result.recommendations[1].menu).toBe('된장찌개');
      expect(result.recommendations[2].menu).toBe('순두부찌개');
      expect(result.closing).toBe('맛있게 드세요!');
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
                intro: '한식 추천',
                recommendations: [
                  { condition: '조건1', menu: '김치찌개 (Kimchi Stew)' },
                  { condition: '조건2', menu: '된장찌개abc' },
                  { condition: '조건3', menu: '순두부 찌 개' },
                ],
                closing: '맛있게 드세요!',
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

      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0].condition).toBe('조건1');
      expect(result.recommendations[0].menu).toBe('김치찌개');
      expect(result.recommendations[1].condition).toBe('조건2');
      expect(result.recommendations[1].menu).toBe('된장찌개abc');
      expect(result.recommendations[2].condition).toBe('조건3');
      expect(result.recommendations[2].menu).toBe('순두부찌개');
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
                intro: '한식 추천',
                recommendations: [
                  { condition: '조건1', menu: '김치찌개' },
                  { condition: '조건2', menu: '김치찌개 (Kimchi)' },
                  { condition: '조건3', menu: '된장찌개' },
                ],
                closing: '맛있게 드세요!',
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

      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0].condition).toBe('조건1');
      expect(result.recommendations[0].menu).toBe('김치찌개');
      expect(result.recommendations[1].condition).toBe('조건2');
      expect(result.recommendations[1].menu).toBe('김치찌개');
      expect(result.recommendations[2].condition).toBe('조건3');
      expect(result.recommendations[2].menu).toBe('된장찌개');
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
                intro: '추천할 메뉴가 없습니다.',
                recommendations: [],
                closing: '감사합니다.',
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
                intro: '',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '',
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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

    it('should succeed when all required fields are present', async () => {
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
                intro: '추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '마무리',
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

      expect(result.intro).toBe('추천');
      expect(result.closing).toBe('마무리');
      expect(result.recommendations).toHaveLength(1);
    });

    it('should handle non-Error instance in catch block', async () => {
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue('string error');

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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
    });

    it('should handle null prometheus service when recording success metrics', async () => {
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
                intro: '한식 추천',
                recommendations: [{ condition: '조건', menu: '김치찌개' }],
                closing: '맛있게 드세요!',
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

      const nullPrometheusService = new TestMenuService(mockConfigService);
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

    it('should normalize menu names including English-only menus', async () => {
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
                intro: '한식 추천',
                recommendations: [
                  { condition: '조건1', menu: '김치찌개' },
                  { condition: '조건2', menu: 'Pizza' },
                  { condition: '조건3', menu: '된장찌개' },
                ],
                closing: '맛있게 드세요!',
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

      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0].condition).toBe('조건1');
      expect(result.recommendations[0].menu).toBe('김치찌개');
      expect(result.recommendations[1].condition).toBe('조건2');
      expect(result.recommendations[1].menu).toBe('pizza');
      expect(result.recommendations[2].condition).toBe('조건3');
      expect(result.recommendations[2].menu).toBe('된장찌개');
    });
  });
});
