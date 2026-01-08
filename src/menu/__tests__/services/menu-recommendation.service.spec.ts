import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MenuRecommendationService } from '../../services/menu-recommendation.service';
import { OpenAiMenuService } from '../../services/openai-menu.service';
import { UserAddressService } from '@/user/services/user-address.service';
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

  beforeEach(async () => {
    mockRecommendationRepository = createMockRepository<MenuRecommendation>();
    mockOpenAiMenuService = {
      generateMenuRecommendations: jest.fn(),
    } as unknown as jest.Mocked<OpenAiMenuService>;
    mockUserAddressService = {
      getDefaultAddress: jest.fn(),
    } as unknown as jest.Mocked<UserAddressService>;

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
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '한식을 좋아하시는 것 같아 추천드립니다.',
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
        recommendations: aiResponse.recommendations,
        reason: aiResponse.reason,
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
      );
      expect(mockUserAddressService.getDefaultAddress).toHaveBeenCalledWith(
        user,
      );
      expect(mockRecommendationRepository.create).toHaveBeenCalledWith({
        user,
        prompt,
        recommendations: aiResponse.recommendations,
        reason: aiResponse.reason,
        recommendedAt: expect.any(Date),
        requestAddress: defaultAddress.roadAddress,
      });
      expect(mockRecommendationRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        id: 1,
        recommendations: aiResponse.recommendations,
        reason: aiResponse.reason,
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
        recommendations: ['비빔밥', '불고기', '떡볶이'],
        reason: '인기 메뉴로 추천드립니다.',
      };

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue(
        aiResponse,
      );
      mockUserAddressService.getDefaultAddress.mockResolvedValue(
        defaultAddress,
      );

      const savedRecommendation = MenuRecommendationFactory.create({
        user,
        recommendations: aiResponse.recommendations,
        reason: aiResponse.reason,
      });

      mockRecommendationRepository.create.mockReturnValue(savedRecommendation);
      mockRecommendationRepository.save.mockResolvedValue(savedRecommendation);

      await service.recommend(user, prompt);

      expect(
        mockOpenAiMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(prompt, [], [], undefined);
    });

    it('should throw BadRequestException when no default address exists', async () => {
      const user = UserFactory.create({ id: 1 });
      const prompt = '오늘 점심 추천해줘';

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue({
        recommendations: ['김치찌개'],
        reason: '추천 이유',
      });
      mockUserAddressService.getDefaultAddress.mockResolvedValue(null);

      await expect(service.recommend(user, prompt)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.recommend(user, prompt)).rejects.toThrow(
        '기본 주소를 설정해주세요.',
      );
    });

    it('should throw BadRequestException when default address has no roadAddress', async () => {
      const user = UserFactory.create({ id: 1 });
      const prompt = '오늘 점심 추천해줘';
      const addressWithoutRoad = UserAddressFactory.createDefault(user);
      addressWithoutRoad.roadAddress = '';

      mockOpenAiMenuService.generateMenuRecommendations.mockResolvedValue({
        recommendations: ['김치찌개'],
        reason: '추천 이유',
      });
      mockUserAddressService.getDefaultAddress.mockResolvedValue(
        addressWithoutRoad,
      );

      await expect(service.recommend(user, prompt)).rejects.toThrow(
        BadRequestException,
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
      ).rejects.toThrow('Invalid date parameter');
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

      mockRecommendationRepository.findOne.mockResolvedValue(recommendation);

      const result = await service.findById(1, user);

      expect(mockRecommendationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, user: { id: 1 } },
        relations: ['placeRecommendations', 'user'],
      });
      expect(result).toEqual(recommendation);
    });

    it('should throw BadRequestException when recommendation not found', async () => {
      const user = UserFactory.create({ id: 1 });

      mockRecommendationRepository.findOne.mockResolvedValue(null);

      await expect(service.findById(999, user)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.findById(999, user)).rejects.toThrow(
        '추천 이력을 찾을 수 없습니다.',
      );
    });

    it('should not return recommendation from different user', async () => {
      const user = UserFactory.create({ id: 1 });
      mockRecommendationRepository.findOne.mockResolvedValue(null);

      await expect(service.findById(1, user)).rejects.toThrow(
        BadRequestException,
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
        BadRequestException,
      );
      await expect(service.findOwnedRecommendation(1, user)).rejects.toThrow(
        '본인 추천 이력에만 선택을 연결할 수 있습니다.',
      );
    });
  });
});
