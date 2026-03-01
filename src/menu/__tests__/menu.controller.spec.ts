import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MenuController } from '../menu.controller';
import { MenuService } from '../menu.service';
import { UserService } from '@/user/user.service';
import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';
import { PlaceService } from '../services/place.service';
import { CommunityPlaceService } from '../services/community-place.service';
import { MenuRecommendationService } from '../services/menu-recommendation.service';
import {
  UserFactory,
  MenuSelectionFactory,
  MenuRecommendationFactory,
} from '../../../test/factories/entity.factory';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { MenuSlot } from '../dto/create-menu-selection.dto';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { GeminiPlaceRecommendationsResponse } from '../interfaces/gemini-places.interface';
import { RecommendPlacesV2Dto } from '../dto/recommend-places-v2.dto';
import { SearchRestaurantBlogsDto } from '../dto/search-restaurant-blogs.dto';

describe('MenuController', () => {
  let controller: MenuController;
  let mockMenuService: jest.Mocked<MenuService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockPlaceService: jest.Mocked<PlaceService>;
  let mockCommunityPlaceService: jest.Mocked<CommunityPlaceService>;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;

  const mockAuthUser: AuthUserPayload = {
    sub: 1,
    email: 'test@example.com',
    role: 'USER',
  };

  function createMockResponse(): jest.Mocked<Response> {
    const res = new EventEmitter() as unknown as jest.Mocked<Response>;
    res.setHeader = jest.fn().mockReturnThis();
    res.flushHeaders = jest.fn();
    res.write = jest.fn().mockReturnValue(true);
    res.end = jest.fn();
    Object.defineProperty(res, 'writableEnded', {
      get: jest.fn().mockReturnValue(false),
      configurable: true,
    });
    return res;
  }

  function createMockRequest(): jest.Mocked<Request> {
    const req = new EventEmitter() as unknown as jest.Mocked<Request>;
    req.removeListener = jest.fn();
    return req;
  }

  beforeEach(async () => {
    mockMenuService = {
      recommend: jest.fn(),
      createSelection: jest.fn(),
      getSelections: jest.fn(),
      updateSelection: jest.fn(),
      getHistory: jest.fn(),
      getRecommendationDetail: jest.fn(),
      recommendRestaurants: jest.fn(),
      recommendPlacesWithGemini: jest.fn(),
      searchRestaurantBlogs: jest.fn(),
      getPlaceDetail: jest.fn(),
    } as unknown as jest.Mocked<MenuService>;

    mockUserService = {
      getAuthenticatedEntity: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    mockPlaceService = {
      recommendRestaurants: jest.fn(),
    } as unknown as jest.Mocked<PlaceService>;

    mockCommunityPlaceService = {
      recommendCommunityPlaces: jest.fn(),
    } as unknown as jest.Mocked<CommunityPlaceService>;

    mockMenuRecommendationService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<MenuRecommendationService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [
        { provide: MenuService, useValue: mockMenuService },
        { provide: UserService, useValue: mockUserService },
        { provide: PlaceService, useValue: mockPlaceService },
        { provide: CommunityPlaceService, useValue: mockCommunityPlaceService },
        {
          provide: MenuRecommendationService,
          useValue: mockMenuRecommendationService,
        },
      ],
    }).compile();

    controller = module.get<MenuController>(MenuController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // recommend
  // ─────────────────────────────────────────────
  describe('recommend', () => {
    it('should call service with user entity and prompt and return result', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const recommendDto = { prompt: '오늘 점심 추천해줘' };
      const expectedResult = {
        id: 1,
        intro: '오늘은 한식이 생각나는 날씨네요',
        recommendations: [
          { condition: '든든하게 먹고 싶다면', menu: '김치찌개' },
        ],
        closing: '맛있게 드세요!',
        recommendedAt: new Date(),
        requestAddress: '서울시 강남구',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue(expectedResult);

      const result = await controller.recommend(recommendDto, mockAuthUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockMenuService.recommend).toHaveBeenCalledWith(
        user,
        recommendDto.prompt,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should propagate error when userService throws', async () => {
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.recommend({ prompt: '추천해줘' }, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // createSelection
  // ─────────────────────────────────────────────
  describe('createSelection', () => {
    it('should call service and return normalized selection response', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const createDto = {
        menus: [
          { slot: MenuSlot.BREAKFAST, name: '김치찌개' },
          { slot: MenuSlot.LUNCH, name: '된장찌개' },
        ],
        historyId: 5,
      };
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        menuRecommendation: MenuRecommendationFactory.create({ id: 5 }),
      });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.createSelection.mockResolvedValue(selection);

      const result = await controller.createSelection(createDto, mockAuthUser);

      expect(mockMenuService.createSelection).toHaveBeenCalledWith(
        user,
        createDto.menus,
        createDto.historyId,
      );
      expect(result).toEqual({
        selection: {
          id: 1,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['된장찌개'],
            dinner: [],
            etc: [],
          },
          selectedDate: expect.any(String),
          historyId: 5,
        },
      });
    });

    it('should normalize invalid or missing menuPayload slots to empty arrays', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const createDto = {
        menus: [{ slot: MenuSlot.BREAKFAST, name: '김치찌개' }],
      };

      const selection = MenuSelectionFactory.create({ id: 1, user });
      selection.menuPayload = {
        breakfast: ['김치찌개'],
        lunch: null as unknown as string[],
        dinner: undefined as unknown as string[],
        etc: 'invalid' as unknown as string[],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.createSelection.mockResolvedValue(selection);

      const result = await controller.createSelection(createDto, mockAuthUser);

      expect(result.selection.menuPayload).toEqual({
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should set historyId to null when menuRecommendation is not linked', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const createDto = {
        menus: [{ slot: MenuSlot.BREAKFAST, name: '김치찌개' }],
      };
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuRecommendation: null,
      });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.createSelection.mockResolvedValue(selection);

      const result = await controller.createSelection(createDto, mockAuthUser);

      expect(result.selection.historyId).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSelections
  // ─────────────────────────────────────────────
  describe('getSelections', () => {
    it('should call service with user entity and date and return selections', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const selections = [
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

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getSelections.mockResolvedValue(selections);

      const result = await controller.getSelections('2024-01-15', mockAuthUser);

      expect(mockMenuService.getSelections).toHaveBeenCalledWith(
        user,
        '2024-01-15',
      );
      expect(result).toEqual({ selections });
    });

    it('should pass undefined date when no date query param is provided', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getSelections.mockResolvedValue([]);

      const result = await controller.getSelections(undefined, mockAuthUser);

      expect(mockMenuService.getSelections).toHaveBeenCalledWith(
        user,
        undefined,
      );
      expect(result).toEqual({ selections: [] });
    });
  });

  // ─────────────────────────────────────────────
  // updateSelection
  // ─────────────────────────────────────────────
  describe('updateSelection', () => {
    it('should parse selection id and call service with parsed numeric id', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const updateDto = { breakfast: ['순두부찌개', '된장찌개'] };
      const updatedSelection = MenuSelectionFactory.create({
        id: 10,
        user,
        menuPayload: {
          breakfast: ['순두부찌개', '된장찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.updateSelection.mockResolvedValue(updatedSelection);

      const result = await controller.updateSelection(
        '10',
        updateDto,
        mockAuthUser,
      );

      expect(mockMenuService.updateSelection).toHaveBeenCalledWith(
        user,
        10,
        updateDto,
      );
      expect(result.selection.menuPayload.breakfast).toEqual([
        '순두부찌개',
        '된장찌개',
      ]);
    });

    it('should throw BadRequestException for non-numeric selection ID', async () => {
      const updateDto = { breakfast: ['김치찌개'] };

      await expect(
        controller.updateSelection('invalid-id', updateDto, mockAuthUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for NaN-like selection ID such as "abc123"', async () => {
      await expect(
        controller.updateSelection('abc123', {}, mockAuthUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  // getHistory
  // ─────────────────────────────────────────────
  describe('getHistory', () => {
    it('should call service with pagination params and return history', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const query = { page: 2, limit: 20, date: '2024-01-15' };
      const expectedResult = {
        items: [
          {
            id: 1,
            recommendations: ['김치찌개', '된장찌개'],
            reason: '추천 이유',
            prompt: '점심 추천',
            recommendedAt: new Date(),
            requestAddress: '서울시',
            hasPlaceRecommendations: false,
          },
        ],
        pageInfo: { page: 2, limit: 20, totalCount: 1, hasNext: false },
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getHistory.mockResolvedValue(expectedResult);

      const result = await controller.getHistory(query, mockAuthUser);

      expect(mockMenuService.getHistory).toHaveBeenCalledWith(
        user,
        query.page,
        query.limit,
        query.date,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  // ─────────────────────────────────────────────
  // searchRestaurantBlogs
  // ─────────────────────────────────────────────
  describe('searchRestaurantBlogs', () => {
    it('should delegate to service and return blog results', async () => {
      const query = { query: '강남역 맛집', restaurantName: '맛있는 식당' };
      const expectedBlogs = {
        blogs: [
          {
            title: '맛집 리뷰',
            url: 'https://blog.example.com',
            snippet: '정말 맛있어요',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            source: 'Example Blog',
          },
        ],
      };

      mockMenuService.searchRestaurantBlogs.mockResolvedValue(expectedBlogs);

      const result = await controller.searchRestaurantBlogs(query);

      expect(mockMenuService.searchRestaurantBlogs).toHaveBeenCalledWith(
        query.query,
        query.restaurantName,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(expectedBlogs);
    });

    it('should pass all optional fields when provided', async () => {
      const dto: SearchRestaurantBlogsDto = {
        query: '강남 스시',
        restaurantName: '스시야',
        language: 'en',
        searchName: 'Sushi Ya',
        searchAddress: '123 Gangnam Ave',
      };
      mockMenuService.searchRestaurantBlogs.mockResolvedValue({ blogs: [] });

      await controller.searchRestaurantBlogs(dto);

      expect(mockMenuService.searchRestaurantBlogs).toHaveBeenCalledWith(
        dto.query,
        dto.restaurantName,
        dto.language,
        dto.searchName,
        dto.searchAddress,
      );
    });
  });

  // ─────────────────────────────────────────────
  // recommendSearchPlaces
  // ─────────────────────────────────────────────
  describe('recommendSearchPlaces', () => {
    it('should return mapped place recommendation response for Korean language user', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto = {
        menuRecommendationId: 1,
        menuName: '김치찌개',
        latitude: 37.5,
        longitude: 127.0,
      };
      const menuRecommendation = MenuRecommendationFactory.create({ id: 1 });
      const geminiResult: GeminiPlaceRecommendationsResponse = {
        recommendations: [
          {
            placeId: 'place-123',
            nameKo: '한식당',
            nameEn: 'Korean Restaurant',
            nameLocal: null,
            reason: '맛있고 가까워요',
            reasonTags: ['맛집', '가성비'],
            menuName: '김치찌개',
            source: 'GEMINI',
            addressKo: '서울시 강남구',
            addressEn: 'Gangnam, Seoul',
            addressLocal: null,
            location: { latitude: 37.5, longitude: 127.0 },
            searchName: '한식당',
            searchAddress: '서울시 강남구',
          },
        ],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        menuRecommendation,
      );
      mockPlaceService.recommendRestaurants.mockResolvedValue(geminiResult);

      const result = await controller.recommendSearchPlaces(dto, mockAuthUser);

      expect(mockMenuRecommendationService.findById).toHaveBeenCalledWith(
        dto.menuRecommendationId,
        user,
      );
      expect(mockPlaceService.recommendRestaurants).toHaveBeenCalledWith(
        user,
        dto.menuName,
        dto.menuName,
        dto.menuRecommendationId,
        dto.latitude,
        dto.longitude,
      );
      expect(result.recommendations[0]).toMatchObject({
        placeId: 'place-123',
        name: '한식당',
        reason: '맛있고 가까워요',
        reasonTags: ['맛집', '가성비'],
        source: PlaceRecommendationSource.GEMINI,
        address: '서울시 강남구',
      });
    });

    it('should use English names for English language user', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'en',
      });
      const dto = {
        menuRecommendationId: 2,
        menuName: 'Kimchi Stew',
        latitude: 37.5,
        longitude: 127.0,
      };
      const geminiResult: GeminiPlaceRecommendationsResponse = {
        recommendations: [
          {
            placeId: 'place-456',
            nameKo: '한식당',
            nameEn: 'Korean Restaurant',
            reason: 'Great food',
            reasonTags: [],
            source: 'GEMINI',
            addressKo: '서울시',
            addressEn: 'Seoul',
          },
        ],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 2 }),
      );
      mockPlaceService.recommendRestaurants.mockResolvedValue(geminiResult);

      const result = await controller.recommendSearchPlaces(dto, mockAuthUser);

      expect(result.recommendations[0].name).toBe('Korean Restaurant');
      expect(result.recommendations[0].address).toBe('Seoul');
    });

    it('should propagate NotFoundException when menuRecommendation not found', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockRejectedValue(
        new NotFoundException('MenuRecommendation not found'),
      );

      await expect(
        controller.recommendSearchPlaces(
          {
            menuRecommendationId: 999,
            menuName: '파스타',
            latitude: 0,
            longitude: 0,
          },
          mockAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // recommendCommunityPlaces
  // ─────────────────────────────────────────────
  describe('recommendCommunityPlaces', () => {
    it('should return mapped community place recommendations', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const menuRecommendation = MenuRecommendationFactory.create({ id: 3 });
      const dto = {
        menuRecommendationId: 3,
        menuName: '파스타',
        latitude: 37.5,
        longitude: 127.0,
      };
      const placeRecommendations = [
        {
          placeId: 'user-place-1',
          reason: '가까운 단골집',
          reasonTags: ['단골', '가깝다'],
          menuName: '파스타',
          source: PlaceRecommendationSource.USER,
          userPlace: { id: 10, name: '이탈리안 레스토랑' },
        },
      ];

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        menuRecommendation,
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        placeRecommendations as never,
      );

      const result = await controller.recommendCommunityPlaces(
        dto,
        mockAuthUser,
      );

      expect(
        mockCommunityPlaceService.recommendCommunityPlaces,
      ).toHaveBeenCalledWith(
        user,
        dto.latitude,
        dto.longitude,
        dto.menuName,
        menuRecommendation,
        'ko',
      );
      expect(result.recommendations[0]).toMatchObject({
        placeId: 'user-place-1',
        name: '이탈리안 레스토랑',
        reason: '가까운 단골집',
        reasonTags: ['단골', '가깝다'],
        menuName: '파스타',
        source: PlaceRecommendationSource.USER,
        userPlaceId: 10,
      });
    });

    it('should use empty string for name when userPlace is null', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto = {
        menuRecommendationId: 1,
        menuName: '라면',
        latitude: 37.5,
        longitude: 127.0,
      };
      const placeRecommendations = [
        {
          placeId: 'place-no-userplace',
          reason: '추천',
          reasonTags: null,
          menuName: null,
          source: PlaceRecommendationSource.USER,
          userPlace: null,
        },
      ];

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        placeRecommendations as never,
      );

      const result = await controller.recommendCommunityPlaces(
        dto,
        mockAuthUser,
      );

      expect(result.recommendations[0].name).toBe('');
      expect(result.recommendations[0].reasonTags).toEqual([]);
      expect(result.recommendations[0].menuName).toBeUndefined();
      expect(result.recommendations[0].userPlaceId).toBeUndefined();
    });

    it('should use dto language when provided', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto = {
        menuRecommendationId: 1,
        menuName: 'Pasta',
        latitude: 37.5,
        longitude: 127.0,
        language: 'en',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        [] as never,
      );

      await controller.recommendCommunityPlaces(dto, mockAuthUser);

      expect(
        mockCommunityPlaceService.recommendCommunityPlaces,
      ).toHaveBeenCalledWith(
        user,
        dto.latitude,
        dto.longitude,
        dto.menuName,
        expect.anything(),
        'en',
      );
    });
  });

  // ─────────────────────────────────────────────
  // recommendPlacesV2
  // ─────────────────────────────────────────────
  describe('recommendPlacesV2', () => {
    it('should return gemini response with extra fields for Korean user', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto: RecommendPlacesV2Dto = {
        menuRecommendationId: 1,
        menuName: '초밥',
        address: '서울시 마포구',
        latitude: 37.5,
        longitude: 127.0,
      };
      const geminiResult: GeminiPlaceRecommendationsResponse = {
        recommendations: [
          {
            placeId: 'place-v2',
            nameKo: '스시집',
            nameEn: 'Sushi Place',
            reason: '신선해요',
            reasonTags: ['신선', '청결'],
            menuName: '초밥',
            source: 'GEMINI',
            addressKo: '서울시 마포구',
            addressEn: 'Mapo, Seoul',
          },
        ],
        searchEntryPointHtml: '<div>search entry</div>',
        googleMapsWidgetContextToken: 'token-abc',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommendPlacesWithGemini.mockResolvedValue(geminiResult);

      const result = await controller.recommendPlacesV2(dto, mockAuthUser);

      expect(mockMenuService.recommendPlacesWithGemini).toHaveBeenCalledWith(
        dto,
        user.id,
      );
      expect(result.searchEntryPointHtml).toBe('<div>search entry</div>');
      expect(result.googleMapsWidgetContextToken).toBe('token-abc');
      expect(result.recommendations[0].name).toBe('스시집');
    });
  });

  // ─────────────────────────────────────────────
  // getRecommendationDetail
  // ─────────────────────────────────────────────
  describe('getRecommendationDetail', () => {
    it('should parse recommendation id and return detail', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const expectedDetail = {
        history: {
          hasPlaceRecommendations: true,
          id: 1,
          prompt: '점심 추천',
          intro: '오늘은 한식이 어울리는 날씨네요',
          recommendations: [
            { condition: '든든하게 먹고 싶다면', menu: '김치찌개' },
          ],
          closing: '맛있게 드세요!',
          recommendedAt: new Date(),
          requestAddress: '서울시',
        },
        places: [
          {
            placeId: 'place-1',
            reason: '평점이 높습니다',
            reasonTags: ['맛집', '청결'],
            menuName: null,
            name: '맛있는 식당',
            localizedName: null,
            address: '서울시 강남구',
            localizedAddress: null,
            rating: null,
            userRatingCount: null,
            priceLevel: null,
            businessStatus: null,
            openNow: null,
            photos: [],
            reviews: null,
            source: PlaceRecommendationSource.GOOGLE,
            phoneNumber: null,
            category: null,
          },
        ],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getRecommendationDetail.mockResolvedValue(expectedDetail);

      const result = await controller.getRecommendationDetail(
        '1',
        mockAuthUser,
      );

      expect(mockMenuService.getRecommendationDetail).toHaveBeenCalledWith(
        user,
        1,
      );
      expect(result).toEqual(expectedDetail);
    });

    it('should throw BadRequestException for non-numeric recommendation ID', async () => {
      await expect(
        controller.getRecommendationDetail('invalid-id', mockAuthUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for NaN ID like "abc"', async () => {
      await expect(
        controller.getRecommendationDetail('abc', mockAuthUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  // getPlaceDetail
  // ─────────────────────────────────────────────
  describe('getPlaceDetail', () => {
    it('should call service with placeId and language and return detail', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      const user = UserFactory.create({ email: mockAuthUser.email });
      const expectedDetail = {
        place: {
          id: placeId,
          name: '맛있는 식당',
          address: '서울시 강남구',
          localizedName: null,
          localizedAddress: null,
          location: { latitude: 37.5, longitude: 127.0 },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          businessStatus: 'OPERATIONAL',
          openNow: true,
          photos: ['https://example.com/photo1.jpg'],
          reviews: [],
          source: PlaceRecommendationSource.GOOGLE,
        },
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getPlaceDetail.mockResolvedValue(expectedDetail);

      const result = await controller.getPlaceDetail(placeId, mockAuthUser);

      expect(mockMenuService.getPlaceDetail).toHaveBeenCalledWith(
        placeId,
        'ko',
      );
      expect(result).toEqual(expectedDetail);
    });

    it('should pass "en" language for English language user', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'en',
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getPlaceDetail.mockResolvedValue({ place: null });

      await controller.getPlaceDetail('some-place-id', mockAuthUser);

      expect(mockMenuService.getPlaceDetail).toHaveBeenCalledWith(
        'some-place-id',
        'en',
      );
    });
  });

  // ─────────────────────────────────────────────
  // recommendStream (SSE)
  // ─────────────────────────────────────────────
  describe('recommendStream', () => {
    it('should set SSE headers and send result event on success', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const recommendDto = { prompt: '저녁 추천' };
      const recommendResult = {
        id: 10,
        recommendations: [{ condition: '든든하게', menu: '비빔밥' }],
        intro: '안녕하세요',
        closing: '즐거운 저녁 되세요',
        recommendedAt: new Date(),
        requestAddress: '서울시',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue(recommendResult);

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendStream(recommendDto, mockAuthUser, req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const resultEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"result"'),
      );
      expect(resultEvent).toBeDefined();
    });

    it('should send error event when recommend throws a non-abort error', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockRejectedValue(new Error('OpenAI error'));

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should call res.end in finally block', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue({
        id: 1,
        recommendations: [],
        intro: '',
        closing: '',
        recommendedAt: new Date(),
        requestAddress: '',
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      expect(res.end).toHaveBeenCalled();
    });

    it('should handle userService error and send error SSE event', async () => {
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new Error('Auth error'),
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('should not send error event when error is thrown but res.writableEnded is true', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockRejectedValue(new Error('Late error'));

      const req = createMockRequest();
      const res = createMockResponse();
      // Override writableEnded to return true (response already finished)
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeUndefined();
    });

    it('should send error event with "Unknown error" message when thrown error is not an Error instance', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      // Throw a non-Error (string) from recommend
      mockMenuService.recommend.mockRejectedValue('string error');

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"message":"Unknown error"'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should not call abortController.abort in closeHandler when writableEnded is true', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue({
        id: 1,
        recommendations: [],
        intro: '',
        closing: '',
        recommendedAt: new Date(),
        requestAddress: '',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      // Make writableEnded true so closeHandler branch (!res.writableEnded) is false
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      // If writableEnded is true at close, abort should NOT have been called via closeHandler
      // (the test verifies the false branch of !res.writableEnded inside closeHandler)
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should trigger timeout error event when writableEnded is false during timeout', async () => {
      jest.useFakeTimers();
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      // Make recommend never resolve so timeout fires first
      mockMenuService.recommend.mockReturnValue(new Promise(() => {}));

      const req = createMockRequest();
      const res = createMockResponse();

      const streamPromise = controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      // Advance timer past SSE_CONFIG.SERVER_TIMEOUT_MS
      jest.advanceTimersByTime(300000);
      await Promise.resolve(); // flush micro-tasks

      jest.useRealTimers();
      // abort the pending recommend to let the stream finish
      streamPromise.catch(() => {});
    });

    it('should not call res.end when res.writableEnded is already true in finally block', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue({
        id: 1,
        recommendations: [],
        intro: '',
        closing: '',
        recommendedAt: new Date(),
        requestAddress: '',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      // Make writableEnded always true so res.end should not be called
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendStream(
        { prompt: '추천' },
        mockAuthUser,
        req,
        res,
      );

      expect(res.end).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // recommendSearchPlacesStream (SSE)
  // ─────────────────────────────────────────────
  describe('recommendSearchPlacesStream', () => {
    it('should set SSE headers and send result event on success', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto = {
        menuRecommendationId: 1,
        menuName: '짜장면',
        latitude: 37.5,
        longitude: 127.0,
      };
      const geminiResult: GeminiPlaceRecommendationsResponse = {
        recommendations: [
          {
            placeId: 'stream-place-1',
            nameKo: '중국집',
            nameEn: 'Chinese Restaurant',
            reason: '맛있어요',
            reasonTags: [],
            source: 'GEMINI',
          },
        ],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockPlaceService.recommendRestaurants.mockResolvedValue(geminiResult);

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendSearchPlacesStream(dto, mockAuthUser, req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      const writeCalls = (res.write as jest.Mock).mock.calls;
      const resultEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"result"'),
      );
      expect(resultEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('should send error event when placeService throws', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto = {
        menuRecommendationId: 1,
        menuName: '라면',
        latitude: 37.5,
        longitude: 127.0,
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockPlaceService.recommendRestaurants.mockRejectedValue(
        new Error('Gemini error'),
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendSearchPlacesStream(dto, mockAuthUser, req, res);

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('should send error event when menuRecommendation not found', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendSearchPlacesStream(
        {
          menuRecommendationId: 999,
          menuName: '파스타',
          latitude: 0,
          longitude: 0,
        },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should not send error event when res.writableEnded is true during error', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockRejectedValue(
        new Error('Late error'),
      );

      const req = createMockRequest();
      const res = createMockResponse();
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendSearchPlacesStream(
        {
          menuRecommendationId: 1,
          menuName: '라면',
          latitude: 0,
          longitude: 0,
        },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeUndefined();
    });

    it('should not abort in closeHandler when writableEnded is true for search stream', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto = {
        menuRecommendationId: 1,
        menuName: '라면',
        latitude: 37.5,
        longitude: 127.0,
      };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockPlaceService.recommendRestaurants.mockResolvedValue({
        recommendations: [],
      });

      const req = createMockRequest();
      const res = createMockResponse();
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendSearchPlacesStream(dto, mockAuthUser, req, res);

      // writableEnded=true means closeHandler won't abort, and res.end won't be called
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should send "Unknown error" when non-Error is thrown from placeService', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 1 }),
      );
      mockPlaceService.recommendRestaurants.mockRejectedValue(
        'raw string error',
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendSearchPlacesStream(
        {
          menuRecommendationId: 1,
          menuName: '라면',
          latitude: 0,
          longitude: 0,
        },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"message":"Unknown error"'),
      );
      expect(errorEvent).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // recommendCommunityPlacesStream (SSE)
  // ─────────────────────────────────────────────
  describe('recommendCommunityPlacesStream', () => {
    it('should set SSE headers and send result event on success', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const menuRecommendation = MenuRecommendationFactory.create({ id: 5 });
      const dto = {
        menuRecommendationId: 5,
        menuName: '치킨',
        latitude: 37.5,
        longitude: 127.0,
      };
      const placeRecommendations = [
        {
          placeId: 'community-place-1',
          reason: '단골집',
          reasonTags: ['맛집'],
          menuName: '치킨',
          source: PlaceRecommendationSource.USER,
          userPlace: { id: 20, name: '치킨집' },
        },
      ];

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        menuRecommendation,
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        placeRecommendations as never,
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendCommunityPlacesStream(
        dto,
        mockAuthUser,
        req,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      const writeCalls = (res.write as jest.Mock).mock.calls;
      const resultEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"result"'),
      );
      expect(resultEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('should send error event when communityPlaceService throws', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto = {
        menuRecommendationId: 5,
        menuName: '피자',
        latitude: 37.5,
        longitude: 127.0,
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 5 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockRejectedValue(
        new Error('Community place error'),
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendCommunityPlacesStream(
        dto,
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('should use entity language when dto.language is not provided', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'en',
      });
      const dto = {
        menuRecommendationId: 5,
        menuName: 'Chicken',
        latitude: 37.5,
        longitude: 127.0,
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 5 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        [] as never,
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendCommunityPlacesStream(
        dto,
        mockAuthUser,
        req,
        res,
      );

      expect(
        mockCommunityPlaceService.recommendCommunityPlaces,
      ).toHaveBeenCalledWith(
        user,
        dto.latitude,
        dto.longitude,
        dto.menuName,
        expect.anything(),
        'en',
      );
    });

    it('should not send error event when res.writableEnded is true during community stream error', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockRejectedValue(
        new Error('Late community error'),
      );

      const req = createMockRequest();
      const res = createMockResponse();
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendCommunityPlacesStream(
        {
          menuRecommendationId: 5,
          menuName: '피자',
          latitude: 0,
          longitude: 0,
        },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"type":"error"'),
      );
      expect(errorEvent).toBeUndefined();
    });

    it('should send "Unknown error" when non-Error is thrown from communityPlaceService', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 5 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockRejectedValue(
        'non error string',
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await controller.recommendCommunityPlacesStream(
        {
          menuRecommendationId: 5,
          menuName: '피자',
          latitude: 0,
          longitude: 0,
        },
        mockAuthUser,
        req,
        res,
      );

      const writeCalls = (res.write as jest.Mock).mock.calls;
      const errorEvent = writeCalls.find((call: string[]) =>
        call[0].includes('"message":"Unknown error"'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should not abort in closeHandler when writableEnded is true for community stream', async () => {
      const user = UserFactory.create({
        email: mockAuthUser.email,
        preferredLanguage: 'ko',
      });
      const dto = {
        menuRecommendationId: 5,
        menuName: '피자',
        latitude: 37.5,
        longitude: 127.0,
      };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuRecommendationService.findById.mockResolvedValue(
        MenuRecommendationFactory.create({ id: 5 }),
      );
      mockCommunityPlaceService.recommendCommunityPlaces.mockResolvedValue(
        [] as never,
      );

      const req = createMockRequest();
      const res = createMockResponse();
      Object.defineProperty(res, 'writableEnded', {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });

      await controller.recommendCommunityPlacesStream(
        dto,
        mockAuthUser,
        req,
        res,
      );

      // writableEnded=true means closeHandler won't abort, and res.end won't be called
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
