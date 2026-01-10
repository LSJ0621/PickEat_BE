import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAiPlacesService } from '../../services/openai-places.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

describe('OpenAiPlacesService', () => {
  let service: OpenAiPlacesService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_PLACES_MODEL: 'gpt-5.1-places',
    }) as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiPlacesService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OpenAiPlacesService>(OpenAiPlacesService);

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

  describe('constructor', () => {
    it('should use OPENAI_PLACES_MODEL if configured', () => {
      expect(service['model']).toBe('gpt-5.1-places');
    });

    it('should fallback to OPENAI_MODEL if OPENAI_PLACES_MODEL is not configured', () => {
      const fallbackConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
        OPENAI_MODEL: 'gpt-fallback',
      }) as unknown as jest.Mocked<ConfigService>;

      const fallbackService = new OpenAiPlacesService(fallbackConfig);

      expect(fallbackService['model']).toBe('gpt-fallback');
    });
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      const freshService = new OpenAiPlacesService(mockConfigService);

      freshService.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
      expect(freshService['openai']).toBeDefined();
    });

    it('should log error when API key is not configured', () => {
      const noKeyConfig = createMockConfigService(
        {},
      ) as unknown as jest.Mocked<ConfigService>;
      const freshService = new OpenAiPlacesService(noKeyConfig);

      const loggerSpy = jest.spyOn(freshService['logger'], 'error');

      freshService.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        'OPENAI_API_KEY is not configured',
      );
      expect(freshService['openai']).toBeNull();
    });
  });

  describe('recommendFromGooglePlaces', () => {
    const query = '강남역 근처 김치찌개';
    const candidates = [
      {
        id: 'place-1',
        name: '김치찌개 전문점',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'MODERATE',
        reviews: [
          {
            rating: 5,
            originalText: '맛있어요!',
            relativePublishTimeDescription: '1주 전',
          },
        ],
      },
      {
        id: 'place-2',
        name: '한식당',
        rating: 4.3,
        userRatingCount: 80,
        priceLevel: 'MODERATE',
        reviews: null,
      },
    ];

    it('should throw ExternalApiException when OpenAI is not initialized', async () => {
      service['openai'] = null;

      await expect(
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should return empty recommendations when no candidates provided', async () => {
      const result = await service.recommendFromGooglePlaces(query, []);

      expect(result).toEqual({ recommendations: [] });
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should successfully recommend places from Google Places candidates', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    placeId: 'place-1',
                    reason: '평점이 높고 리뷰가 좋습니다.',
                  },
                  {
                    placeId: 'place-2',
                    reason: '가격대가 적당합니다.',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromGooglePlaces(query, candidates);

      expect(result).toEqual({
        recommendations: [
          {
            placeId: 'place-1',
            reason: '평점이 높고 리뷰가 좋습니다.',
          },
          {
            placeId: 'place-2',
            reason: '가격대가 적당합니다.',
          },
        ],
      });
    });

    it('should throw ExternalApiException when content is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
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
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when recommendations is not an array', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: 'invalid',
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
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should record failure metrics when OpenAI call fails', async () => {
      const error = new Error('OpenAI API error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      await expect(
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should log request start and completion', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendFromGooglePlaces(query, candidates);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 장소 추천 요청 시작]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 토큰 사용량]'),
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Test error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 장소 추천 에러]'),
        error.stack,
      );
    });

    it('should handle candidates without reviews', async () => {
      const candidatesWithoutReviews = [
        {
          id: 'place-1',
          name: '김치찌개 전문점',
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'MODERATE',
          reviews: null,
        },
      ];

      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    placeId: 'place-1',
                    reason: '추천 이유',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromGooglePlaces(
        query,
        candidatesWithoutReviews,
      );

      expect(result.recommendations).toHaveLength(1);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle usage with input_tokens instead of prompt_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          input_tokens: 250,
          output_tokens: 75,
          total_tokens: 325,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await service.recommendFromGooglePlaces(query, candidates);
    });

    it('should handle usage with only total_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          total_tokens: 400,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await service.recommendFromGooglePlaces(query, candidates);
    });

    it('should handle usage without any token fields (defaults to 0)', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
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

      await service.recommendFromGooglePlaces(query, candidates);
    });

    it('should handle response without usage metrics', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromGooglePlaces(query, candidates);

      expect(result).toEqual({ recommendations: [] });
    });

    it('should handle non-finite total tokens gracefully', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: NaN,
          completion_tokens: 100,
          total_tokens: NaN,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromGooglePlaces(query, candidates);

      expect(result).toEqual({ recommendations: [] });
    });

    it('should handle non-Error thrown objects in catch block', async () => {
      const nonErrorObject = { message: 'Not an Error instance' };
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue(nonErrorObject);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 장소 추천 에러]'),
        undefined,
      );
    });

    it('should throw ExternalApiException with non-Error cause', async () => {
      const nonError = 'string error';
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue(nonError);

      await expect(
        service.recommendFromGooglePlaces(query, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle missing usage field in response', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromGooglePlaces(query, candidates);

      expect(result).toEqual({ recommendations: [] });
    });
  });
});
