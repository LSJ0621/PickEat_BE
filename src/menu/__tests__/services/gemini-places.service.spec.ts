import { Test, TestingModule } from '@nestjs/testing';
import { GeminiPlacesService } from '../../services/gemini-places.service';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';

describe('GeminiPlacesService', () => {
  let service: GeminiPlacesService;
  let mockGeminiClient: jest.Mocked<GeminiClient>;

  beforeEach(async () => {
    mockGeminiClient = {
      searchRestaurantsUnified: jest.fn(),
    } as unknown as jest.Mocked<GeminiClient>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiPlacesService,
        {
          provide: GeminiClient,
          useValue: mockGeminiClient,
        },
      ],
    }).compile();

    service = module.get<GeminiPlacesService>(GeminiPlacesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recommendRestaurants', () => {
    const menuName = '김치찌개';
    const address = '서울특별시 강남구 역삼동';
    const latitude = 37.5012;
    const longitude = 127.0396;

    it('should return recommendations with multilingual fields in Korean', async () => {
      const geminiResponse = {
        success: true,
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '김치찌개 전문점',
            nameEn: 'Kimchi Jjigae Restaurant',
            reason: '평점이 높고 현지인들에게 인기가 많습니다.',
            addressKo: '서울특별시 강남구 역삼동 123-45',
            addressEn: '123-45 Yeoksam-dong, Gangnam-gu, Seoul',
            latitude: 37.5012345,
            longitude: 127.0456789,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        googleMapsWidgetContextToken: 'test-token',
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(mockGeminiClient.searchRestaurantsUnified).toHaveBeenCalledWith(
        expect.any(String),
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toEqual({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        reason: '평점이 높고 현지인들에게 인기가 많습니다.',
        reasonTags: [],
        menuName: '김치찌개',
        source: 'GEMINI',
        location: {
          latitude: 37.5012345,
          longitude: 127.0456789,
        },
        searchName: '김치찌개 전문점',
        searchAddress: '서울특별시 강남구 역삼동 123-45',
        nameKo: '김치찌개 전문점',
        nameEn: 'Kimchi Jjigae Restaurant',
        nameLocal: null,
        addressKo: '서울특별시 강남구 역삼동 123-45',
        addressEn: '123-45 Yeoksam-dong, Gangnam-gu, Seoul',
        addressLocal: null,
      });
      expect(result.googleMapsWidgetContextToken).toBe('test-token');
    });

    it('should return recommendations with multilingual fields in English', async () => {
      const geminiResponse = {
        success: true,
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '김치찌개 전문점',
            nameEn: 'Kimchi Jjigae Restaurant',
            reason: 'Highly rated and popular among locals.',
            addressKo: '서울특별시 강남구 역삼동 123-45',
            addressEn: '123-45 Yeoksam-dong, Gangnam-gu, Seoul',
            latitude: 37.5012345,
            longitude: 127.0456789,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        googleMapsWidgetContextToken: 'test-token-en',
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        'Kimchi Stew',
        'Yeoksam-dong, Gangnam-gu, Seoul',
        latitude,
        longitude,
        'en',
      );

      expect(mockGeminiClient.searchRestaurantsUnified).toHaveBeenCalledWith(
        expect.any(String),
        latitude,
        longitude,
        'en',
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toEqual({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        reason: 'Highly rated and popular among locals.',
        reasonTags: [],
        menuName: 'Kimchi Stew',
        source: 'GEMINI',
        location: {
          latitude: 37.5012345,
          longitude: 127.0456789,
        },
        searchName: '김치찌개 전문점',
        searchAddress: '서울특별시 강남구 역삼동 123-45',
        nameKo: '김치찌개 전문점',
        nameEn: 'Kimchi Jjigae Restaurant',
        nameLocal: null,
        addressKo: '서울특별시 강남구 역삼동 123-45',
        addressEn: '123-45 Yeoksam-dong, Gangnam-gu, Seoul',
        addressLocal: null,
      });
    });

    it('should handle recommendations with undefined nameLocal and addressLocal', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '김치찌개 전문점',
            nameEn: 'Kimchi Restaurant',
            reason: '추천 이유',
            addressKo: '서울특별시 강남구',
            addressEn: 'Gangnam-gu, Seoul',
            latitude: 37.5012345,
            longitude: 127.0456789,
            nameLocal: undefined,
            addressLocal: undefined,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations[0].nameLocal).toBeNull();
      expect(result.recommendations[0].addressLocal).toBeNull();
    });

    it('should set searchName from nameLocal or nameKo', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '맛집',
            nameEn: 'Restaurant',
            reason: '좋아요',
            addressKo: '서울',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'en',
      );

      expect(result.recommendations[0].searchName).toBe('맛집');
      expect(result.recommendations[0].nameKo).toBe('맛집');
    });

    it('should set searchAddress from addressLocal or addressKo', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '맛집',
            nameEn: 'Restaurant',
            reason: '좋아요',
            addressKo: '서울특별시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'en',
      );

      expect(result.recommendations[0].searchAddress).toBe('서울특별시');
      expect(result.recommendations[0].addressKo).toBe('서울특별시');
    });

    it('should handle location when latitude and longitude are undefined', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: undefined,
            longitude: undefined,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations[0].location).toBeUndefined();
    });

    it('should handle location when only latitude is undefined', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: undefined,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations[0].location).toBeUndefined();
    });

    it('should handle location when only longitude is undefined', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: undefined,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations[0].location).toBeUndefined();
    });

    it('should return multiple recommendations with different languages', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'place-1',
            nameKo: '김치찌개집',
            nameEn: 'Kimchi Restaurant',
            reason: '맛있어요',
            addressKo: '서울',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
          {
            placeId: 'place-2',
            nameKo: '한식당',
            nameEn: 'Korean Restaurant',
            reason: '분위기 좋아요',
            addressKo: '강남',
            addressEn: 'Gangnam',
            latitude: 37.51,
            longitude: 127.01,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: 'token',
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'en',
      );

      expect(result.recommendations).toHaveLength(2);
      expect(result.recommendations[0].nameEn).toBe('Kimchi Restaurant');
      expect(result.recommendations[1].nameEn).toBe('Korean Restaurant');
    });

    it('should use default language ko when not specified', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'place-1',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
      );

      expect(mockGeminiClient.searchRestaurantsUnified).toHaveBeenCalledWith(
        expect.any(String),
        latitude,
        longitude,
        'ko',
      );
    });

    it('should set searchEntryPointHtml to undefined', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'place-1',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: 'token',
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.searchEntryPointHtml).toBeUndefined();
    });

    it('should log request and completion', async () => {
      const geminiResponse = {
        restaurants: [
          {
            placeId: 'place-1',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '추천',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GeminiPlacesService]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('추천 완료'),
      );
    });

    it('should pass correct parameters to searchRestaurantsUnified', async () => {
      const geminiResponse = {
        success: true,
        restaurants: [],
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      await service.recommendRestaurants(
        '불고기',
        '서울시 종로구',
        37.5665,
        126.978,
        'en',
      );

      expect(mockGeminiClient.searchRestaurantsUnified).toHaveBeenCalledWith(
        expect.any(String),
        37.5665,
        126.978,
        'en',
      );
    });

    it('should handle empty restaurants array', async () => {
      const geminiResponse = {
        restaurants: [],
        success: true,
        googleMapsWidgetContextToken: undefined,
      };

      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue(
        geminiResponse,
      );

      const result = await service.recommendRestaurants(
        menuName,
        address,
        latitude,
        longitude,
        'ko',
      );

      expect(result.recommendations).toEqual([]);
    });
  });
});
