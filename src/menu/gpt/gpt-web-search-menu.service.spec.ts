import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { GptWebSearchMenuService } from './gpt-web-search-menu.service';
import { createMockConfigService } from '../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { WEB_SEARCH_CONFIG } from '@/external/openai/openai.constants';
import { ResponsesApiResponse } from '@/external/openai/openai.types';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      responses: {
        create: jest.fn(),
      },
    })),
  };
});

describe('GptWebSearchMenuService', () => {
  let service: GptWebSearchMenuService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockOpenAI: any;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key-12345',
    }) as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptWebSearchMenuService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<GptWebSearchMenuService>(GptWebSearchMenuService);
    mockOpenAI = (service as any).openai;

    // Spy on logger methods
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerLogSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create service instance with OpenAI client', () => {
      expect(service).toBeDefined();
      expect(service['openai']).toBeDefined();
    });

    it('should throw error when OPENAI_API_KEY is not configured', () => {
      const emptyConfig = createMockConfigService(
        {},
      ) as unknown as jest.Mocked<ConfigService>;

      expect(() => new GptWebSearchMenuService(emptyConfig)).toThrow(
        'Configuration key "OPENAI_API_KEY" does not exist',
      );
    });
  });

  describe('generateMenuRecommendations', () => {
    const prompt = '오늘 점심 뭐 먹지';
    const likes = ['한식', '중식'];
    const dislikes = ['생선'];
    const userAddress = '서울시 강남구';

    describe('successful recommendation with web search (user has address)', () => {
      it('should include web_search tool when userAddress is provided', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개', '비빔밥', '된장찌개'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          }),
          output: [
            { type: 'web_search_call', status: 'completed' },
            { type: 'message', content: 'recommendations' },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          'ko',
        );

        // Verify web_search tool was included
        expect(mockOpenAI.responses.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tools: [
              {
                type: 'web_search',
                search_context_size: WEB_SEARCH_CONFIG.CONTEXT_SIZE,
              },
            ],
          }),
        );

        expect(result.recommendations).toHaveLength(3);
        expect(result.recommendations).toEqual([
          '김치찌개',
          '비빔밥',
          '된장찌개',
        ]);
        expect(result.reason).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      });

      it('should log web search activation when address is provided', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('웹 검색 활성화'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`사용자 주소: ${userAddress}`),
        );
      });

      it('should log web search results when web search was performed', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [
            { type: 'web_search_call', status: 'completed' },
            { type: 'web_search_call', status: 'completed' },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('웹 검색 수행됨'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('검색 횟수: 2'),
        );
      });

      it('should log when GPT did not perform web search', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [{ type: 'message', content: 'recommendations' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('웹 검색 미수행'),
        );
      });
    });

    describe('successful recommendation without web search (no address)', () => {
      it('should NOT include web_search tool when userAddress is not provided', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개', '비빔밥'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          undefined,
          'ko',
        );

        // Verify web_search tool was NOT included
        expect(mockOpenAI.responses.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tools: [],
          }),
        );

        expect(result.recommendations).toHaveLength(2);
        expect(result.recommendations).toEqual(['김치찌개', '비빔밥']);
      });

      it('should log web search deactivation when address is not provided', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          undefined,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('웹 검색 비활성화'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('사용자 주소: 없음'),
        );
      });
    });

    describe('JSON parsing scenarios', () => {
      it('should parse valid JSON response', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개', '비빔밥', '된장찌개'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toEqual([
          '김치찌개',
          '비빔밥',
          '된장찌개',
        ]);
        expect(result.reason).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      });

      it('should extract JSON embedded in text response', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: `여기 추천 결과입니다: ${JSON.stringify({
            recommendations: ['김치찌개', '비빔밥'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          })} 감사합니다.`,
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toEqual(['김치찌개', '비빔밥']);
        expect(result.reason).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      });

      it('should handle menus and explanation field names', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            menus: ['김치찌개', '비빔밥'],
            explanation: '한식 추천입니다.',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toEqual(['김치찌개', '비빔밥']);
        expect(result.reason).toBe('한식 추천입니다.');
      });

      it('should fallback to text extraction when JSON parsing fails', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: `추천 메뉴:
1 김치찌개
2 비빔밥
3 된장찌개
이 메뉴들은 한식을 좋아하시는 분께 적합합니다.`,
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(result.recommendations).toContain('김치찌개');
        expect(result.recommendations).toContain('비빔밥');
        expect(result.recommendations).toContain('된장찌개');
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('JSON 파싱 실패'),
        );
      });

      it('should extract menus from bullet points', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: `추천 메뉴:
- 김치찌개
- 비빔밥
* 된장찌개`,
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeGreaterThan(0);
        // Check that each recommendation is present (allowing for variations in extraction)
        const hasKimchi = result.recommendations.some((r) =>
          r.includes('김치찌개'),
        );
        const hasBibimbap = result.recommendations.some((r) =>
          r.includes('비빔밥'),
        );
        const hasDoenjang = result.recommendations.some((r) =>
          r.includes('된장찌개'),
        );

        expect(hasKimchi).toBe(true);
        expect(hasBibimbap).toBe(true);
        expect(hasDoenjang).toBe(true);
      });

      it('should limit extracted menus to 5 items', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: `추천:
1 김치찌개
2 비빔밥
3 된장찌개
4 불고기
5 갈비탕
6 냉면
7 삼계탕`,
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeLessThanOrEqual(5);
      });

      it('should truncate reason to 200 characters in fallback extraction', async () => {
        const longText = 'A'.repeat(300);
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: `1 김치찌개\n${longText}`,
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.reason.length).toBe(200);
      });
    });

    describe('logging verification', () => {
      it('should log request start with all parameters', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('메뉴 추천 시작'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`사용자 주소: ${userAddress}`),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('언어: ko'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('선호: 한식, 중식'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('비선호: 생선'),
        );
      });

      it('should log API response success with duration', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('API 응답 성공'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/소요 시간: \d+ms/),
        );
      });

      it('should log recommendation results', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개', '비빔밥'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('추천 결과'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('메뉴 수: 2'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('추천 메뉴: 김치찌개, 비빔밥'),
        );
      });

      it('should log token usage', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('토큰 사용량'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('입력: 100'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('출력: 50'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('총계: 150'),
        );
      });

      it('should handle missing token usage gracefully', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        // Should not throw error and should still complete successfully
        expect(loggerLogSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('토큰 사용량'),
        );
      });
    });

    describe('error handling', () => {
      it('should throw ExternalApiException when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.responses.create.mockRejectedValue(apiError);

        await expect(
          service.generateMenuRecommendations(prompt, likes, dislikes),
        ).rejects.toThrow(ExternalApiException);
      });

      it('should log error details when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.responses.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('API 호출 실패'),
        );
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('API connection failed'),
        );
      });

      it('should log fallback message when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.responses.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('폴백'),
        );
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Chat Completions API'),
        );
      });

      it('should include error duration in logs', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.responses.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/소요 시간: \d+ms/),
        );
      });

      it('should handle non-Error objects in catch block', async () => {
        mockOpenAI.responses.create.mockRejectedValue('string error');

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch (error) {
          expect(error).toBeInstanceOf(ExternalApiException);
        }

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('string error'),
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty likes and dislikes arrays', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          [],
          [],
        );

        expect(result.recommendations).toEqual(['김치찌개']);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('선호: 없음'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('비선호: 없음'),
        );
      });

      it('should handle undefined analysis parameter', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await expect(
          service.generateMenuRecommendations(
            prompt,
            likes,
            dislikes,
            undefined,
          ),
        ).resolves.toBeDefined();
      });

      it('should handle undefined validationContext parameter', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await expect(
          service.generateMenuRecommendations(
            prompt,
            likes,
            dislikes,
            undefined,
            undefined,
          ),
        ).resolves.toBeDefined();
      });

      it('should default to Korean language when language is not specified', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('언어: ko'),
        );
      });

      it('should support English language', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['Kimchi Stew'],
            reason: 'Recommended based on your preferences',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          'What should I eat for lunch?',
          ['Korean'],
          ['Fish'],
          undefined,
          undefined,
          'Seoul, Gangnam',
          'en',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('언어: en'),
        );
      });

      it('should handle empty recommendations array', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: [],
            reason: '추천할 메뉴가 없습니다.',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toEqual([]);
        expect(result.reason).toBe('추천할 메뉴가 없습니다.');
      });

      it('should handle very long prompt text', async () => {
        const longPrompt = 'A'.repeat(1000);
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 500,
            output_tokens: 50,
            total_tokens: 550,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          longPrompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toEqual(['김치찌개']);
        // Should log truncated version (first 100 chars + ...)
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/사용자 요청: A{100}\.\.\./),
        );
      });

      it('should use correct model from WEB_SEARCH_CONFIG', async () => {
        const mockResponse: ResponsesApiResponse = {
          id: 'resp-123',
          output_text: JSON.stringify({
            recommendations: ['김치찌개'],
            reason: '추천 이유',
          }),
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.responses.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(mockOpenAI.responses.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: WEB_SEARCH_CONFIG.MODEL,
          }),
        );
      });
    });
  });
});
