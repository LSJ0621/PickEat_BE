import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { UserService } from '../user/user.service';
import { MenuSelectionStatus } from './entities/menu-selection.entity';
import {
  UserFactory,
  MenuSelectionFactory,
} from '../../test/factories/entity.factory';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { MenuSlot } from './dto/create-menu-selection.dto';

describe('MenuController', () => {
  let controller: MenuController;
  let mockMenuService: jest.Mocked<MenuService>;
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(async () => {
    mockMenuService = {
      recommend: jest.fn(),
      createSelection: jest.fn(),
      getSelections: jest.fn(),
      updateSelection: jest.fn(),
      getHistory: jest.fn(),
      searchRestaurantBlogs: jest.fn(),
      recommendRestaurantsWithGooglePlacesAndLlm: jest.fn(),
      getRecommendationDetail: jest.fn(),
      getPlaceDetail: jest.fn(),
    } as any;

    mockUserService = {
      getAuthenticatedEntity: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [
        {
          provide: MenuService,
          useValue: mockMenuService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<MenuController>(MenuController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recommend', () => {
    it('should return menu recommendations', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
      const recommendDto = { prompt: '오늘 점심 추천해줘' };

      const expectedResult = {
        id: 1,
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '한식을 좋아하시는 것 같아 추천드립니다.',
        recommendedAt: new Date(),
        requestAddress: '서울시 강남구',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommend.mockResolvedValue(expectedResult);

      const result = await controller.recommend(recommendDto, authUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(mockMenuService.recommend).toHaveBeenCalledWith(
        user,
        recommendDto.prompt,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('createSelection', () => {
    it('should create menu selection and return normalized response', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
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
        menuRecommendation: { id: 5 } as any,
      });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.createSelection.mockResolvedValue(selection);

      const result = await controller.createSelection(createDto, authUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
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

    it('should normalize legacy menuPayload structure', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
      const createDto = {
        menus: [{ slot: MenuSlot.BREAKFAST, name: '김치찌개' }],
      };

      const selection = {
        ...MenuSelectionFactory.create({ id: 1, user }),
        menuPayload: { name: '김치찌개' } as any,
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.createSelection.mockResolvedValue(selection);

      const result = await controller.createSelection(createDto, authUser);

      expect(result.selection.menuPayload).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should set historyId to null when menuRecommendation is not linked', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
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

      const result = await controller.createSelection(createDto, authUser);

      expect(result.selection.historyId).toBeNull();
    });
  });

  describe('getSelections', () => {
    it('should return selections for user', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

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
        {
          id: 2,
          menuPayload: {
            breakfast: [],
            lunch: ['된장찌개'],
            dinner: [],
            etc: [],
          },
          selectedDate: '2024-01-15',
        },
      ];

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getSelections.mockResolvedValue(selections);

      const result = await controller.getSelections('2024-01-15', authUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(mockMenuService.getSelections).toHaveBeenCalledWith(
        user,
        '2024-01-15',
      );
      expect(result).toEqual({ selections });
    });

    it('should work without date filter', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getSelections.mockResolvedValue([]);

      await controller.getSelections(undefined, authUser);

      expect(mockMenuService.getSelections).toHaveBeenCalledWith(
        user,
        undefined,
      );
    });
  });

  describe('updateSelection', () => {
    it('should update selection and return normalized response', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
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
        authUser,
      );

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
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

    it('should throw BadRequestException for invalid selection ID', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const updateDto = { breakfast: ['김치찌개'] };

      await expect(
        controller.updateSelection('invalid-id', updateDto, authUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.updateSelection('invalid-id', updateDto, authUser),
      ).rejects.toThrow('유효하지 않은 선택 ID입니다.');
    });

    it('should handle cancel update', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
      const updateDto = { cancel: true };

      const cancelledSelection = MenuSelectionFactory.create({
        id: 10,
        user,
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
      });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.updateSelection.mockResolvedValue(cancelledSelection);

      const result = await controller.updateSelection(
        '10',
        updateDto,
        authUser,
      );

      expect(result.selection.menuPayload).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });
  });

  describe('getHistory', () => {
    it('should return recommendation history with pagination', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });
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

      const result = await controller.getHistory(query, authUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(mockMenuService.getHistory).toHaveBeenCalledWith(
        user,
        query.page,
        query.limit,
        query.date,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('searchRestaurantBlogs', () => {
    it('should return blog search results', async () => {
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
      );
      expect(result).toEqual(expectedBlogs);
    });
  });

  describe('recommendRestaurantsWithGooglePlacesAndLlm', () => {
    it('should return place recommendations', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

      const expectedResult = {
        recommendations: [{ placeId: 'place-1', reason: '평점이 높습니다' }],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm.mockResolvedValue(
        expectedResult,
      );

      const result =
        await controller.recommendRestaurantsWithGooglePlacesAndLlm(
          '강남역 김치찌개',
          '김치찌개',
          '1',
          authUser,
        );

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(
        mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm,
      ).toHaveBeenCalledWith(user, '강남역 김치찌개', '김치찌개', 1);
      expect(result).toEqual(expectedResult);
    });

    it('should throw BadRequestException when menuName is missing', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };

      await expect(
        controller.recommendRestaurantsWithGooglePlacesAndLlm(
          '강남역 김치찌개',
          '',
          '1',
          authUser,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.recommendRestaurantsWithGooglePlacesAndLlm(
          '강남역 김치찌개',
          '',
          '1',
          authUser,
        ),
      ).rejects.toThrow('menuName 쿼리 파라미터가 필요합니다.');
    });

    it('should handle undefined historyId', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm.mockResolvedValue(
        {
          recommendations: [],
        },
      );

      await controller.recommendRestaurantsWithGooglePlacesAndLlm(
        '강남역 김치찌개',
        '김치찌개',
        undefined,
        authUser,
      );

      expect(
        mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm,
      ).toHaveBeenCalledWith(user, '강남역 김치찌개', '김치찌개', undefined);
    });

    it('should convert string historyId to number', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm.mockResolvedValue(
        {
          recommendations: [],
        },
      );

      await controller.recommendRestaurantsWithGooglePlacesAndLlm(
        'query',
        '김치찌개',
        '123',
        authUser,
      );

      expect(
        mockMenuService.recommendRestaurantsWithGooglePlacesAndLlm,
      ).toHaveBeenCalledWith(user, 'query', '김치찌개', 123);
    });
  });

  describe('getRecommendationDetail', () => {
    it('should return recommendation detail with places', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const user = UserFactory.create({ email: authUser.email });

      const expectedDetail = {
        history: {
          id: 1,
          prompt: '점심 추천',
          reason: '추천 이유',
          recommendedAt: new Date(),
          requestAddress: '서울시',
          hasPlaceRecommendations: true,
        },
        places: [
          {
            placeId: 'place-1',
            reason: '평점이 높습니다',
            menuName: '김치찌개',
            name: '맛있는 식당',
            address: '서울시 강남구',
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
          },
        ],
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockMenuService.getRecommendationDetail.mockResolvedValue(expectedDetail);

      const result = await controller.getRecommendationDetail('1', authUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(mockMenuService.getRecommendationDetail).toHaveBeenCalledWith(
        user,
        1,
      );
      expect(result).toEqual(expectedDetail);
    });

    it('should throw BadRequestException for invalid recommendation ID', async () => {
      const authUser: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };

      await expect(
        controller.getRecommendationDetail('invalid-id', authUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.getRecommendationDetail('invalid-id', authUser),
      ).rejects.toThrow('유효하지 않은 추천 이력 ID입니다.');
    });
  });

  describe('getPlaceDetail', () => {
    it('should return place detail', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

      const expectedDetail = {
        place: {
          id: placeId,
          name: '맛있는 식당',
          address: '서울시 강남구',
          location: { latitude: 37.5, longitude: 127.0 },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          businessStatus: 'OPERATIONAL',
          openNow: true,
          photos: ['https://example.com/photo1.jpg'],
          reviews: [],
        },
      };

      mockMenuService.getPlaceDetail.mockResolvedValue(expectedDetail);

      const result = await controller.getPlaceDetail(placeId);

      expect(mockMenuService.getPlaceDetail).toHaveBeenCalledWith(placeId);
      expect(result).toEqual(expectedDetail);
    });
  });
});
