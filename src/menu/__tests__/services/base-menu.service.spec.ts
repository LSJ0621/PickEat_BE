import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import { BaseMenuService } from '../../services/base-menu.service';
import { OpenAIChatCompletionParams } from '@/external/openai/openai.types';

// Mock retry to avoid delays
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

// Concrete implementation for testing
class TestMenuService extends BaseMenuService {
  constructor(config: ConfigService) {
    super('TestMenuService', config);
  }

  protected getModel(): string {
    return 'test-model';
  }

  protected buildRequestParams(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: unknown,
  ): OpenAIChatCompletionParams {
    return {
      model: this.getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    } as OpenAIChatCompletionParams;
  }
}

describe('BaseMenuService', () => {
  let service: TestMenuService;
  let mockConfig: ConfigService;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new TestMenuService(mockConfig);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('OPENAI_API_KEY가 없으면 openai를 초기화하지 않는다', () => {
      const noKeyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const svc = new TestMenuService(noKeyConfig);
      svc.onModuleInit();

      // openai is undefined, should throw on generate
      expect(
        svc.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });
  });

  describe('generateMenuRecommendations', () => {
    it('openai가 초기화되지 않으면 ExternalApiException을 throw한다', async () => {
      const noKeyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const svc = new TestMenuService(noKeyConfig);
      svc.onModuleInit();

      await expect(
        svc.generateMenuRecommendations('오늘 점심 뭐 먹지?', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('GPT 응답이 정상이면 파싱된 추천 결과를 반환한다', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: '추천 메뉴입니다.',
                recommendations: [
                  { condition: '매운 것이 당길 때', menu: '김치찌개' },
                ],
                closing: '맛있게 드세요.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      // Mock the openai instance
      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      const result = await service.generateMenuRecommendations(
        '오늘 점심 뭐 먹지?',
        ['한식'],
        ['양식'],
      );

      expect(result.intro).toBe('추천 메뉴입니다.');
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].menu).toBe('김치찌개');
      expect(result.closing).toBe('맛있게 드세요.');
    });

    it('GPT 응답에 choices가 없으면 ExternalApiException을 throw한다', async () => {
      const mockResponse = {
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };

      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      await expect(
        service.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('GPT 응답 content가 비어있으면 ExternalApiException을 throw한다', async () => {
      const mockResponse = {
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };

      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      await expect(
        service.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('추천 결과가 비어있으면 ExternalApiException을 throw한다', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: '추천',
                recommendations: [],
                closing: '끝',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      await expect(
        service.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('intro가 없으면 ExternalApiException을 throw한다', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: '',
                recommendations: [{ condition: 'test', menu: '김치찌개' }],
                closing: '끝',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      await expect(
        service.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('closing이 없으면 ExternalApiException을 throw한다', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: '추천',
                recommendations: [{ condition: 'test', menu: '김치찌개' }],
                closing: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
      };

      await expect(
        service.generateMenuRecommendations('test', [], []),
      ).rejects.toThrow(ExternalApiException);
    });

    it('validationContext가 있으면 검증용 프롬프트를 사용한다', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: '검증 추천',
                recommendations: [{ condition: 'test', menu: '비빔밥' }],
                closing: '검증 완료.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      const createMock = jest.fn().mockResolvedValue(mockResponse);
      (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
        chat: { completions: { create: createMock } },
      };

      const result = await service.generateMenuRecommendations(
        'test',
        [],
        [],
        undefined,
        {
          intent: 'preference',
          constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
          suggestedCategories: ['한식'],
        },
      );

      expect(result.recommendations[0].menu).toBe('비빔밥');
    });
  });
});
