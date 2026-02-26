import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAiCommunityPlacesService } from '../../services/openai-community-places.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { CommunityPlaceCandidate } from '../../interfaces/community-places.interface';

describe('OpenAiCommunityPlacesService', () => {
  let service: OpenAiCommunityPlacesService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_MODEL: 'gpt-5.1-community-places',
    }) as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiCommunityPlacesService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OpenAiCommunityPlacesService>(
      OpenAiCommunityPlacesService,
    );

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
    it('should use OPENAI_MODEL if configured', () => {
      expect(service['model']).toBe('gpt-5.1-community-places');
    });

    it('should fallback to OPENAI_MODEL if OPENAI_PLACES_MODEL is not configured', () => {
      const fallbackConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
        OPENAI_MODEL: 'gpt-fallback',
      }) as unknown as jest.Mocked<ConfigService>;

      const fallbackService = new OpenAiCommunityPlacesService(fallbackConfig);

      expect(fallbackService['model']).toBe('gpt-fallback');
    });

    it('should use DEFAULT_MODEL when neither model is configured', () => {
      const noModelConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
      }) as unknown as jest.Mocked<ConfigService>;

      const noModelService = new OpenAiCommunityPlacesService(noModelConfig);

      expect(noModelService['model']).toBe('gpt-5.1');
    });
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      const freshService = new OpenAiCommunityPlacesService(mockConfigService);

      freshService.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
      expect(freshService['openai']).toBeDefined();
    });

    it('should log error when API key is not configured', () => {
      const noKeyConfig = createMockConfigService(
        {},
      ) as unknown as jest.Mocked<ConfigService>;
      const freshService = new OpenAiCommunityPlacesService(noKeyConfig);

      const loggerSpy = jest.spyOn(freshService['logger'], 'error');

      freshService.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        'OPENAI_API_KEY is not configured',
      );
      expect(freshService['openai']).toBeNull();
    });
  });

  describe('recommendFromCommunityPlaces', () => {
    const menuName = '김치찌개';
    const candidates: CommunityPlaceCandidate[] = [
      {
        id: 1,
        name: '김치찌개 맛집',
        address: '서울특별시 강남구 테헤란로 123',
        menuTypes: ['한식', '찌개류'],
        category: '음식점',
        description: '오래된 전통 김치찌개 맛집',
        distance: 350,
      },
      {
        id: 2,
        name: '할머니 손맛',
        address: '서울특별시 강남구 역삼로 456',
        menuTypes: ['한식', '가정식'],
        category: '음식점',
        description: null,
        distance: 720,
      },
    ];

    it('should throw ExternalApiException when OpenAI is not initialized', async () => {
      service['openai'] = null;

      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow('OpenAI API key is not configured');
    });

    it('should return empty recommendations when no candidates provided', async () => {
      const result = await service.recommendFromCommunityPlaces(menuName, []);

      expect(result).toEqual({ recommendations: [] });
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should successfully recommend places from community candidates', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    userPlaceId: 1,
                    name: '김치찌개 맛집',
                    address: '서울특별시 강남구 테헤란로 123',
                    matchReason: '김치찌개를 전문으로 하는 맛집입니다.',
                    matchScore: 95,
                  },
                  {
                    userPlaceId: 2,
                    name: '할머니 손맛',
                    address: '서울특별시 강남구 역삼로 456',
                    matchReason:
                      '가정식 한식 전문점으로 김치찌개도 제공합니다.',
                    matchScore: 80,
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 250,
          completion_tokens: 120,
          total_tokens: 370,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidates,
      );

      expect(result).toEqual({
        recommendations: [
          {
            userPlaceId: 1,
            name: '김치찌개 맛집',
            address: '서울특별시 강남구 테헤란로 123',
            matchReason: '김치찌개를 전문으로 하는 맛집입니다.',
            matchScore: 95,
          },
          {
            userPlaceId: 2,
            name: '할머니 손맛',
            address: '서울특별시 강남구 역삼로 456',
            matchReason: '가정식 한식 전문점으로 김치찌개도 제공합니다.',
            matchScore: 80,
          },
        ],
      });
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.1-community-places',
          response_format: {
            type: 'json_schema',
            json_schema: expect.objectContaining({
              name: 'community_places_recommendations',
              strict: true,
            }),
          },
          max_completion_tokens: 800,
        }),
      );
    });

    it('should handle language parameter for Korean', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await service.recommendFromCommunityPlaces(menuName, candidates, 'ko');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle language parameter for English', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await service.recommendFromCommunityPlaces(menuName, candidates, 'en');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should throw ExternalApiException when content is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(
        'Failed to get OpenAI community place recommendations.',
      );
    });

    it('should throw ExternalApiException when recommendations is not an array', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(
        'Failed to get OpenAI community place recommendations.',
      );
    });

    it('should throw ExternalApiException when recommendations field is missing', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                wrongField: [],
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
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when OpenAI call fails', async () => {
      const error = new Error('OpenAI API error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(
        'Failed to get OpenAI community place recommendations.',
      );
    });

    it('should log request start and completion', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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
          completion_tokens: 50,
          total_tokens: 250,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendFromCommunityPlaces(menuName, candidates);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 커뮤니티 장소 추천 요청 시작]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI token usage]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 커뮤니티 장소 추천 완료]'),
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Test error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 커뮤니티 장소 추천 에러]'),
        error.stack,
      );
    });

    it('should handle usage with input_tokens instead of prompt_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidates,
      );

      expect(result).toEqual({ recommendations: [] });
    });

    it('should handle usage with only total_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidates,
      );

      expect(result).toEqual({ recommendations: [] });
    });

    it('should handle response without usage metrics', async () => {
      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidates,
      );

      expect(result).toEqual({ recommendations: [] });
    });

    it('should handle non-Error thrown objects in catch block', async () => {
      const nonErrorObject = { message: 'Not an Error instance' };
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue(nonErrorObject);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 커뮤니티 장소 추천 에러]'),
        undefined,
      );
    });

    it('should throw ExternalApiException with non-Error cause', async () => {
      const nonError = 'string error';
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue(nonError);

      await expect(
        service.recommendFromCommunityPlaces(menuName, candidates),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle candidates with null description', async () => {
      const candidatesWithNullDescription: CommunityPlaceCandidate[] = [
        {
          id: 1,
          name: '식당',
          address: '서울시',
          menuTypes: ['한식'],
          category: '음식점',
          description: null,
          distance: 100,
        },
      ];

      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    userPlaceId: 1,
                    name: '식당',
                    address: '서울시',
                    matchReason: '추천 이유',
                    matchScore: 75,
                  },
                ],
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

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidatesWithNullDescription,
      );

      expect(result.recommendations).toHaveLength(1);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle empty menuTypes array', async () => {
      const candidatesWithEmptyMenuTypes: CommunityPlaceCandidate[] = [
        {
          id: 1,
          name: '식당',
          address: '서울시',
          menuTypes: [],
          category: '음식점',
          description: '설명',
          distance: 100,
        },
      ];

      const mockResponse = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-5.1-community-places',
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

      const result = await service.recommendFromCommunityPlaces(
        menuName,
        candidatesWithEmptyMenuTypes,
      );

      expect(result).toEqual({ recommendations: [] });
    });
  });
});
