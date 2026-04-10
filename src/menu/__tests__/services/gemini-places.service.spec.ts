import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';
import { GeminiPlacesService } from '@/menu/services/gemini-places.service';

const buildMockGeminiRestaurant = (
  overrides: Partial<{
    placeId: string | null;
    nameKo: string;
    nameEn: string | null;
    nameLocal: string | null;
    addressKo: string;
    addressEn: string | null;
    addressLocal: string | null;
    latitude: number;
    longitude: number;
    reason: string;
    reasonTags: string[];
  }> = {},
) => ({
  placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  nameKo: '맛있는 식당',
  nameEn: 'Tasty Restaurant',
  nameLocal: '맛있는 식당',
  reason: '음식이 맛있고 서비스가 좋습니다.',
  reasonTags: ['맛집', '친절'],
  addressKo: '서울특별시 강남구 테헤란로 123',
  addressEn: '123, Teheran-ro, Gangnam-gu, Seoul',
  addressLocal: '서울특별시 강남구 테헤란로 123',
  latitude: 37.5012345,
  longitude: 127.0398765,
  ...overrides,
});

describe('GeminiPlacesService', () => {
  let service: GeminiPlacesService;

  const mockGeminiClient = {
    searchRestaurantsUnified: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiPlacesService,
        { provide: GeminiClient, useValue: mockGeminiClient },
      ],
    }).compile();

    service = module.get<GeminiPlacesService>(GeminiPlacesService);
  });

  // ─── recommendRestaurants ────────────────────────────────────────────────────

  describe('recommendRestaurants', () => {
    it('should extract recommendations with placeId and metadata from Gemini response', async () => {
      const restaurant = buildMockGeminiRestaurant();
      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue({
        restaurants: [restaurant],
        googleMapsWidgetContextToken: 'mock-widget-token',
      });

      const result = await service.recommendRestaurants(
        '김치찌개',
        '서울특별시 강남구 테헤란로 123',
        37.5012345,
        127.0398765,
        'ko',
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].placeId).toBe(restaurant.placeId);
      expect(result.recommendations[0].nameKo).toBe(restaurant.nameKo);
      expect(result.recommendations[0].reason).toBe(restaurant.reason);
      expect(result.recommendations[0].source).toBe('GEMINI');
      expect(result.googleMapsWidgetContextToken).toBe('mock-widget-token');
    });

    it('should set searchName and searchAddress for name-based matching when placeId is null', async () => {
      const restaurant = buildMockGeminiRestaurant({
        placeId: null,
        nameKo: '검색할 식당',
        nameLocal: null,
        addressKo: '부산광역시 해운대구 중동 123',
        addressLocal: null,
      });
      mockGeminiClient.searchRestaurantsUnified.mockResolvedValue({
        restaurants: [restaurant],
        googleMapsWidgetContextToken: null,
      });

      const result = await service.recommendRestaurants(
        '삼겹살',
        '부산광역시 해운대구',
        35.163,
        129.163,
        'ko',
      );

      expect(result.recommendations[0].placeId).toBeNull();
      // nameLocal is null → falls back to nameKo
      expect(result.recommendations[0].searchName).toBe('검색할 식당');
      // addressLocal is null → falls back to addressKo
      expect(result.recommendations[0].searchAddress).toBe('부산광역시 해운대구 중동 123');
    });
  });
});
