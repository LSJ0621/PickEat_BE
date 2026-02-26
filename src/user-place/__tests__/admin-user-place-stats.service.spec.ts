import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserPlace } from '../entities/user-place.entity';
import { UserPlaceStatus } from '../enum/user-place-status.enum';
import { AdminUserPlaceStatsService } from '../services/admin-user-place-stats.service';
import { AdminUserPlaceListQueryDto } from '../dto/admin-user-place-list-query.dto';

describe('AdminUserPlaceStatsService', () => {
  let service: AdminUserPlaceStatsService;
  let userPlaceRepository: ReturnType<typeof createMockRepository>;

  const createMockUserPlace = (overrides: Partial<UserPlace> = {}): UserPlace =>
    ({
      id: 1,
      user: { id: 1 },
      name: '맛있는 식당',
      address: '서울특별시 강남구 테헤란로 123',
      latitude: 37.5012345,
      longitude: 127.0398765,
      location: { type: 'Point', coordinates: [127.0398765, 37.5012345] },
      menuTypes: ['한식', '찌개류'],
      photos: null,
      openingHours: null,
      phoneNumber: '02-1234-5678',
      category: '한식',
      description: '맛있는 한식집입니다',
      status: UserPlaceStatus.APPROVED,
      rejectionReason: null,
      rejectionCount: 0,
      lastRejectedAt: null,
      lastSubmittedAt: new Date(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as unknown as UserPlace;

  beforeEach(async () => {
    jest.clearAllMocks();
    userPlaceRepository = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserPlaceStatsService,
        {
          provide: getRepositoryToken(UserPlace),
          useValue: userPlaceRepository,
        },
      ],
    }).compile();

    service = module.get<AdminUserPlaceStatsService>(
      AdminUserPlaceStatsService,
    );
  });

  it('should create service instance when dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('findAllForAdmin', () => {
    it('should return paginated user places with default pagination', async () => {
      // Arrange
      const mockPlaces = [createMockUserPlace({ id: 1 })];
      const query: AdminUserPlaceListQueryDto = {};

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockPlaces, 1]),
      };
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.findAllForAdmin(query);

      // Assert
      expect(result.items).toEqual(mockPlaces);
      expect(result.pageInfo.page).toBe(1);
      expect(result.pageInfo.limit).toBe(10);
      expect(result.pageInfo.totalCount).toBe(1);
      expect(result.pageInfo.hasNext).toBe(false);
    });

    it('should apply status filter when provided', async () => {
      // Arrange
      const query: AdminUserPlaceListQueryDto = {
        status: UserPlaceStatus.PENDING,
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      await service.findAllForAdmin(query);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'userPlace.status = :status',
        { status: UserPlaceStatus.PENDING },
      );
    });

    it('should apply userId filter when provided', async () => {
      // Arrange
      const query: AdminUserPlaceListQueryDto = { userId: 42 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      await service.findAllForAdmin(query);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'userPlace.userId = :userId',
        { userId: 42 },
      );
    });

    it('should sanitize and apply search filter when provided', async () => {
      // Arrange
      const query: AdminUserPlaceListQueryDto = { search: '맛있는%식당' };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      await service.findAllForAdmin(query);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(userPlace.name LIKE :search OR userPlace.address LIKE :search)',
        { search: '%맛있는\\%식당%' },
      );
    });

    it('should calculate hasNext correctly when more pages exist', async () => {
      // Arrange
      const query: AdminUserPlaceListQueryDto = { page: 1, limit: 5 };
      const mockPlaces = Array(5)
        .fill(null)
        .map((_, i) => createMockUserPlace({ id: i + 1 }));
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockPlaces, 12]),
      };
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.findAllForAdmin(query);

      // Assert
      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.totalCount).toBe(12);
    });
  });

  describe('findOneForAdmin', () => {
    it('should return a user place when found', async () => {
      // Arrange
      const mockPlace = createMockUserPlace({ id: 1 });
      userPlaceRepository.findOne.mockResolvedValue(mockPlace);

      // Act
      const result = await service.findOneForAdmin(1);

      // Assert
      expect(result).toEqual(mockPlace);
      expect(userPlaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['user'],
      });
    });

    it('should throw NotFoundException when user place does not exist', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOneForAdmin(999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOneForAdmin(999)).rejects.toMatchObject({
        response: { errorCode: ErrorCode.USER_PLACE_NOT_FOUND },
      });
    });
  });
});
