import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MenuService } from '../menu.service';
import { MenuRecommendationService } from '../services/menu-recommendation.service';
import { MenuSelectionService } from '../services/menu-selection.service';
import { PlaceService } from '../services/place.service';
import { GeminiPlacesService } from '../services/gemini-places.service';
import { PlaceRecommendation } from '../entities/place-recommendation.entity';
import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';
import { RedisCacheService } from '@/common/cache/cache.service';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { createMockService } from '../../../test/utils/test-helpers';
import {
  UserFactory,
  MenuRecommendationFactory,
  MenuSelectionFactory,
} from '../../../test/factories/entity.factory';

describe('MenuService (Facade)', () => {
  let service: MenuService;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;
  let mockMenuSelectionService: jest.Mocked<MenuSelectionService>;
  let mockPlaceService: jest.Mocked<PlaceService>;

  beforeEach(async () => {
    mockMenuRecommendationService = {
      recommend: jest.fn(),
      getHistory: jest.fn(),
      findById: jest.fn(),
      findOwnedRecommendation: jest.fn(),
    } as unknown as jest.Mocked<MenuRecommendationService>;

    mockMenuSelectionService = {
      createSelection: jest.fn(),
      updateSelection: jest.fn(),
      getSelections: jest.fn(),
    } as unknown as jest.Mocked<MenuSelectionService>;

    mockPlaceService = {
      recommendRestaurants: jest.fn(),
      buildRecommendationDetailResponse: jest.fn(),
      searchRestaurantsWithGooglePlaces: jest.fn(),
      getPlaceDetail: jest.fn(),
      searchRestaurantBlogs: jest.fn(),
    } as unknown as jest.Mocked<PlaceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        {
          provide: getRepositoryToken(PlaceRecommendation),
          useValue: createMockRepository(),
        },
        {
          provide: MenuRecommendationService,
          useValue: mockMenuRecommendationService,
        },
        {
          provide: MenuSelectionService,
          useValue: mockMenuSelectionService,
        },
        {
          provide: PlaceService,
          useValue: mockPlaceService,
        },
        {
          provide: GeminiPlacesService,
          useValue: { recommendRestaurants: jest.fn() },
        },
        {
          provide: RedisCacheService,
          useValue: createMockService<RedisCacheService>([]),
        },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recommend', () => {
    it('should delegate to MenuRecommendationService.recommend', async () => {
      const user = UserFactory.create({ id: 1 });
      const prompt = '오늘 점심 추천해줘';
      const expectedResult = {
        id: 1,
        intro: '오늘은 따뜻한 찌개 요리가 어떠신가요?',
        recommendations: [
          { condition: '간단한 식사를 원하신다면', menu: '김치찌개' },
          { condition: '건강한 식사를 원하신다면', menu: '된장찌개' },
        ],
        closing: '맛있게 드세요!',
        recommendedAt: new Date(),
        requestAddress: '서울시 강남구',
      };

      mockMenuRecommendationService.recommend.mockResolvedValue(expectedResult);

      const result = await service.recommend(user, prompt);

      expect(mockMenuRecommendationService.recommend).toHaveBeenCalledWith(
        user,
        prompt,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getHistory', () => {
    it('should delegate to MenuRecommendationService.getHistory with all parameters', async () => {
      const user = UserFactory.create({ id: 1 });
      const page = 2;
      const limit = 20;
      const date = '2024-01-15';

      const expectedResult = {
        items: [],
        pageInfo: { page: 2, limit: 20, totalCount: 0, hasNext: false },
      };

      mockMenuRecommendationService.getHistory.mockResolvedValue(
        expectedResult,
      );

      const result = await service.getHistory(user, page, limit, date);

      expect(mockMenuRecommendationService.getHistory).toHaveBeenCalledWith(
        user,
        page,
        limit,
        date,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should use default pagination values when not provided', async () => {
      const user = UserFactory.create({ id: 1 });

      mockMenuRecommendationService.getHistory.mockResolvedValue({
        items: [],
        pageInfo: { page: 1, limit: 10, totalCount: 0, hasNext: false },
      });

      await service.getHistory(user);

      expect(mockMenuRecommendationService.getHistory).toHaveBeenCalledWith(
        user,
        1,
        10,
        undefined,
      );
    });
  });

  describe('createSelection', () => {
    it('should delegate to MenuSelectionService.createSelection', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'lunch', name: '된장찌개' },
      ];
      const historyId = 5;

      const expectedSelection = MenuSelectionFactory.create({
        id: 1,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionService.createSelection.mockResolvedValue(
        expectedSelection,
      );

      const result = await service.createSelection(user, menus, historyId);

      expect(mockMenuSelectionService.createSelection).toHaveBeenCalledWith(
        user,
        menus,
        historyId,
      );
      expect(result).toEqual(expectedSelection);
    });

    it('should work without historyId', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'breakfast', name: '김치찌개' }];

      mockMenuSelectionService.createSelection.mockResolvedValue(
        MenuSelectionFactory.create(),
      );

      await service.createSelection(user, menus);

      expect(mockMenuSelectionService.createSelection).toHaveBeenCalledWith(
        user,
        menus,
        undefined,
      );
    });
  });

  describe('updateSelection', () => {
    it('should delegate to MenuSelectionService.updateSelection', async () => {
      const user = UserFactory.create({ id: 1 });
      const selectionId = 10;
      const dto = { breakfast: ['순두부찌개'] };

      const expectedSelection = MenuSelectionFactory.create({
        id: 10,
        menuPayload: {
          breakfast: ['순두부찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionService.updateSelection.mockResolvedValue(
        expectedSelection,
      );

      const result = await service.updateSelection(user, selectionId, dto);

      expect(mockMenuSelectionService.updateSelection).toHaveBeenCalledWith(
        user,
        selectionId,
        dto,
      );
      expect(result).toEqual(expectedSelection);
    });
  });

  describe('getSelections', () => {
    it('should delegate to MenuSelectionService.getSelections', async () => {
      const user = UserFactory.create({ id: 1 });
      const selectedDate = '2024-01-15';

      const expectedSelections = [
        {
          id: 1,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
          selectedDate: '2024-01-15',
        },
      ];

      mockMenuSelectionService.getSelections.mockResolvedValue(
        expectedSelections,
      );

      const result = await service.getSelections(user, selectedDate);

      expect(mockMenuSelectionService.getSelections).toHaveBeenCalledWith(
        user,
        selectedDate,
      );
      expect(result).toEqual(expectedSelections);
    });

    it('should work without selectedDate parameter', async () => {
      const user = UserFactory.create({ id: 1 });

      mockMenuSelectionService.getSelections.mockResolvedValue([]);

      await service.getSelections(user);

      expect(mockMenuSelectionService.getSelections).toHaveBeenCalledWith(
        user,
        undefined,
      );
    });
  });

  describe('recommendRestaurants', () => {
    it('should delegate to PlaceService.recommendRestaurants', async () => {
      const user = UserFactory.create({ id: 1 });
      const textQuery = '강남역 김치찌개';
      const menuName = '김치찌개';
      const menuRecommendationId = 1;

      const expectedResult = {
        recommendations: [
          {
            placeId: 'place-1',
            nameKo: '맛있는 식당',
            nameEn: 'Delicious Restaurant',
            nameLocal: null,
            reason: '평점이 높습니다',
            reasonTags: ['맛집', '인기'],
            source: 'GEMINI' as const,
          },
        ],
      };

      mockPlaceService.recommendRestaurants.mockResolvedValue(expectedResult);

      const result = await service.recommendRestaurants(
        user,
        textQuery,
        menuName,
        menuRecommendationId,
      );

      expect(mockPlaceService.recommendRestaurants).toHaveBeenCalledWith(
        user,
        textQuery,
        menuName,
        menuRecommendationId,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getRecommendationDetail', () => {
    it('should fetch recommendation and build detail response', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendationId = 1;

      const recommendation = MenuRecommendationFactory.create({ id: 1, user });
      const expectedDetail = {
        history: {
          id: 1,
          prompt: '오늘 점심 추천해줘',
          intro: '오늘은 따뜻한 찌개 요리가 어떠신가요?',
          recommendations: [
            { condition: '간단한 식사를 원하신다면', menu: '김치찌개' },
          ],
          closing: '맛있게 드세요!',
          recommendedAt: new Date(),
          requestAddress: '서울시 강남구',
          hasPlaceRecommendations: true,
        },
        places: [
          {
            placeId: 'place-1',
            reason: '평점이 높습니다',
            reasonTags: [],
            menuName: '김치찌개',
            name: '맛있는 식당',
            localizedName: null,
            address: '서울시 강남구',
            localizedAddress: null,
            rating: 4.5,
            userRatingCount: 100,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            businessStatus: 'OPERATIONAL',
            openNow: true,
            photos: ['https://example.com/photo1.jpg'],
            reviews: [
              {
                rating: 5,
                text: '맛있어요',
                authorName: '홍길동',
                publishTime: '2024-01-01',
              },
            ],
            source: PlaceRecommendationSource.GOOGLE,
          },
        ],
      };

      mockMenuRecommendationService.findById.mockResolvedValue(recommendation);
      mockPlaceService.buildRecommendationDetailResponse.mockResolvedValue(
        expectedDetail as any,
      );

      const result = await service.getRecommendationDetail(
        user,
        recommendationId,
      );

      expect(mockMenuRecommendationService.findById).toHaveBeenCalledWith(
        recommendationId,
        user,
      );
      expect(
        mockPlaceService.buildRecommendationDetailResponse,
      ).toHaveBeenCalledWith(recommendation, 'ko');
      expect(result).toEqual(expectedDetail);
    });
  });

  describe('searchRestaurantsWithGooglePlaces', () => {
    it('should delegate to PlaceService.searchRestaurantsWithGooglePlaces', async () => {
      const textQuery = '강남역 맛집';
      const expectedPlaces = {
        places: [
          {
            id: 'place-1',
            name: '맛있는 식당',
            rating: 4.5,
            userRatingCount: 100,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            reviews: [],
          },
        ],
      };

      mockPlaceService.searchRestaurantsWithGooglePlaces.mockResolvedValue(
        expectedPlaces,
      );

      const result = await service.searchRestaurantsWithGooglePlaces(textQuery);

      expect(
        mockPlaceService.searchRestaurantsWithGooglePlaces,
      ).toHaveBeenCalledWith(textQuery, undefined, undefined, undefined);
      expect(result).toEqual(expectedPlaces);
    });
  });

  describe('getPlaceDetail', () => {
    it('should delegate to PlaceService.getPlaceDetail', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      const expectedDetail = {
        place: {
          id: placeId,
          name: '맛있는 식당',
          localizedName: null,
          address: '서울시 강남구',
          localizedAddress: null,
          location: { latitude: 37.5, longitude: 127.0 },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          businessStatus: 'OPERATIONAL',
          openNow: true,
          photos: [],
          reviews: [],
          source: PlaceRecommendationSource.GOOGLE,
        },
      };

      mockPlaceService.getPlaceDetail.mockResolvedValue(expectedDetail);

      const result = await service.getPlaceDetail(placeId);

      expect(mockPlaceService.getPlaceDetail).toHaveBeenCalledWith(
        placeId,
        'ko',
      );
      expect(result).toEqual(expectedDetail);
    });
  });

  describe('searchRestaurantBlogs', () => {
    it('should delegate to PlaceService.searchRestaurantBlogs', async () => {
      const query = '강남역 맛집';
      const restaurantName = '맛있는 식당';
      const expectedBlogs = {
        blogs: [
          {
            title: '맛집 리뷰',
            url: 'https://blog.example.com/post1',
            snippet: '정말 맛있어요',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            source: 'Example Blog',
          },
        ],
      };

      mockPlaceService.searchRestaurantBlogs.mockResolvedValue(expectedBlogs);

      const result = await service.searchRestaurantBlogs(query, restaurantName);

      expect(mockPlaceService.searchRestaurantBlogs).toHaveBeenCalledWith(
        query,
        restaurantName,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(expectedBlogs);
    });
  });
});
