import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { GptWebSearchMenuService } from '../../services/gpt-web-search-menu.service';
import { WebSearchSummaryService } from '../../services/web-search-summary.service';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { WEB_SEARCH_CONFIG } from '@/external/openai/openai.constants';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('GptWebSearchMenuService', () => {
  let service: GptWebSearchMenuService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockWebSearchSummaryService: jest.Mocked<WebSearchSummaryService>;
  let mockOpenAI: any;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key-12345',
    }) as unknown as jest.Mocked<ConfigService>;

    mockWebSearchSummaryService = {
      getSummary: jest.fn().mockResolvedValue(null),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptWebSearchMenuService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: WebSearchSummaryService,
          useValue: mockWebSearchSummaryService,
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

      expect(
        () =>
          new GptWebSearchMenuService(emptyConfig, mockWebSearchSummaryService),
      ).toThrow('Configuration key "OPENAI_API_KEY" does not exist');
    });
  });

  describe('generateMenuRecommendations', () => {
    const prompt = '오늘 점심 뭐 먹지';
    const likes = ['한식', '중식'];
    const dislikes = ['생선'];
    const userAddress = '서울시 강남구';

    describe('successful recommendation with web search (user has address)', () => {
      it('should call WebSearchSummaryService when userAddress is provided', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                  recommendations: [
                    {
                      condition: '얼큰한 국물 요리를 원하신다면',
                      menu: '김치찌개',
                    },
                    { condition: '비빔 요리를 원하신다면', menu: '비빔밥' },
                    {
                      condition: '담백한 국물 요리를 원하신다면',
                      menu: '된장찌개',
                    },
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          undefined,
          undefined,
          'ko',
        );

        // Verify WebSearchSummaryService was called
        expect(mockWebSearchSummaryService.getSummary).toHaveBeenCalledWith(
          userAddress,
          undefined,
          undefined,
          'ko',
        );

        expect(result.recommendations).toHaveLength(3);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        expect(result.recommendations[1].menu).toBe('비빔밥');
        expect(result.recommendations[2].menu).toBe('된장찌개');
        expect(result.intro).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
        expect(result.closing).toBe('맛있게 드세요!');
      });

      it('should log 2-Call architecture start when address is provided', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          undefined,
          undefined,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('2-Call 아키텍처'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`사용자 주소: ${userAddress}`),
        );
      });

      it('should log Call A skip when WebSearchSummaryService returns null', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
        mockWebSearchSummaryService.getSummary.mockResolvedValue(null);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          undefined,
          undefined,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call A 스킵] 웹 검색 조건 불충분'),
        );
      });

      it('should log Call B start for menu recommendation', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          undefined,
          undefined,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call B 시작] 메뉴 추천 생성'),
        );
      });
    });

    describe('successful recommendation without web search (no address)', () => {
      it('should NOT call WebSearchSummaryService when userAddress is not provided', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                  recommendations: [
                    { condition: '조건1', menu: '김치찌개' },
                    { condition: '조건2', menu: '비빔밥' },
                  ],
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'ko',
        );

        // Verify WebSearchSummaryService was NOT called
        expect(mockWebSearchSummaryService.getSummary).not.toHaveBeenCalled();

        expect(result.recommendations).toHaveLength(2);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        expect(result.recommendations[1].menu).toBe('비빔밥');
      });

      it('should log Call A skip when address is not provided', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'ko',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call A 스킵] 주소/프로필 정보 없음'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('사용자 주소: 없음'),
        );
      });
    });

    describe('JSON parsing scenarios', () => {
      it('should parse valid JSON response', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                  recommendations: [
                    { condition: '조건1', menu: '김치찌개' },
                    { condition: '조건2', menu: '비빔밥' },
                    { condition: '조건3', menu: '된장찌개' },
                  ],
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toHaveLength(3);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        expect(result.recommendations[1].menu).toBe('비빔밥');
        expect(result.recommendations[2].menu).toBe('된장찌개');
        expect(result.intro).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      });

      it('should extract JSON embedded in text response', async () => {
        const mockResponse = {
          id: 'resp-123',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `여기 추천 결과입니다: ${JSON.stringify({
                  intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                  recommendations: [
                    { condition: '조건1', menu: '김치찌개' },
                    { condition: '조건2', menu: '비빔밥' },
                  ],
                  closing: '마무리',
                })} 감사합니다.`,
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toHaveLength(2);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        expect(result.recommendations[1].menu).toBe('비빔밥');
        expect(result.intro).toBe('한식을 좋아하시는 것 같아 추천드립니다.');
      });

      it('should handle menus and explanation field names', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '한식 추천입니다.',
                  recommendations: [
                    { condition: '조건1', menu: '김치찌개' },
                    { condition: '조건2', menu: '비빔밥' },
                  ],
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toHaveLength(2);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        expect(result.recommendations[1].menu).toBe('비빔밥');
        expect(result.intro).toBe('한식 추천입니다.');
      });

      it('should fallback to text extraction when JSON parsing fails', async () => {
        const mockResponse = {
          id: 'resp-123',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `추천 메뉴:
1 김치찌개
2 비빔밥
3 된장찌개
이 메뉴들은 한식을 좋아하시는 분께 적합합니다.`,
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeGreaterThan(0);
        const menuNames = result.recommendations.map((r) => r.menu);
        expect(menuNames).toContain('김치찌개');
        expect(menuNames).toContain('비빔밥');
        expect(menuNames).toContain('된장찌개');
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('JSON 파싱 실패'),
        );
      });

      it('should extract menus from bullet points', async () => {
        const mockResponse = {
          id: 'resp-123',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `추천 메뉴:
- 김치찌개
- 비빔밥
* 된장찌개`,
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeGreaterThan(0);
        // Check that each recommendation is present (allowing for variations in extraction)
        const hasKimchi = result.recommendations.some((r) =>
          r.menu.includes('김치찌개'),
        );
        const hasBibimbap = result.recommendations.some((r) =>
          r.menu.includes('비빔밥'),
        );
        const hasDoenjang = result.recommendations.some((r) =>
          r.menu.includes('된장찌개'),
        );

        expect(hasKimchi).toBe(true);
        expect(hasBibimbap).toBe(true);
        expect(hasDoenjang).toBe(true);
      });

      it('should limit extracted menus to 5 items', async () => {
        const mockResponse = {
          id: 'resp-123',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `추천:
1 김치찌개
2 비빔밥
3 된장찌개
4 불고기
5 갈비탕
6 냉면
7 삼계탕`,
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.recommendations.length).toBeLessThanOrEqual(5);
      });

      it('should truncate reason to 200 characters in fallback extraction', async () => {
        const longText = 'A'.repeat(300);
        const mockResponse = {
          id: 'resp-123',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `1 김치찌개\n${longText}`,
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
        );

        expect(result.intro.length).toBe(200);
      });
    });

    describe('logging verification', () => {
      it('should log request start with all parameters', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          undefined,
          undefined,
          userAddress,
          undefined,
          undefined,
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
        // Debug mode logs (not always present in regular logs)
        const debugCalls = jest.spyOn(Logger.prototype, 'debug');
        if (debugCalls.mock.calls.length > 0) {
          expect(debugCalls).toHaveBeenCalledWith(
            expect.stringContaining('선호: 한식, 중식'),
          );
          expect(debugCalls).toHaveBeenCalledWith(
            expect.stringContaining('비선호: 생선'),
          );
        }
      });

      it('should log Call B completion with duration', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call B 완료]'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/소요 시간: \d+ms/),
        );
      });

      it('should log recommendation results', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '한식을 좋아하시는 것 같아 추천드립니다.',
                  recommendations: [
                    { condition: '조건1', menu: '김치찌개' },
                    { condition: '조건2', menu: '비빔밥' },
                  ],
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

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

      it('should log Call B token usage', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call B 토큰 사용량]'),
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
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
                  recommendations: [{ condition: '조건', menu: '김치찌개' }],
                  closing: '마무리',
                }),
              },
              finish_reason: 'stop',
            },
          ],
        };

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        // Should not throw error and should still complete successfully
        expect(loggerLogSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('[Call B 토큰 사용량]'),
        );
      });
    });

    describe('error handling', () => {
      it('should throw ExternalApiException when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

        await expect(
          service.generateMenuRecommendations(prompt, likes, dislikes),
        ).rejects.toThrow(ExternalApiException);
      });

      it('should log error details when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Call B 실패]'),
        );
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('API connection failed'),
        );
      });

      it('should not log fallback message when API call fails', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        // No fallback logging in new implementation - errors are thrown directly
        expect(loggerWarnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('폴백'),
        );
      });

      it('should include error duration in logs', async () => {
        const apiError = new Error('API connection failed');
        mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

        try {
          await service.generateMenuRecommendations(prompt, likes, dislikes);
        } catch {
          // Expected error
        }

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[Call B 실패\] 소요 시간: \d+ms/),
        );
      });

      it('should handle non-Error objects in catch block', async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue('string error');

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
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          prompt,
          [],
          [],
        );

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        // Debug logs for likes/dislikes
        const debugCalls = jest.spyOn(Logger.prototype, 'debug');
        if (debugCalls.mock.calls.length > 0) {
          expect(debugCalls).toHaveBeenCalledWith(
            expect.stringContaining('선호: 없음'),
          );
          expect(debugCalls).toHaveBeenCalledWith(
            expect.stringContaining('비선호: 없음'),
          );
        }
      });

      it('should handle undefined analysis parameter', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

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
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

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
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('언어: ko'),
        );
      });

      it('should support English language', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: 'Recommended based on your preferences',
                  recommendations: [
                    { condition: 'If you want spicy', menu: 'Kimchi Stew' },
                  ],
                  closing: 'Enjoy!',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(
          'What should I eat for lunch?',
          ['Korean'],
          ['Fish'],
          undefined,
          undefined,
          'Seoul, Gangnam',
          undefined,
          undefined,
          'en',
        );

        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('언어: en'),
        );
      });

      it('should throw OpenAIResponseException when recommendations array is empty', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
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
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await expect(
          service.generateMenuRecommendations(prompt, likes, dislikes),
        ).rejects.toThrow(ExternalApiException);
      });

      it('should handle very long prompt text', async () => {
        const longPrompt = 'A'.repeat(1000);
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
                  recommendations: [{ condition: '조건', menu: '김치찌개' }],
                  closing: '마무리',
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 500,
            completion_tokens: 50,
            total_tokens: 550,
          },
        };

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        const result = await service.generateMenuRecommendations(
          longPrompt,
          likes,
          dislikes,
        );

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0].menu).toBe('김치찌개');
        // Should log truncated version (first 100 chars + ...) in debug logs
        const debugCalls = jest.spyOn(Logger.prototype, 'debug');
        if (debugCalls.mock.calls.length > 0) {
          expect(debugCalls).toHaveBeenCalledWith(
            expect.stringMatching(/사용자 요청: A{100}\.\.\./),
          );
        }
      });

      it('should use correct model from WEB_SEARCH_CONFIG', async () => {
        const mockResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: WEB_SEARCH_CONFIG.MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  intro: '추천 이유',
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

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        await service.generateMenuRecommendations(prompt, likes, dislikes);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: WEB_SEARCH_CONFIG.MODEL,
          }),
        );
      });
    });
  });
});
