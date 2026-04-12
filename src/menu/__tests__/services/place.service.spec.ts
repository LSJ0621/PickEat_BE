import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { PlaceService } from '@/menu/services/place.service';
import { MenuRecommendationService } from '@/menu/services/menu-recommendation.service';
import { GeminiPlacesService } from '@/menu/services/gemini-places.service';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { RedisCacheService } from '@/common/cache/cache.service';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { PlaceRecommendationSource } from '@/menu/enum/place-recommendation-source.enum';

describe('PlaceService', () => {
  let service: PlaceService;

  const mockPlaceRecommendationRepository = {
    create: jest.fn((x) => x),
    save: jest.fn(),
  };
  const mockUserPlaceRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockMenuRecommendationService = {
    findById: jest.fn(),
  };
  const mockGeminiPlacesService = {
    recommendRestaurants: jest.fn(),
  };
  const mockGooglePlacesClient = {
    searchByText: jest.fn(),
    getDetails: jest.fn(),
    resolvePhotoUris: jest.fn(),
  };
  const mockGoogleSearchClient = {
    searchBlogs: jest.fn(),
  };
  const mockCacheService = {};

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPlaceRecommendationRepository.create.mockImplementation((x) => x);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceService,
        {
          provide: getRepositoryToken(PlaceRecommendation),
          useValue: mockPlaceRecommendationRepository,
        },
        {
          provide: getRepositoryToken(UserPlace),
          useValue: mockUserPlaceRepository,
        },
        { provide: MenuRecommendationService, useValue: mockMenuRecommendationService },
        { provide: GeminiPlacesService, useValue: mockGeminiPlacesService },
        { provide: GooglePlacesClient, useValue: mockGooglePlacesClient },
        { provide: GoogleSearchClient, useValue: mockGoogleSearchClient },
        { provide: RedisCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = moduleRef.get<PlaceService>(PlaceService);
  });

  // ─── searchRestaurantsWithGooglePlaces ─────────────────────────────────────

  describe('searchRestaurantsWithGooglePlaces', () => {
    it('Google Places 결과를 매핑하여 반환하고 리뷰는 최대 3개로 제한한다', async () => {
      mockGooglePlacesClient.searchByText.mockResolvedValue([
        {
          id: 'place-1',
          displayName: { text: '맛집' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          reviews: [
            { rating: 5, originalText: { text: 'good1' }, relativePublishTimeDescription: '1d' },
            { rating: 4, originalText: { text: 'good2' }, relativePublishTimeDescription: '2d' },
            { rating: 5, originalText: { text: 'good3' }, relativePublishTimeDescription: '3d' },
            { rating: 3, originalText: { text: 'good4' }, relativePublishTimeDescription: '4d' },
          ],
        },
      ]);

      const result = await service.searchRestaurantsWithGooglePlaces(
        '김치찌개',
        37.5,
        127.0,
        'ko',
      );

      expect(result.places).toHaveLength(1);
      expect(result.places[0].name).toBe('맛집');
      expect(result.places[0].reviews).toHaveLength(3);
    });
  });

  // ─── getPlaceDetail ────────────────────────────────────────────────────────

  describe('getPlaceDetail', () => {
    it('user_place_ prefix면 UserPlaceRepository에서 조회한다', async () => {
      mockUserPlaceRepository.findOne.mockResolvedValue({
        id: 42,
        name: '나의 가게',
        address: '서울 강남구',
        latitude: 37.5,
        longitude: 127.0,
        photos: ['photo1'],
        phoneNumber: '010',
        category: '한식',
        menuItems: [],
        description: 'desc',
        businessHours: null,
      });

      const result = await service.getPlaceDetail('user_place_42', 'ko');

      expect(result.place?.id).toBe('user_place_42');
      expect(result.place?.name).toBe('나의 가게');
      expect(result.place?.source).toBe(PlaceRecommendationSource.USER);
    });

    it('Google 장소 상세를 조회하여 photos/reviews를 매핑한다', async () => {
      mockGooglePlacesClient.getDetails.mockResolvedValue({
        id: 'gplace-1',
        displayName: { text: 'G맛집' },
        formattedAddress: '서울',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.2,
        userRatingCount: 50,
        priceLevel: null,
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [{ name: 'p' }],
        reviews: [
          {
            rating: 5,
            originalText: { text: 'r1' },
            authorAttribution: { displayName: 'A' },
            publishTime: 't',
          },
        ],
      });
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue(['uri1']);

      const result = await service.getPlaceDetail('gplace-1', 'ko');

      expect(result.place?.id).toBe('gplace-1');
      expect(result.place?.photos).toEqual(['uri1']);
      expect(result.place?.source).toBe(PlaceRecommendationSource.GOOGLE);
    });

    it('Google 조회 결과가 null이면 place=null을 반환한다', async () => {
      mockGooglePlacesClient.getDetails.mockResolvedValue(null);

      const result = await service.getPlaceDetail('unknown', 'ko');

      expect(result.place).toBeNull();
    });
  });

  // ─── searchRestaurantBlogs ────────────────────────────────────────────────

  describe('searchRestaurantBlogs', () => {
    it('searchName/searchAddress가 제공되면 이를 사용하여 검색한다', async () => {
      mockGoogleSearchClient.searchBlogs.mockResolvedValue([{ title: 'b' }]);

      const result = await service.searchRestaurantBlogs(
        '원주소',
        '원이름',
        'ko',
        '검색이름',
        '검색주소',
      );

      expect(result.blogs).toEqual([{ title: 'b' }]);
    });
  });

  // ─── recommendRestaurants ─────────────────────────────────────────────────

  describe('recommendRestaurants', () => {
    it('menuName이 비어있으면 MENU_NAME_REQUIRED 예외를 던진다', async () => {
      const user = UserFactory.createWithPassword();
      await expect(
        service.recommendRestaurants(user, 'q', '', 1, 37.5, 127.0),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.MENU_NAME_REQUIRED },
      });
    });

    it('이미 추천된 menuName이면 PLACE_ALREADY_RECOMMENDED 예외를 던진다', async () => {
      const user = UserFactory.createWithPassword();
      mockMenuRecommendationService.findById.mockResolvedValue({
        id: 1,
        requestAddress: '서울',
        placeRecommendations: [{ menuName: '김치찌개' }],
      } as unknown as MenuRecommendation);

      await expect(
        service.recommendRestaurants(user, 'q', '김치찌개', 1, 37.5, 127.0),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.PLACE_ALREADY_RECOMMENDED },
      });
    });

    it('Gemini 추천이 성공하면 PlaceRecommendation을 저장하고 응답을 반환한다', async () => {
      const user = UserFactory.createWithPassword();
      user.preferredLanguage = 'ko';
      mockMenuRecommendationService.findById.mockResolvedValue({
        id: 1,
        requestAddress: '서울',
        placeRecommendations: [],
      } as unknown as MenuRecommendation);

      const geminiResponse = {
        recommendations: [
          {
            placeId: 'places/xyz',
            reason: '좋음',
            reasonTags: ['맛집'],
            nameKo: '김치찌개집',
            nameEn: 'Kimchi House',
            nameLocal: null,
            addressKo: '서울',
            addressEn: 'Seoul',
            addressLocal: null,
            location: { latitude: 37.5, longitude: 127.0 },
          },
        ],
      };
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(geminiResponse);
      mockPlaceRecommendationRepository.save.mockResolvedValue([]);

      const result = await service.recommendRestaurants(
        user,
        'q',
        '김치찌개',
        1,
        37.5,
        127.0,
      );

      expect(result).toBe(geminiResponse);
    });
  });
});
