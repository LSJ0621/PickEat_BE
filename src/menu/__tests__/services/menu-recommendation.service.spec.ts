import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';
import { MenuRecommendationService } from '../../services/menu-recommendation.service';
import { OpenAiMenuService } from '../../services/openai-menu.service';
import { UserAddressService } from '@/user/services/user-address.service';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
import { MenuRecommendation } from '../../entities/menu-recommendation.entity';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  UserAddressFactory,
  MenuRecommendationFactory,
} from '../../../../test/factories/entity.factory';

describe('MenuRecommendationService', () => {
  let service: MenuRecommendationService;
  let mockRecommendationRepository: jest.Mocked<any>;
  let mockOpenAiMenuService: jest.Mocked<OpenAiMenuService>;
  let mockUserAddressService: jest.Mocked<UserAddressService>;
  let mockUserTasteAnalysisService: jest.Mocked<any>;

  beforeEach(async () => {
    mockRecommendationRepository = createMockRepository<MenuRecommendation>();
    mockOpenAiMenuService = {
      generateMenuRecommendations: jest.fn(),
    } as unknown as jest.Mocked<OpenAiMenuService>;
    mockUserAddressService = {
      getDefaultAddress: jest.fn(),
    } as unknown as jest.Mocked<UserAddressService>;
    mockUserTasteAnalysisService = {
      getByUserId: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuRecommendationService,
        {
          provide: getRepositoryToken(MenuRecommendation),
          useValue: mockRecommendationRepository,
        },
        {
          provide: OpenAiMenuService,
          useValue: mockOpenAiMenuService,
        },
        {
          provide: UserAddressService,
          useValue: mockUserAddressService,
        },
        {
          provide: UserTasteAnalysisService,
          useValue: mockUserTasteAnalysisService,
        },
      ],
    }).compile();

    service = module.get<MenuRecommendationService>(MenuRecommendationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recommend', () => {
    it('should generate menu recommendations and save to database', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: {
          likes: ['한식', '중식'],
          dislikes: ['양식'],
          analysis: '매운 음식을 좋아함',
        },
      });
      const prompt = '오늘 점심 추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      const aiResponse = {
        intro: '오늘은 한식이 생각나는 날씨네요',
        recommendations: [
          { condition: '든든하게 먹고 싶다면', menu: '김치찌개' },
          { condition: '가볍게 먹고 싶다면', menu: '된장찌개' },
          { condition: '매콤하게 먹고 싶다면', menu: '순두부찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(
        defaultAddress,
      );

      const savedRecommendation = MenuRecommendationFactory.create({
        id: 1,
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        prompt,
        requestAddress: defaultAddress.roadAddress,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      const result = await service.recommend(user, prompt);

      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        ['한식', '중식'],
        ['양식'],
        '매운 음식을 좋아함',
        'ko',
        defaultAddress.roadAddress,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(mockUserAddressService.getDefaultAddress).toHaveBeenCalledWith(
        user,
      );
      expect(mockRecommendationRepository.create).toHaveBeenCalledWith({
        user,
        prompt,
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        recommendedAt: expect.any(Date),
        requestAddress: defaultAddress.roadAddress,
      });
      expect(mockRecommendationRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        id: 1,
        intro: aiResponse.intro,
        recommendations: aiResponse.recommendations,
        closing: aiResponse.closing,
        recommendedAt: expect.any(Date),
        requestAddress: defaultAddress.roadAddress,
      });
    });

    it('should handle user with no preferences', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: null,
      });
      const prompt = '오늘 점심 추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      const aiResponse = {
        intro: '인기 있는 메뉴를 추천해드릴게요',
        recommendations: [
          { condition: '든든하게 먹고 싶다면', menu: '비빔밥' },
          { condition: '고기가 먹고 싶다면', menu: '불고기' },
          { condition: '간식이 먹고 싶다면', menu: '떡볶이' },
        ],
        closing: '맛있게 드세요!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(
        defaultAddress,
      );

      const savedRecommendation = MenuRecommendationFactory.create({
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      await service.recommend(user, prompt);

      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        [],
        [],
        undefined,
        'ko',
        defaultAddress.roadAddress,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should continue recommendation when tasteAnalysis fetch fails (line 46 catch branch)', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: {
          likes: ['한식'],
          dislikes: [],
          analysis: '매운 음식 좋아함',
        },
      });
      const prompt = '오늘 점심 추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      // tasteAnalysis fetch throws an error - recommendation should still proceed
      mockUserTasteAnalysisService.getByUserId.mockRejectedValue(
        new Error('DB connection failed'),
      );

      const aiResponse = {
        intro: '한식 추천',
        recommendations: [
          { condition: '든든하게', menu: '김치찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      const savedRecommendation = MenuRecommendationFactory.create({
        id: 2,
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        prompt,
        requestAddress: defaultAddress.roadAddress,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      // Should NOT throw even though tasteAnalysis fetch failed
      const result = await service.recommend(user, prompt);

      expect(result).toBeDefined();
      // tasteAnalysis is null (error was swallowed), so analysis falls back to user.preferences.analysis
      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        ['한식'],
        [],
        '매운 음식 좋아함', // fallback from user.preferences.analysis
        'ko',
        defaultAddress.roadAddress,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should log warn with Unknown error string when tasteAnalysis fetch fails with non-Error (line 47 branch)', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: {
          likes: ['한식'],
          dislikes: [],
          analysis: '매운 음식 좋아함',
        },
      });
      const prompt = '오늘 점심 추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      // Reject with a non-Error object to hit the 'Unknown error' branch (line 47)
      mockUserTasteAnalysisService.getByUserId.mockRejectedValue(
        { code: 'NON_ERROR_REJECTION' },
      );

      const aiResponse = {
        intro: '한식 추천',
        recommendations: [{ condition: '든든하게', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      const savedRecommendation = MenuRecommendationFactory.create({
        id: 3,
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        prompt,
        requestAddress: defaultAddress.roadAddress,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      const warnSpy = jest.spyOn(service['logger'], 'warn');

      // Should NOT throw - error is swallowed
      const result = await service.recommend(user, prompt);

      expect(result).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error'),
      );
    });

    it('should build structuredAnalysis from tasteAnalysis when tasteAnalysis is non-null (line 61 branch)', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: {
          likes: ['한식'],
          dislikes: [],
          analysis: '매운 음식 좋아함',
        },
      });
      const prompt = '오늘 점심 추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      const tasteAnalysis = {
        compactSummary: '한식 선호',
        stablePatterns: { categories: ['한식'], flavors: [], cookingMethods: [], confidence: 'high' as const },
        recentSignals: { trending: [], declining: [] },
        diversityHints: { explorationAreas: [], rotationSuggestions: [] },
      };

      mockUserTasteAnalysisService.getByUserId.mockResolvedValue(tasteAnalysis);

      const aiResponse = {
        intro: '한식 추천',
        recommendations: [{ condition: '든든하게', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      const savedRecommendation = MenuRecommendationFactory.create({
        id: 4,
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        prompt,
        requestAddress: defaultAddress.roadAddress,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      await service.recommend(user, prompt);

      // Verify structuredAnalysis is passed to OpenAI service (line 61-67)
      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        ['한식'],
        [],
        '한식 선호', // compactSummary used as analysis (line 92)
        'ko',
        defaultAddress.roadAddress,
        undefined,
        undefined,
        '한식 선호',
        expect.objectContaining({
          stablePatterns: tasteAnalysis.stablePatterns,
          recentSignals: tasteAnalysis.recentSignals,
          diversityHints: tasteAnalysis.diversityHints,
        }),
      );
    });

    it('should fall back to user preferences analysis when compactSummary is empty string (line 92 branch)', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'test@example.com',
        preferences: {
          likes: [],
          dislikes: [],
          analysis: '저장된 분석',
        },
      });
      const prompt = '추천해줘';
      const defaultAddress = UserAddressFactory.createDefault(user);

      const tasteAnalysis = {
        compactSummary: '   ', // whitespace-only string trims to empty → falsy
        stablePatterns: null,
        recentSignals: null,
        diversityHints: null,
      };

      mockUserTasteAnalysisService.getByUserId.mockResolvedValue(tasteAnalysis);

      const aiResponse = {
        intro: '추천',
        recommendations: [{ condition: '든든하게', menu: '비빔밥' }],
        closing: '맛있게!',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      const savedRecommendation = MenuRecommendationFactory.create({
        id: 5,
        user,
        intro: aiResponse.intro,
        recommendationDetails: aiResponse.recommendations,
        closing: aiResponse.closing,
        prompt,
        requestAddress: defaultAddress.roadAddress,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      await service.recommend(user, prompt);

      // Empty compactSummary.trim() is falsy, analysis falls back to user.preferences.analysis (line 92)
      // But compactSummary itself ('   ') is still passed as 9th argument
      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        [],
        [],
        '저장된 분석', // analysis falls back to user.preferences.analysis
        'ko',
        defaultAddress.roadAddress,
        undefined,
        undefined,
        '   ', // raw compactSummary is passed as-is
        expect.anything(),
      );
    });

    it('should throw BadRequestException when no default address exists', async () => {
      const user = UserFactory.create({ id: 1 });
      const prompt = '오늘 점심 추천해줘';

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue({
        intro: '오늘의 추천',
        recommendations: [{ condition: '든든하게', menu: '김치찌개' }],
        closing: '맛있게 드세요',
      });
      mockUserAddressService.getDefaultAddress.mockResolvedValue(null);

      await expect(service.recommend(user, prompt)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_DEFAULT_ADDRESS_REQUIRED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when default address has no roadAddress', async () => {
      const user = UserFactory.create({ id: 1 });
      const prompt = '오늘 점심 추천해줘';
      const addressWithoutRoad = UserAddressFactory.createDefault(user);
      addressWithoutRoad.roadAddress = '';

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue({
        intro: '오늘의 추천',
        recommendations: [{ condition: '든든하게', menu: '김치찌개' }],
        closing: '맛있게 드세요',
      });
      mockUserAddressService.getDefaultAddress.mockResolvedValue(
        addressWithoutRoad,
      );

      await expect(service.recommend(user, prompt)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_DEFAULT_ADDRESS_REQUIRED,
          }),
        }),
      );
    });
  });

  describe('getHistory', () => {
    it('should return paginated recommendation history', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendations = [
        MenuRecommendationFactory.create({ id: 1, user }),
        MenuRecommendationFactory.create({ id: 2, user }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([recommendations, 2]);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getHistory(user, 1, 10);

      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'recommendation.placeRecommendations',
        'placeRecommendation',
        'placeRecommendation.deletedAt IS NULL',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'recommendation.user.id = :id',
        { id: 1 },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'recommendation.recommendedAt',
        'DESC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.items).toHaveLength(2);
      expect(result.pageInfo).toEqual({
        page: 1,
        limit: 10,
        totalCount: 2,
        hasNext: false,
      });
    });

    it('should filter by date when provided', async () => {
      const user = UserFactory.create({ id: 1 });
      const date = '2024-01-15';

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.getHistory(user, 1, 10, date);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'recommendation.recommendedAt >= :start',
        { start: new Date('2024-01-15T00:00:00.000Z') },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'recommendation.recommendedAt < :end',
        { end: new Date('2024-01-16T00:00:00.000Z') },
      );
    });

    it('should throw BadRequestException for invalid date format', async () => {
      const user = UserFactory.create({ id: 1 });
      const invalidDate = 'invalid-date';

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await expect(
        service.getHistory(user, 1, 10, invalidDate),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getHistory(user, 1, 10, invalidDate),
      ).rejects.toThrow(ErrorCode.INVALID_DATE_PARAMETER);
    });

    it('should indicate hasNext when more items exist', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendations = [
        MenuRecommendationFactory.create({ id: 1, user }),
        MenuRecommendationFactory.create({ id: 2, user }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([recommendations, 20]);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getHistory(user, 1, 10);

      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.totalCount).toBe(20);
    });

    it('should map history items with hasPlaceRecommendations flag', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [
          {
            id: 1,
            placeId: 'place-1',
            reason: 'reason',
            menuName: '김치찌개',
          } as any,
        ],
      });

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[recommendation], 1]);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getHistory(user, 1, 10);

      expect(result.items[0].hasPlaceRecommendations).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return recommendation when found', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendation = MenuRecommendationFactory.create({ id: 1, user });

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getOne.mockResolvedValue(recommendation);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.findById(1, user);

      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'recommendation.user',
        'user',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'recommendation.placeRecommendations',
        'placeRecommendation',
        'placeRecommendation.deletedAt IS NULL',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'recommendation.id = :id',
        { id: 1 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.id = :userId',
        { userId: 1 },
      );
      expect(result).toEqual(recommendation);
    });

    it('should throw BadRequestException when recommendation not found', async () => {
      const user = UserFactory.create({ id: 1 });

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getOne.mockResolvedValue(null);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await expect(service.findById(999, user)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_HISTORY_NOT_FOUND,
          }),
        }),
      );
    });

    it('should not return recommendation from different user', async () => {
      const user = UserFactory.create({ id: 1 });

      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getOne.mockResolvedValue(null);

      mockRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await expect(service.findById(1, user)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_HISTORY_NOT_FOUND,
          }),
        }),
      );
    });
  });

  describe('findOwnedRecommendation', () => {
    it('should return owned recommendation', async () => {
      const user = UserFactory.create({ id: 1 });
      const recommendation = MenuRecommendationFactory.create({ id: 1, user });

      mockRecommendationRepository.findOne.mockResolvedValue(recommendation);

      const result = await service.findOwnedRecommendation(1, user);

      expect(mockRecommendationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, user: { id: 1 } },
        relations: ['user'],
      });
      expect(result).toEqual(recommendation);
    });

    it('should throw BadRequestException when recommendation not owned by user', async () => {
      const user = UserFactory.create({ id: 1 });

      mockRecommendationRepository.findOne.mockResolvedValue(null);

      await expect(service.findOwnedRecommendation(1, user)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.MENU_HISTORY_OWNERSHIP_REQUIRED,
          }),
        }),
      );
    });
  });
});
