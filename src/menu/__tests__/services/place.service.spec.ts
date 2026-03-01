import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DeepPartial, In, Repository } from 'typeorm';
import { PlaceService } from '../../services/place.service';
import { MenuRecommendationService } from '../../services/menu-recommendation.service';
import { GeminiPlacesService } from '../../services/gemini-places.service';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { RedisCacheService } from '@/common/cache/cache.service';
import { PlaceRecommendation } from '../../entities/place-recommendation.entity';
import { PlaceRecommendationSource } from '../../enum/place-recommendation-source.enum';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { ErrorCode } from '@/common/constants/error-codes';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import { createMockService } from '../../../../test/utils/test-helpers';
import {
  UserFactory,
  MenuRecommendationFactory,
  PlaceRecommendationFactory,
} from '../../../../test/factories/entity.factory';

describe('PlaceService', () => {
  let service: PlaceService;
  let mockPlaceRecommendationRepository: jest.Mocked<
    Repository<PlaceRecommendation>
  >;
  let mockUserPlaceRepository: jest.Mocked<Repository<UserPlace>>;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;
  let mockGeminiPlacesService: jest.Mocked<GeminiPlacesService>;
  let mockGooglePlacesClient: jest.Mocked<GooglePlacesClient>;
  let mockGoogleSearchClient: jest.Mocked<GoogleSearchClient>;
  let mockCacheService: jest.Mocked<RedisCacheService>;

  beforeEach(async () => {
    mockPlaceRecommendationRepository =
      createMockRepository<PlaceRecommendation>();
    mockUserPlaceRepository = createMockRepository<UserPlace>();
    mockMenuRecommendationService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<MenuRecommendationService>;
    mockGeminiPlacesService = {
      recommendRestaurants: jest.fn(),
    } as unknown as jest.Mocked<GeminiPlacesService>;
    mockGooglePlacesClient = {
      searchByText: jest.fn(),
      getDetails: jest.fn(),
      resolvePhotoUris: jest.fn(),
    } as unknown as jest.Mocked<GooglePlacesClient>;
    mockGoogleSearchClient = {
      searchBlogs: jest.fn(),
    } as unknown as jest.Mocked<GoogleSearchClient>;
    mockCacheService = createMockService<RedisCacheService>([]);

    const module: TestingModule = await Test.createTestingModule({
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
        {
          provide: MenuRecommendationService,
          useValue: mockMenuRecommendationService,
        },
        {
          provide: GeminiPlacesService,
          useValue: mockGeminiPlacesService,
        },
        {
          provide: GooglePlacesClient,
          useValue: mockGooglePlacesClient,
        },
        {
          provide: GoogleSearchClient,
          useValue: mockGoogleSearchClient,
        },
        {
          provide: RedisCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<PlaceService>(PlaceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // searchRestaurantsWithGooglePlaces
  // ---------------------------------------------------------------------------

  describe('searchRestaurantsWithGooglePlaces', () => {
    it('should return formatted places from Google Places API', async () => {
      const textQuery = '강남역 맛집';
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '맛있는 식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          reviews: [
            {
              rating: 5,
              originalText: { text: '맛있어요!' },
              text: { text: '맛있어요!' },
              relativePublishTimeDescription: '1주일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces(textQuery);

      expect(mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
        textQuery,
        undefined,
      );
      expect(result.places).toHaveLength(1);
      expect(result.places[0]).toEqual({
        id: 'place-1',
        name: '맛있는 식당',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        reviews: [
          {
            rating: 5,
            originalText: '맛있어요!',
            relativePublishTimeDescription: '1주일 전',
          },
        ],
      });
    });

    it('should handle places with missing optional fields', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: undefined,
          rating: undefined,
          userRatingCount: undefined,
          priceLevel: undefined,
          reviews: undefined,
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0]).toEqual({
        id: 'place-1',
        name: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        reviews: null,
      });
    });

    it('should limit reviews to top 3', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [1, 2, 3, 4].map((i) => ({
            rating: i,
            originalText: { text: `리뷰${i}` },
            relativePublishTimeDescription: `${i}일`,
          })),
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toHaveLength(3);
    });

    // Options object combinations: lat/lng/language presence
    describe('options object construction', () => {
      const basePlace = {
        id: 'place-1',
        displayName: { text: '식당' },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: undefined,
        reviews: undefined,
      };

      beforeEach(() => {
        mockGooglePlacesClient.searchByText.mockResolvedValue([basePlace]);
      });

      test.each([
        [
          'no coords, no language -> undefined options',
          undefined,
          undefined,
          undefined,
          undefined,
        ],
        [
          'only latitude (no longitude) -> undefined options',
          37.5012,
          undefined,
          undefined,
          undefined,
        ],
        [
          'only longitude (no latitude) -> undefined options',
          undefined,
          127.0396,
          undefined,
          undefined,
        ],
        [
          'both coords, no language -> locationBias only',
          37.5012,
          127.0396,
          undefined,
          {
            locationBias: {
              circle: {
                center: { latitude: 37.5012, longitude: 127.0396 },
                radius: 500.0,
              },
            },
          },
        ],
        [
          'language only, no coords -> languageCode only',
          undefined,
          undefined,
          'en' as const,
          { languageCode: 'en' },
        ],
        [
          'both coords and language -> both options',
          37.5012,
          127.0396,
          'en' as const,
          {
            languageCode: 'en',
            locationBias: {
              circle: {
                center: { latitude: 37.5012, longitude: 127.0396 },
                radius: 500.0,
              },
            },
          },
        ],
      ])(
        'should pass correct options when %s',
        async (
          _label: string,
          lat: number | undefined,
          lng: number | undefined,
          lang: 'ko' | 'en' | undefined,
          expectedOptions: Record<string, unknown> | undefined,
        ) => {
          await service.searchRestaurantsWithGooglePlaces(
            '강남역 맛집',
            lat,
            lng,
            lang,
          );
          expect(mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
            '강남역 맛집',
            expectedOptions,
          );
        },
      );
    });

    // Review field format: consolidated in one describe
    describe('review field formatting', () => {
      const buildPlace = (review: Record<string, unknown>) => ({
        id: 'place-1',
        displayName: { text: '식당' },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: undefined,
        reviews: [review],
      });

      it('should use text.text when originalText is not available', async () => {
        mockGooglePlacesClient.searchByText.mockResolvedValue([
          buildPlace({
            rating: 5,
            originalText: undefined,
            text: { text: 'fallback text' },
            relativePublishTimeDescription: '1일 전',
          }),
        ]);

        const result = await service.searchRestaurantsWithGooglePlaces('query');

        expect(result.places[0].reviews![0].originalText).toBe('fallback text');
      });

      it('should return null originalText when both originalText and text are unavailable', async () => {
        mockGooglePlacesClient.searchByText.mockResolvedValue([
          buildPlace({
            rating: 5,
            originalText: undefined,
            text: undefined,
            relativePublishTimeDescription: '1일 전',
          }),
        ]);

        const result = await service.searchRestaurantsWithGooglePlaces('query');

        expect(result.places[0].reviews![0].originalText).toBeNull();
      });

      it('should return null rating when review rating is undefined', async () => {
        mockGooglePlacesClient.searchByText.mockResolvedValue([
          buildPlace({
            rating: undefined,
            originalText: { text: '좋아요' },
            relativePublishTimeDescription: '1일 전',
          }),
        ]);

        const result = await service.searchRestaurantsWithGooglePlaces('query');

        expect(result.places[0].reviews![0].rating).toBeNull();
      });

      it('should return null relativePublishTimeDescription when undefined', async () => {
        mockGooglePlacesClient.searchByText.mockResolvedValue([
          buildPlace({
            rating: 5,
            originalText: { text: '좋아요' },
            relativePublishTimeDescription: undefined,
          }),
        ]);

        const result = await service.searchRestaurantsWithGooglePlaces('query');

        expect(
          result.places[0].reviews![0].relativePublishTimeDescription,
        ).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getPlaceDetail
  // ---------------------------------------------------------------------------

  describe('getPlaceDetail', () => {
    it('should return detailed place information with photos for Google place', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      const placeDetails = {
        id: placeId,
        displayName: { text: '맛있는 식당' },
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 200,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [{ name: 'photo1' }, { name: 'photo2' }],
        reviews: [
          {
            rating: 5,
            originalText: { text: '좋아요' },
            authorAttribution: { displayName: '홍길동' },
            publishTime: '2024-01-01T00:00:00Z',
          },
        ],
      };

      const photoUris = [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ];

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue(photoUris);

      const result = await service.getPlaceDetail(placeId);

      expect(mockGooglePlacesClient.getDetails).toHaveBeenCalledWith(placeId, {
        includeBusinessStatus: true,
        languageCode: 'ko',
      });
      expect(result.place).toEqual({
        id: placeId,
        name: '맛있는 식당',
        localizedName: null,
        address: '서울특별시 강남구 테헤란로 123',
        localizedAddress: null,
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 200,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        openNow: true,
        photos: photoUris,
        reviews: [
          {
            rating: 5,
            text: '좋아요',
            authorName: '홍길동',
            publishTime: '2024-01-01T00:00:00Z',
          },
        ],
        source: PlaceRecommendationSource.GOOGLE,
      });
    });

    it('should return null when Google place not found', async () => {
      mockGooglePlacesClient.getDetails.mockResolvedValue(null);

      const result = await service.getPlaceDetail('non-existent-place-id');

      expect(result.place).toBeNull();
    });

    it('should handle all null/undefined optional fields in place details', async () => {
      const placeId = 'place-id';
      mockGooglePlacesClient.getDetails.mockResolvedValue({
        id: undefined,
        displayName: undefined,
        formattedAddress: undefined,
        location: undefined,
        rating: undefined,
        userRatingCount: undefined,
        priceLevel: undefined,
        businessStatus: undefined,
        currentOpeningHours: undefined,
        photos: undefined,
        reviews: undefined,
      });
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail(placeId);

      expect(result.place).toEqual({
        id: placeId,
        name: null,
        localizedName: null,
        address: null,
        localizedAddress: null,
        location: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [],
        reviews: null,
        source: PlaceRecommendationSource.GOOGLE,
      });
    });

    it('should use text.text fallback when originalText is not available in reviews', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      mockGooglePlacesClient.getDetails.mockResolvedValue({
        id: placeId,
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: 5,
            originalText: undefined,
            text: { text: 'text fallback' },
            authorAttribution: { displayName: '작성자' },
            publishTime: '2024-01-01',
          },
        ],
      });
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail(placeId);

      expect(result.place?.reviews![0].text).toBe('text fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // getPlaceDetail - UserPlace handling
  // ---------------------------------------------------------------------------

  describe('getPlaceDetail - UserPlace handling', () => {
    it('should return UserPlace detail when placeId is user_place_N format', async () => {
      const userPlace: Partial<UserPlace> = {
        id: 123,
        name: '우리집 단골 식당',
        address: '서울시 강남구 역삼동 123-45',
        latitude: 37.5012345,
        longitude: 127.0456789,
        phoneNumber: '02-1234-5678',
        category: '한식',
        menuTypes: ['김치찌개', '된장찌개', '불고기'],
        description: '맛있는 한식당',
        openingHours: '09:00-21:00',
        photos: [
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
        ],
      };

      mockUserPlaceRepository.findOne.mockResolvedValue(userPlace as UserPlace);

      const result = await service.getPlaceDetail('user_place_123');

      expect(mockUserPlaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 123 },
        withDeleted: false,
      });
      expect(mockGooglePlacesClient.getDetails).not.toHaveBeenCalled();
      expect(result.place).toEqual({
        id: 'user_place_123',
        name: '우리집 단골 식당',
        localizedName: null,
        address: '서울시 강남구 역삼동 123-45',
        localizedAddress: null,
        location: { latitude: 37.5012345, longitude: 127.0456789 },
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
        ],
        reviews: null,
        source: 'USER',
        phoneNumber: '02-1234-5678',
        category: '한식',
        menuTypes: ['김치찌개', '된장찌개', '불고기'],
        description: '맛있는 한식당',
        openingHours: '09:00-21:00',
      });
    });

    it('should return null place when UserPlace ID does not exist in DB', async () => {
      mockUserPlaceRepository.findOne.mockResolvedValue(null);

      const result = await service.getPlaceDetail('user_place_999');

      expect(result).toEqual({ place: null });
    });

    it('should return empty photos array when UserPlace has null photos', async () => {
      mockUserPlaceRepository.findOne.mockResolvedValue({
        id: 1,
        name: '식당',
        address: '서울시',
        latitude: 37.5,
        longitude: 127.0,
        phoneNumber: null,
        category: null,
        menuTypes: ['한식'],
        description: null,
        openingHours: null,
        photos: null,
      } as unknown as UserPlace);

      const result = await service.getPlaceDetail('user_place_1');

      expect(result.place?.photos).toEqual([]);
    });

    it('should call Google API when placeId is not UserPlace format', async () => {
      const googlePlaceId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      mockGooglePlacesClient.getDetails.mockResolvedValue({
        id: googlePlaceId,
        displayName: { text: 'Google 식당' },
        formattedAddress: '서울시',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [],
      });
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      await service.getPlaceDetail(googlePlaceId);

      expect(mockUserPlaceRepository.findOne).not.toHaveBeenCalled();
      expect(mockGooglePlacesClient.getDetails).toHaveBeenCalledWith(
        googlePlaceId,
        { includeBusinessStatus: true, languageCode: 'ko' },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // searchRestaurantBlogs
  // ---------------------------------------------------------------------------

  describe('searchRestaurantBlogs', () => {
    const blogs = [
      {
        title: '맛집 리뷰',
        url: 'https://blog.example.com/post1',
        snippet: '정말 맛있는 식당이에요',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        source: 'Example Blog',
      },
    ];

    it('should return blog results without language parameter', async () => {
      const query = '강남역 맛집';
      const restaurantName = '맛있는 식당';
      mockGoogleSearchClient.searchBlogs.mockResolvedValue(blogs);

      const result = await service.searchRestaurantBlogs(query, restaurantName);

      expect(mockGoogleSearchClient.searchBlogs).toHaveBeenCalledWith(
        `${query} ${restaurantName}`,
        restaurantName,
        {},
      );
      expect(result.blogs).toEqual(blogs);
    });

    test.each([
      ['ko', { lr: 'lang_ko', hl: 'ko' }],
      ['en', { lr: 'lang_en', hl: 'en' }],
      ['ja', { lr: 'lang_ja', hl: 'ja' }],
      ['zh', { lr: 'lang_zh-CN', hl: 'zh' }],
    ] as Array<['ko' | 'en' | 'ja' | 'zh', Record<string, string>]>)(
      'should pass correct language restrict options for %s',
      async (lang, expectedOptions) => {
        mockGoogleSearchClient.searchBlogs.mockResolvedValue(blogs);

        await service.searchRestaurantBlogs('query', '식당', lang);

        expect(mockGoogleSearchClient.searchBlogs).toHaveBeenCalledWith(
          expect.any(String),
          '식당',
          expectedOptions,
        );
      },
    );

    it('should use searchName and searchAddress when provided', async () => {
      mockGoogleSearchClient.searchBlogs.mockResolvedValue(blogs);

      await service.searchRestaurantBlogs(
        'query',
        '원래이름',
        undefined,
        '검색이름',
        '검색주소',
      );

      expect(mockGoogleSearchClient.searchBlogs).toHaveBeenCalledWith(
        '검색주소 검색이름',
        '검색이름',
        {},
      );
    });
  });

  // ---------------------------------------------------------------------------
  // recommendRestaurants
  // ---------------------------------------------------------------------------

  describe('recommendRestaurants', () => {
    it('should execute full recommendation pipeline with Gemini and save results', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuName = '김치찌개';
      const menuRecommendationId = 1;
      const latitude = 37.5012;
      const longitude = 127.0396;

      const menuRecord = MenuRecommendationFactory.create({
        id: menuRecommendationId,
        user,
        placeRecommendations: [],
      });

      const geminiRecommendations = {
        recommendations: [
          {
            placeId: 'gemini_12345678',
            name: '김치찌개 전문점',
            reason: '평점이 높고 리뷰가 좋습니다.',
            reasonTags: [],
            menuName,
            source: 'GEMINI' as const,
            rating: 4.5,
            reviewCount: 100,
            isOpen: true,
            openingHours: '09:00-21:00',
            address: '서울시 강남구',
            location: { latitude, longitude },
            photoUrl: 'https://example.com/photo.jpg',
            nameKo: '김치찌개 전문점',
            nameEn: 'Kimchi Jjigae Restaurant',
            nameLocal: null,
            addressKo: '서울시 강남구',
            addressEn: 'Gangnam-gu, Seoul',
            addressLocal: null,
            searchName: '김치찌개 전문점',
            searchAddress: '서울시 강남구',
          },
        ],
        searchEntryPointHtml: undefined,
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(
        geminiRecommendations,
      );
      mockPlaceRecommendationRepository.create.mockImplementation(
        (data: DeepPartial<PlaceRecommendation>) => data as PlaceRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue(
        [] as unknown as PlaceRecommendation & PlaceRecommendation[],
      );

      const result = await service.recommendRestaurants(
        user,
        '강남역 김치찌개',
        menuName,
        menuRecommendationId,
        latitude,
        longitude,
      );

      expect(mockMenuRecommendationService.findById).toHaveBeenCalledWith(
        menuRecommendationId,
        user,
      );
      expect(mockGeminiPlacesService.recommendRestaurants).toHaveBeenCalledWith(
        menuName,
        menuRecord.requestAddress,
        latitude,
        longitude,
        'ko',
      );
      expect(mockPlaceRecommendationRepository.save).toHaveBeenCalled();
      expect(result).toEqual(geminiRecommendations);
    });

    it('should throw BadRequestException when menuName is missing', async () => {
      const user = UserFactory.create({ id: 1 });

      await expect(
        service.recommendRestaurants(user, 'query', '', 1, 37.5012, 127.0396),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_NAME_REQUIRED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when menuRecommendationId is missing', async () => {
      const user = UserFactory.create({ id: 1 });

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          undefined as unknown as number,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_RECOMMENDATION_ID_REQUIRED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when place recommendations already exist for the menu', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [
          PlaceRecommendationFactory.create({ menuName: '김치찌개' }),
        ],
      });

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          1,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.PLACE_ALREADY_RECOMMENDED,
          }),
        }),
      );
    });

    // Missing coordinate cases consolidated into test.each
    test.each([
      ['neither lat nor lng', undefined, undefined],
      ['only latitude', 37.5012, undefined],
      ['only longitude', undefined, 127.0396],
    ] as Array<[string, number | undefined, number | undefined]>)(
      'should throw BadRequestException when coordinates are incomplete (%s)',
      async (_label, lat, lng) => {
        const user = UserFactory.create({ id: 1 });
        const menuRecord = MenuRecommendationFactory.create({
          id: 1,
          user,
          placeRecommendations: [],
        });

        mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);

        await expect(
          service.recommendRestaurants(user, 'query', '김치찌개', 1, lat, lng),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errorCode: ErrorCode.ADDRESS_LAT_LNG_REQUIRED,
            }),
          }),
        );
      },
    );

    it('should throw BadRequestException when Gemini returns no recommendations', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue({
        recommendations: [],
        searchEntryPointHtml: undefined,
      });

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          1,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.PLACE_AI_RECOMMENDATION_FAILED,
          }),
        }),
      );
    });

    it('should handle recommendations with null placeId by filtering them out', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const geminiRecommendationsWithNullPlaceIds = {
        recommendations: [
          {
            placeId: null,
            name: '식당',
            reason: '좋아요',
            reasonTags: [] as string[],
            menuName: '김치찌개',
            source: 'GEMINI' as const,
            nameKo: '식당',
            nameEn: 'Restaurant',
            nameLocal: null,
            addressKo: null,
            addressEn: null,
            addressLocal: null,
            location: null,
          },
        ],
        searchEntryPointHtml: undefined,
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);

      (
        mockGeminiPlacesService.recommendRestaurants as jest.Mock
      ).mockResolvedValue(geminiRecommendationsWithNullPlaceIds);
      mockPlaceRecommendationRepository.save.mockResolvedValue(
        [] as unknown as PlaceRecommendation & PlaceRecommendation[],
      );

      const result = await service.recommendRestaurants(
        user,
        '강남역 김치찌개',
        '김치찌개',
        1,
        37.5012,
        127.0396,
      );

      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when save fails during recommendRestaurants', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const geminiRecommendations = {
        recommendations: [
          {
            placeId: 'gemini_12345678',
            name: '식당',
            reason: '좋아요',
            reasonTags: [] as string[],
            menuName: '김치찌개',
            source: 'GEMINI' as const,
            nameKo: '식당',
            nameEn: 'Restaurant',
            nameLocal: null,
            addressKo: '서울시',
            addressEn: 'Seoul',
            addressLocal: null,
            location: { latitude: 37.5, longitude: 127.0 },
          },
        ],
        searchEntryPointHtml: undefined,
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(
        geminiRecommendations,
      );
      mockPlaceRecommendationRepository.create.mockImplementation(
        (data) => data as PlaceRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockRejectedValue(
        new Error('DB save error'),
      );

      await expect(
        service.recommendRestaurants(
          user,
          '강남역 김치찌개',
          '김치찌개',
          1,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow();
    });

    it('should throw BadRequestException when Gemini returns null/undefined recommendations', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue({
        recommendations: null as unknown as [],
        searchEntryPointHtml: undefined,
      });

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          1,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default reasonTags to empty array when not an array in Gemini recommendation', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const geminiRecommendations = {
        recommendations: [
          {
            placeId: 'gemini_12345678',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '좋아요',
            reasonTags: null as unknown as string[], // non-array reasonTags
            menuName: '김치찌개',
            source: 'GEMINI' as const,
          },
        ],
        searchEntryPointHtml: undefined,
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(
        geminiRecommendations,
      );
      mockPlaceRecommendationRepository.create.mockImplementation(
        (data) => data as PlaceRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue(
        [] as unknown as PlaceRecommendation & PlaceRecommendation[],
      );

      const result = await service.recommendRestaurants(
        user,
        'query',
        '김치찌개',
        1,
        37.5012,
        127.0396,
      );

      // Verify create was called with empty reasonTags
      expect(mockPlaceRecommendationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ reasonTags: [] }),
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException with PLACE_RECOMMENDATION_SAVE_FAILED when save fails with non-Error', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const geminiRecommendations = {
        recommendations: [
          {
            placeId: 'gemini_12345678',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '좋아요',
            reasonTags: [] as string[],
            menuName: '김치찌개',
            source: 'GEMINI' as const,
          },
        ],
        searchEntryPointHtml: undefined,
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(
        geminiRecommendations,
      );
      mockPlaceRecommendationRepository.create.mockImplementation(
        (data) => data as PlaceRecommendation,
      );
      // Reject with a non-Error object to hit the String(error) branch
      mockPlaceRecommendationRepository.save.mockRejectedValue({
        code: 'DB_ERROR',
      });

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          1,
          37.5012,
          127.0396,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.PLACE_RECOMMENDATION_SAVE_FAILED,
          }),
        }),
      );
    });

    // Language forwarding consolidated into test.each
    describe('language forwarding to Gemini', () => {
      const makeGeminiResponse = () => ({
        recommendations: [
          {
            placeId: 'gemini_12345678',
            nameKo: '식당',
            nameEn: 'Restaurant',
            reason: '좋아요',
            reasonTags: [] as string[],
            menuName: '김치찌개',
            source: 'GEMINI' as const,
          },
        ],
        searchEntryPointHtml: undefined,
      });

      test.each([
        ['undefined preferredLanguage defaults to ko', undefined, 'ko'],
        ['ko preferredLanguage -> ko', 'ko', 'ko'],
        ['en preferredLanguage -> en', 'en', 'en'],
        ['invalid preferredLanguage defaults to ko', 'invalid', 'ko'],
      ] as Array<[string, string | undefined, string]>)(
        '%s',
        async (_label, preferredLanguage, expectedLang) => {
          const user = UserFactory.create({
            id: 1,
            preferredLanguage: preferredLanguage as 'ko' | 'en',
          });
          const menuRecord = MenuRecommendationFactory.create({
            id: 1,
            user,
            placeRecommendations: [],
            requestAddress: 'query',
          });

          mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
          mockGeminiPlacesService.recommendRestaurants.mockResolvedValue(
            makeGeminiResponse(),
          );
          mockPlaceRecommendationRepository.create.mockImplementation(
            (data) => data as PlaceRecommendation,
          );
          mockPlaceRecommendationRepository.save.mockResolvedValue(
            [] as unknown as PlaceRecommendation & PlaceRecommendation[],
          );

          await service.recommendRestaurants(
            user,
            'query',
            '김치찌개',
            1,
            37.5012,
            127.0396,
          );

          expect(
            mockGeminiPlacesService.recommendRestaurants,
          ).toHaveBeenCalledWith(
            '김치찌개',
            'query',
            37.5012,
            127.0396,
            expectedLang,
          );
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // buildRecommendationDetailResponse
  // ---------------------------------------------------------------------------

  describe('buildRecommendationDetailResponse', () => {
    it('should build detail response with place recommendations from DB', async () => {
      const user = UserFactory.create({ id: 1 });
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          id: 1,
          placeId: 'place-1',
          reason: '평점이 높습니다',
          menuName: '김치찌개',
          nameKo: '맛있는 식당',
          nameEn: 'Delicious Restaurant',
          nameLocal: null,
          addressKo: '서울시 강남구',
          addressEn: 'Gangnam-gu, Seoul',
          addressLocal: null,
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations,
      });

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      expect(mockGooglePlacesClient.getDetails).not.toHaveBeenCalled();
      expect(result.history.hasPlaceRecommendations).toBe(true);
      expect(result.places).toHaveLength(1);
      expect(result.places[0]).toEqual({
        placeId: 'place-1',
        reason: '평점이 높습니다',
        reasonTags: [],
        menuName: '김치찌개',
        name: '맛있는 식당',
        localizedName: 'Delicious Restaurant',
        address: '서울시 강남구',
        localizedAddress: 'Gangnam-gu, Seoul',
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [],
        reviews: null,
        source: PlaceRecommendationSource.GOOGLE,
      });
    });

    it('should return empty places when no place recommendations exist', async () => {
      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        placeRecommendations: [],
      });

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.history.hasPlaceRecommendations).toBe(false);
      expect(result.places).toEqual([]);
    });

    it('should handle undefined placeRecommendations array', async () => {
      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: undefined,
      });

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.history.hasPlaceRecommendations).toBe(false);
      expect(result.places).toEqual([]);
    });

    it('should include UserPlace details when placeId is user_place format', async () => {
      const userPlace: Partial<UserPlace> = {
        id: 456,
        name: '추천 식당',
        address: '서울시 강남구',
        latitude: 37.5,
        longitude: 127.0,
        phoneNumber: '02-9999-8888',
        category: '중식',
        menuTypes: ['짜장면', '짬뽕'],
        description: '맛있는 중식당',
        openingHours: '11:00-22:00',
        photos: ['https://example.com/user-photo.jpg'],
      };

      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          id: 1,
          placeId: 'user_place_456',
          reason: '집 근처에서 가장 맛있는 중식당',
          menuName: '짜장면',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        placeRecommendations,
      });

      mockUserPlaceRepository.find.mockResolvedValue([userPlace as UserPlace]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(mockUserPlaceRepository.find).toHaveBeenCalledWith({
        where: { id: In([456]) },
        withDeleted: false,
      });
      expect(result.places[0]).toEqual({
        placeId: 'user_place_456',
        reason: '집 근처에서 가장 맛있는 중식당',
        reasonTags: [],
        menuName: '짜장면',
        name: '추천 식당',
        localizedName: null,
        address: '서울시 강남구',
        localizedAddress: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: ['https://example.com/user-photo.jpg'],
        reviews: null,
        source: 'USER',
        phoneNumber: '02-9999-8888',
        category: '중식',
      });
    });

    it('should use DB fallback when UserPlace not found in map', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          id: 1,
          placeId: 'user_place_999',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      mockUserPlaceRepository.find.mockResolvedValue([]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].source).toBe(PlaceRecommendationSource.GOOGLE);
      expect(result.places[0].name).toBeNull();
    });

    it('should return empty photos array when UserPlace has null photos', async () => {
      const userPlace: Partial<UserPlace> = {
        id: 1,
        name: '식당',
        address: '서울시',
        latitude: 37.5,
        longitude: 127.0,
        phoneNumber: '02-1234-5678',
        category: '한식',
        menuTypes: ['김치찌개'],
        description: null,
        openingHours: null,
        photos: null,
      };

      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'user_place_1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      mockUserPlaceRepository.find.mockResolvedValue([userPlace as UserPlace]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].photos).toEqual([]);
    });

    it('should handle undefined placeRecommendations by defaulting to empty array', async () => {
      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        placeRecommendations: undefined,
      });

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      expect(result.history.hasPlaceRecommendations).toBe(false);
      expect(result.places).toEqual([]);
    });

    it('should use null for reasonTags when pr.reasonTags is null for UserPlace', async () => {
      const userPlace: Partial<UserPlace> = {
        id: 10,
        name: '식당',
        address: '서울시',
        latitude: 37.5,
        longitude: 127.0,
        phoneNumber: null,
        category: null,
        photos: [],
      };

      const placeRec = PlaceRecommendationFactory.create({
        placeId: 'user_place_10',
        reason: '추천',
        menuName: '김치찌개',
        reasonTags: null as unknown as string[],
      });

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: [placeRec],
      });

      mockUserPlaceRepository.find.mockResolvedValue([userPlace as UserPlace]);

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      expect(result.places[0].reasonTags).toEqual([]);
    });

    it('should use English names and addresses in buildDbFallbackPlaceResponse when language is en', async () => {
      const placeRec = PlaceRecommendationFactory.create({
        placeId: 'google-place-1',
        reason: '추천',
        menuName: '김치찌개',
        nameKo: '한국 식당',
        nameEn: 'Korean Restaurant',
        nameLocal: null,
        addressKo: '서울시 강남구',
        addressEn: 'Gangnam-gu, Seoul',
        addressLocal: null,
      });

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: [placeRec],
      });

      mockUserPlaceRepository.find.mockResolvedValue([]);

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'en',
      );

      expect(result.places[0].name).toBe('Korean Restaurant');
      expect(result.places[0].address).toBe('Gangnam-gu, Seoul');
      // localizedName for 'en' language should fallback to nameKo
      expect(result.places[0].localizedName).toBe('한국 식당');
      // localizedAddress for 'en' language should fallback to addressKo
      expect(result.places[0].localizedAddress).toBe('서울시 강남구');
    });

    it('should use nameLocal as localizedName when nameLocal is provided', async () => {
      const placeRec = PlaceRecommendationFactory.create({
        placeId: 'google-place-2',
        reason: '추천',
        menuName: '초밥',
        nameKo: '스시 식당',
        nameEn: 'Sushi Place',
        nameLocal: 'すし屋',
        addressKo: '서울시',
        addressEn: 'Seoul',
        addressLocal: 'ソウル市',
      });

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: [placeRec],
      });

      mockUserPlaceRepository.find.mockResolvedValue([]);

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      // nameLocal takes precedence over fallback
      expect(result.places[0].localizedName).toBe('すし屋');
      expect(result.places[0].localizedAddress).toBe('ソウル市');
    });

    it('should use source from PlaceRecommendation when source is set', async () => {
      const placeRec = PlaceRecommendationFactory.create({
        placeId: 'google-place-3',
        reason: '추천',
        menuName: '파스타',
        source: PlaceRecommendationSource.GEMINI,
        nameKo: null,
        nameEn: null,
      });

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: [placeRec],
      });

      mockUserPlaceRepository.find.mockResolvedValue([]);

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      expect(result.places[0].source).toBe(PlaceRecommendationSource.GEMINI);
    });

    it('should handle mixed UserPlace and Google Place recommendations', async () => {
      const userPlace: Partial<UserPlace> = {
        id: 100,
        name: '사용자 식당',
        address: '서울시 강남구',
        latitude: 37.5,
        longitude: 127.0,
        phoneNumber: '02-1111-2222',
        category: '한식',
        menuTypes: ['김치찌개'],
        description: null,
        openingHours: null,
        photos: [],
      };

      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'user_place_100',
          reason: '사용자 추천',
          menuName: '김치찌개',
        }),
        PlaceRecommendationFactory.create({
          placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
          reason: 'Google 추천',
          menuName: '된장찌개',
          nameKo: 'Google 식당',
          nameEn: 'Google Restaurant',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      mockUserPlaceRepository.find.mockResolvedValue([userPlace as UserPlace]);

      const result = await service.buildRecommendationDetailResponse(
        recommendation,
        'ko',
      );

      expect(result.places).toHaveLength(2);
      expect(result.places[0].source).toBe('USER');
      expect(result.places[0].name).toBe('사용자 식당');
      expect(result.places[1].source).toBe(PlaceRecommendationSource.GOOGLE);
      expect(result.places[1].name).toBe('Google 식당');
    });
  });
});
