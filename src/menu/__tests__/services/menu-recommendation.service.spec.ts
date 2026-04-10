import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { UserAddressService } from '@/user/services/user-address.service';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuRecommendationService } from '@/menu/services/menu-recommendation.service';
import { OpenAiMenuService } from '@/menu/services/openai-menu.service';
import { UserFactory } from '../../../../test/factories/entity.factory';

const mockGenerateResult = {
  intro: '오늘의 추천 메뉴입니다.',
  recommendations: [
    { condition: '얼큰한 국물이 당긴다면', menu: '김치찌개' },
    { condition: '구수한 맛을 원한다면', menu: '된장찌개' },
    { condition: '부드럽게 먹고 싶다면', menu: '순두부찌개' },
  ],
  closing: '맛있게 드세요.',
};

const mockAddress = {
  id: 1,
  roadAddress: '서울특별시 강남구 테헤란로 123',
  isDefault: true,
};

describe('MenuRecommendationService', () => {
  let service: MenuRecommendationService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOpenAiMenuService = {
    generateMenuRecommendations: jest.fn(),
  };

  const mockUserAddressService = {
    getDefaultAddress: jest.fn(),
  };

  const mockUserTasteAnalysisService = {
    getByUserId: jest.fn(),
  };

  const buildMockQueryBuilder = (getOneResult: MenuRecommendation | null = null) => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getOne: jest.fn().mockResolvedValue(getOneResult),
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuRecommendationService,
        { provide: getRepositoryToken(MenuRecommendation), useValue: mockRepository },
        { provide: OpenAiMenuService, useValue: mockOpenAiMenuService },
        { provide: UserAddressService, useValue: mockUserAddressService },
        { provide: UserTasteAnalysisService, useValue: mockUserTasteAnalysisService },
      ],
    }).compile();

    service = module.get<MenuRecommendationService>(MenuRecommendationService);
  });

  // ─── recommend ───────────────────────────────────────────────────────────────

  describe('recommend', () => {
    it('should return recommendation result and save record when default address exists', async () => {
      const user = UserFactory.createWithPassword();
      const mockRecord = {
        id: 42,
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        recommendationDetails: mockGenerateResult.recommendations,
        intro: mockGenerateResult.intro,
        closing: mockGenerateResult.closing,
        recommendedAt: new Date(),
        requestAddress: mockAddress.roadAddress,
      } as MenuRecommendation;

      mockUserTasteAnalysisService.getByUserId.mockResolvedValue(null);
      mockUserAddressService.getDefaultAddress.mockResolvedValue(mockAddress);
      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(mockGenerateResult);
      mockRepository.create.mockReturnValue(mockRecord);
      mockRepository.save.mockResolvedValue(mockRecord);

      const result = await service.recommend(user, '오늘 점심 뭐 먹지?');

      expect(result).toHaveProperty('id', 42);
      expect(result).toHaveProperty('recommendations');
      expect(mockRepository.save).toHaveBeenCalledWith(mockRecord);
    });

    it('should pass user likes and dislikes to generateMenuRecommendations', async () => {
      const user = UserFactory.create({
        email: 'test@example.com',
        preferences: {
          likes: ['매운 음식', '국물 요리'],
          dislikes: ['달콤한 음식'],
        },
      });
      const mockRecord = {
        id: 1,
        recommendationDetails: mockGenerateResult.recommendations,
        intro: mockGenerateResult.intro,
        closing: mockGenerateResult.closing,
        recommendedAt: new Date(),
        requestAddress: mockAddress.roadAddress,
      } as MenuRecommendation;

      mockUserTasteAnalysisService.getByUserId.mockResolvedValue(null);
      mockUserAddressService.getDefaultAddress.mockResolvedValue(mockAddress);
      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(mockGenerateResult);
      mockRepository.create.mockReturnValue(mockRecord);
      mockRepository.save.mockResolvedValue(mockRecord);

      await service.recommend(user, '오늘 점심 추천해줘');

      const [, calledLikes, calledDislikes] = (
        mockOpenAiMenuService.generateMenuRecommendations as jest.Mock
      ).mock.calls[0] as [string, string[], string[]];
      expect(calledLikes).toEqual(['매운 음식', '국물 요리']);
      expect(calledDislikes).toEqual(['달콤한 음식']);
    });

    it('should throw BadRequestException with MENU_DEFAULT_ADDRESS_REQUIRED when user has no default address', async () => {
      const user = UserFactory.createWithPassword();
      mockUserTasteAnalysisService.getByUserId.mockResolvedValue(null);
      mockUserAddressService.getDefaultAddress.mockResolvedValue(null);

      await expect(service.recommend(user, '오늘 점심 뭐 먹지?')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.MENU_DEFAULT_ADDRESS_REQUIRED },
      });
    });

    it('should continue with recommendation even when tasteAnalysis fetch fails', async () => {
      const user = UserFactory.createWithPassword();
      const mockRecord = {
        id: 1,
        recommendationDetails: mockGenerateResult.recommendations,
        intro: mockGenerateResult.intro,
        closing: mockGenerateResult.closing,
        recommendedAt: new Date(),
        requestAddress: mockAddress.roadAddress,
      } as MenuRecommendation;

      mockUserTasteAnalysisService.getByUserId.mockRejectedValue(new Error('DB timeout'));
      mockUserAddressService.getDefaultAddress.mockResolvedValue(mockAddress);
      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(mockGenerateResult);
      mockRepository.create.mockReturnValue(mockRecord);
      mockRepository.save.mockResolvedValue(mockRecord);

      const result = await service.recommend(user, '오늘 점심 뭐 먹지?');

      expect(result).toHaveProperty('id');
      expect(mockOpenAiMenuService.generateMenuRecommendations).toHaveBeenCalled();
    });
  });

  // ─── getHistory ───────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('should return correct pageInfo with hasNext=true when there are more items beyond current page', async () => {
      const user = UserFactory.createWithPassword();
      const mockItems = [
        { id: 1, placeRecommendations: [] } as unknown as MenuRecommendation,
        { id: 2, placeRecommendations: [] } as unknown as MenuRecommendation,
      ];
      const totalCount = 12;

      const mockQb = buildMockQueryBuilder();
      mockQb.getManyAndCount.mockResolvedValue([mockItems, totalCount]);
      mockRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getHistory(user, 1, 10);

      expect(result.pageInfo.totalCount).toBe(totalCount);
      expect(result.pageInfo.page).toBe(1);
      expect(result.pageInfo.hasNext).toBe(true); // skip(0) + 2 items < 12 total
      expect(result.items).toHaveLength(2);
    });

    it('should return empty items with zero totalCount when date filter matches no records', async () => {
      const user = UserFactory.createWithPassword();
      const mockQb = buildMockQueryBuilder();
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      mockRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getHistory(user, 1, 10, '2024-01-15');

      expect(result.items).toHaveLength(0);
      expect(result.pageInfo.totalCount).toBe(0);
      expect(result.pageInfo.hasNext).toBe(false);
    });
  });

  // ─── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should throw BadRequestException with MENU_HISTORY_NOT_FOUND when recommendation belongs to different user', async () => {
      const user = UserFactory.createWithPassword();
      const mockQb = buildMockQueryBuilder(null); // returns null = not found for this user
      mockRepository.createQueryBuilder.mockReturnValue(mockQb);

      await expect(service.findById(99, user)).rejects.toMatchObject({
        response: { errorCode: ErrorCode.MENU_HISTORY_NOT_FOUND },
      });
    });
  });
});
