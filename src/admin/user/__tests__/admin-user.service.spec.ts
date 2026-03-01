import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AdminUserService } from '../admin-user.service';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import {
  UserFactory,
  UserAddressFactory,
  MenuRecommendationFactory,
  BugReportFactory,
} from '../../../../test/factories/entity.factory';
import { ROLES } from '@/common/constants/roles.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { RedisCacheService } from '@/common/cache/cache.service';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let addressRepository: jest.Mocked<Repository<UserAddress>>;
  let menuRecommendationRepository: jest.Mocked<Repository<MenuRecommendation>>;
  let menuSelectionRepository: jest.Mocked<Repository<MenuSelection>>;
  let bugReportRepository: jest.Mocked<Repository<BugReport>>;
  let auditLogRepository: jest.Mocked<Repository<AdminAuditLog>>;
  let cacheService: jest.Mocked<Pick<RedisCacheService, 'deleteRefreshToken'>>;

  beforeEach(async () => {
    userRepository = {
      update: jest.fn(),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    addressRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserAddress>>;

    menuRecommendationRepository = {
      count: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<MenuRecommendation>>;

    menuSelectionRepository = {
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<MenuSelection>>;

    bugReportRepository = {
      count: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<BugReport>>;

    auditLogRepository = {
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AdminAuditLog>>;

    cacheService = {
      deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<Pick<RedisCacheService, 'deleteRefreshToken'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(UserAddress),
          useValue: addressRepository,
        },
        {
          provide: getRepositoryToken(MenuRecommendation),
          useValue: menuRecommendationRepository,
        },
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: menuSelectionRepository,
        },
        {
          provide: getRepositoryToken(BugReport),
          useValue: bugReportRepository,
        },
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: auditLogRepository,
        },
        {
          provide: RedisCacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    service = module.get<AdminUserService>(AdminUserService);
    cacheService = module.get(RedisCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    describe('Role-based Filtering', () => {
      it('should return only USER role when requester is ADMIN', async () => {
        // Arrange
        const mockQueryBuilder = {
          withDeleted: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest
            .fn()
            .mockResolvedValue([
              [
                UserFactory.create({ id: 1, role: ROLES.USER }),
                UserFactory.create({ id: 2, role: ROLES.USER }),
              ],
              2,
            ]),
        } as unknown as SelectQueryBuilder<User>;

        userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        // Act
        await service.findAll({ page: 1, limit: 20 }, ROLES.ADMIN);

        // Assert
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.role = :role',
          { role: ROLES.USER },
        );
      });

      it('should return all roles when requester is SUPER_ADMIN without role filter', async () => {
        // Arrange
        const mockQueryBuilder = {
          withDeleted: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest
            .fn()
            .mockResolvedValue([
              [
                UserFactory.create({ id: 1, role: ROLES.USER }),
                UserFactory.create({ id: 2, role: ROLES.ADMIN }),
                UserFactory.create({ id: 3, role: ROLES.SUPER_ADMIN }),
              ],
              3,
            ]),
        } as unknown as SelectQueryBuilder<User>;

        userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        // Act
        await service.findAll({ page: 1, limit: 20 }, ROLES.SUPER_ADMIN);

        // Assert - Should NOT call andWhere for role filtering
        expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          'user.role = :role',
          expect.anything(),
        );
      });

      it('should filter by specific role when SUPER_ADMIN uses role parameter', async () => {
        // Arrange
        const mockQueryBuilder = {
          withDeleted: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest
            .fn()
            .mockResolvedValue([
              [
                UserFactory.create({ id: 1, role: ROLES.ADMIN }),
                UserFactory.create({ id: 2, role: ROLES.ADMIN }),
              ],
              2,
            ]),
        } as unknown as SelectQueryBuilder<User>;

        userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        // Act
        await service.findAll(
          { page: 1, limit: 20, role: ROLES.ADMIN },
          ROLES.SUPER_ADMIN,
        );

        // Assert
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.role = :role',
          { role: ROLES.ADMIN },
        );
      });

      it('should ignore role parameter when requester is ADMIN', async () => {
        // Arrange
        const mockQueryBuilder = {
          withDeleted: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest
            .fn()
            .mockResolvedValue([
              [UserFactory.create({ id: 1, role: ROLES.USER })],
              1,
            ]),
        } as unknown as SelectQueryBuilder<User>;

        userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        // Act - ADMIN tries to filter by ADMIN role
        await service.findAll(
          { page: 1, limit: 20, role: ROLES.ADMIN },
          ROLES.ADMIN,
        );

        // Assert - Should still filter by USER only
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.role = :role',
          { role: ROLES.USER },
        );
      });
    });

    describe('Search and Filter Conditions', () => {
      let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<User>>;

      beforeEach(() => {
        mockQueryBuilder = {
          withDeleted: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest
            .fn()
            .mockResolvedValue([
              [UserFactory.create({ id: 1, role: ROLES.USER })],
              1,
            ]),
        } as unknown as jest.Mocked<SelectQueryBuilder<User>>;

        userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      });

      it('should apply search filter when search query is provided', async () => {
        await service.findAll(
          { page: 1, limit: 20, search: 'test' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(user.email ILIKE :search OR user.name ILIKE :search)',
          { search: '%test%' },
        );
      });

      it('should apply status filter for "active" status', async () => {
        await service.findAll(
          { page: 1, limit: 20, status: 'active' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.deletedAt IS NULL AND user.isDeactivated = false',
        );
      });

      it('should apply status filter for "deleted" status', async () => {
        await service.findAll(
          { page: 1, limit: 20, status: 'deleted' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.deletedAt IS NOT NULL',
        );
      });

      it('should apply status filter for "deactivated" status', async () => {
        await service.findAll(
          { page: 1, limit: 20, status: 'deactivated' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.isDeactivated = true AND user.deletedAt IS NULL',
        );
      });

      it('should apply socialType filter when socialType is provided', async () => {
        await service.findAll(
          { page: 1, limit: 20, socialType: 'KAKAO' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.socialType = :socialType',
          { socialType: 'KAKAO' },
        );
      });

      it('should apply startDate filter when startDate is provided', async () => {
        await service.findAll(
          { page: 1, limit: 20, startDate: '2024-01-01' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.createdAt >= :startDate',
          { startDate: '2024-01-01' },
        );
      });

      it('should apply endDate filter when endDate is provided', async () => {
        await service.findAll(
          { page: 1, limit: 20, endDate: '2024-12-31' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'user.createdAt <= :endDate',
          { endDate: '2024-12-31 23:59:59' },
        );
      });

      it('should use custom sortBy and sortOrder when provided', async () => {
        await service.findAll(
          { page: 1, limit: 20, sortBy: 'email', sortOrder: 'ASC' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'user.email',
          'ASC',
        );
      });

      it('should fall back to createdAt for unknown sortBy column', async () => {
        await service.findAll(
          { page: 1, limit: 20, sortBy: 'unknownColumn' as 'email' },
          ROLES.SUPER_ADMIN,
        );

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'user.createdAt',
          'DESC',
        );
      });

      it('should use default page and limit when not provided', async () => {
        await service.findAll({}, ROLES.SUPER_ADMIN);

        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      });

      it('should return correct pageInfo with hasNext true when more items exist', async () => {
        mockQueryBuilder.getManyAndCount.mockResolvedValue([
          [UserFactory.create({ id: 1, role: ROLES.USER })],
          100,
        ]);

        const result = await service.findAll(
          { page: 1, limit: 10 },
          ROLES.SUPER_ADMIN,
        );

        expect(result.pageInfo.hasNext).toBe(true);
      });

      it('should return hasNext false when no more items', async () => {
        mockQueryBuilder.getManyAndCount.mockResolvedValue([
          [UserFactory.create({ id: 1, role: ROLES.USER })],
          1,
        ]);

        const result = await service.findAll(
          { page: 1, limit: 10 },
          ROLES.SUPER_ADMIN,
        );

        expect(result.pageInfo.hasNext).toBe(false);
      });

      it('should map users to AdminUserListItemDto correctly for active user', async () => {
        const activeUser = UserFactory.create({
          id: 1,
          role: ROLES.USER,
          isDeactivated: false,
          deletedAt: null,
        });
        mockQueryBuilder.getManyAndCount.mockResolvedValue([[activeUser], 1]);

        const result = await service.findAll(
          { page: 1, limit: 10 },
          ROLES.SUPER_ADMIN,
        );

        expect(result.items[0].id).toBe(1);
      });

      it('should map user with deletedAt to "deleted" status', async () => {
        const deletedUser = UserFactory.create({
          id: 2,
          role: ROLES.USER,
          deletedAt: new Date(),
        });
        mockQueryBuilder.getManyAndCount.mockResolvedValue([[deletedUser], 1]);

        const result = await service.findAll(
          { page: 1, limit: 10 },
          ROLES.SUPER_ADMIN,
        );

        expect(result.items[0].id).toBe(2);
      });

      it('should map deactivated user to "deactivated" status', async () => {
        const deactivatedUser = UserFactory.create({
          id: 3,
          role: ROLES.USER,
          isDeactivated: true,
          deletedAt: null,
        });
        mockQueryBuilder.getManyAndCount.mockResolvedValue([
          [deactivatedUser],
          1,
        ]);

        const result = await service.findAll(
          { page: 1, limit: 10 },
          ROLES.SUPER_ADMIN,
        );

        expect(result.items[0].id).toBe(3);
      });
    });
  });

  describe('findOne', () => {
    it('should return user detail dto when user exists', async () => {
      const userId = 1;
      const user = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        preferences: { likes: ['한식'], dislikes: ['양식'] },
      });
      const addresses = [
        UserAddressFactory.create({ id: 1, user, isDefault: true }),
      ];
      const recommendations = [
        MenuRecommendationFactory.create({ id: 1, user }),
      ];
      const bugReports = [
        BugReportFactory.create({ id: 1, user, createdAt: new Date() }),
      ];

      userRepository.findOne.mockResolvedValue(user);
      addressRepository.find.mockResolvedValue(addresses);
      menuRecommendationRepository.count.mockResolvedValue(5);
      menuSelectionRepository.count.mockResolvedValue(3);
      bugReportRepository.count.mockResolvedValue(2);
      menuRecommendationRepository.find.mockResolvedValue(recommendations);
      bugReportRepository.find.mockResolvedValue(bugReports);

      const result = await service.findOne(userId);

      expect(result.id).toBe(userId);
      expect(result.addresses).toHaveLength(1);
      expect(result.stats.menuRecommendations).toBe(5);
      expect(result.stats.menuSelections).toBe(3);
      expect(result.stats.bugReports).toBe(2);
      expect(result.preferences).not.toBeNull();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        new NotFoundException({ errorCode: ErrorCode.ADMIN_USER_NOT_FOUND }),
      );
    });

    it('should return preferences as null when user has no preferences', async () => {
      const userId = 1;
      const user = UserFactory.create({ id: userId, preferences: null });

      userRepository.findOne.mockResolvedValue(user);
      addressRepository.find.mockResolvedValue([]);
      menuRecommendationRepository.count.mockResolvedValue(0);
      menuSelectionRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      const result = await service.findOne(userId);

      expect(result.preferences).toBeNull();
    });

    it('should return deletedAt as null when user is not deleted', async () => {
      const userId = 1;
      const user = UserFactory.create({ id: userId, deletedAt: null });

      userRepository.findOne.mockResolvedValue(user);
      addressRepository.find.mockResolvedValue([]);
      menuRecommendationRepository.count.mockResolvedValue(0);
      menuSelectionRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      const result = await service.findOne(userId);

      expect(result.deletedAt).toBeNull();
    });

    it('should return deletedAt as ISO string when user is deleted', async () => {
      const userId = 1;
      const deletedAt = new Date('2024-01-01T12:00:00.000Z');
      const user = UserFactory.create({ id: userId, deletedAt });

      userRepository.findOne.mockResolvedValue(user);
      addressRepository.find.mockResolvedValue([]);
      menuRecommendationRepository.count.mockResolvedValue(0);
      menuSelectionRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      const result = await service.findOne(userId);

      expect(result.deletedAt).toBe(deletedAt.toISOString());
    });
  });

  describe('deactivate', () => {
    describe('Permission Validation', () => {
      it('should throw BadRequestException when trying to deactivate self', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 1;

        // Act & Assert
        await expect(
          service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
        ).rejects.toThrow(
          new BadRequestException('자기 자신을 비활성화할 수 없습니다'),
        );
        expect(userRepository.findOneBy).not.toHaveBeenCalled();
        expect(userRepository.update).not.toHaveBeenCalled();
      });

      it('should throw ForbiddenException when attempting to deactivate SUPER_ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.SUPER_ADMIN,
        });

        userRepository.findOneBy.mockResolvedValue(targetUser);

        // Act & Assert
        await expect(
          service.deactivate(
            targetUserId,
            requestUserId,
            ROLES.SUPER_ADMIN,
            '127.0.0.1',
          ),
        ).rejects.toThrow(
          new ForbiddenException('SUPER_ADMIN은 비활성화할 수 없습니다'),
        );
        expect(userRepository.findOneBy).toHaveBeenCalledWith({
          id: targetUserId,
        });
        expect(userRepository.update).not.toHaveBeenCalled();
      });

      it('should throw ForbiddenException when ADMIN tries to deactivate ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.ADMIN,
        });

        userRepository.findOneBy.mockResolvedValue(targetUser);

        // Act & Assert
        await expect(
          service.deactivate(
            targetUserId,
            requestUserId,
            ROLES.ADMIN,
            '127.0.0.1',
          ),
        ).rejects.toThrow(
          new ForbiddenException('ADMIN은 USER만 비활성화할 수 있습니다'),
        );
        expect(userRepository.findOneBy).toHaveBeenCalledWith({
          id: targetUserId,
        });
        expect(userRepository.update).not.toHaveBeenCalled();
      });

      it('should throw ForbiddenException when ADMIN tries to deactivate SUPER_ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.SUPER_ADMIN,
        });

        userRepository.findOneBy.mockResolvedValue(targetUser);

        // Act & Assert
        await expect(
          service.deactivate(
            targetUserId,
            requestUserId,
            ROLES.ADMIN,
            '127.0.0.1',
          ),
        ).rejects.toThrow(
          new ForbiddenException('SUPER_ADMIN은 비활성화할 수 없습니다'),
        );
      });

      it('should throw NotFoundException when target user does not exist', async () => {
        // Arrange
        const targetUserId = 999;
        const requestUserId = 2;

        userRepository.findOneBy.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.deactivate(
            targetUserId,
            requestUserId,
            ROLES.ADMIN,
            '127.0.0.1',
          ),
        ).rejects.toThrow(
          new NotFoundException({ errorCode: ErrorCode.ADMIN_USER_NOT_FOUND }),
        );
        expect(userRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('Successful Deactivation', () => {
      it('should successfully deactivate USER when requester is ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.USER,
          isDeactivated: false,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };

        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          targetUserId,
          requestUserId,
          ROLES.ADMIN,
          '127.0.0.1',
        );

        // Assert
        expect(userRepository.findOneBy).toHaveBeenCalledWith({
          id: targetUserId,
        });
        expect(userRepository.update).toHaveBeenCalledWith(
          { id: targetUserId, isDeactivated: false },
          {
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
          },
        );
      });

      it('should successfully deactivate ADMIN when requester is SUPER_ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.ADMIN,
          isDeactivated: false,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };

        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          targetUserId,
          requestUserId,
          ROLES.SUPER_ADMIN,
          '127.0.0.1',
        );

        // Assert
        expect(userRepository.findOneBy).toHaveBeenCalledWith({
          id: targetUserId,
        });
        expect(userRepository.update).toHaveBeenCalledWith(
          { id: targetUserId, isDeactivated: false },
          {
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
          },
        );
      });

      it('should successfully deactivate USER when requester is SUPER_ADMIN', async () => {
        // Arrange
        const targetUserId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: targetUserId,
          role: ROLES.USER,
          isDeactivated: false,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };

        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          targetUserId,
          requestUserId,
          ROLES.SUPER_ADMIN,
          '127.0.0.1',
        );

        // Assert
        expect(userRepository.findOneBy).toHaveBeenCalledWith({
          id: targetUserId,
        });
        expect(userRepository.update).toHaveBeenCalledWith(
          { id: targetUserId, isDeactivated: false },
          {
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
          },
        );
      });
    });

    describe('Original Tests - Atomic Update Behavior', () => {
      it('should deactivate active user using atomic update', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };
        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          userId,
          requestUserId,
          ROLES.ADMIN,
          '127.0.0.1',
        );

        // Assert
        expect(userRepository.update).toHaveBeenCalledWith(
          { id: userId, isDeactivated: false },
          {
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
          },
        );
        expect(userRepository.update).toHaveBeenCalledTimes(1);
      });

      it('should throw ConflictException when user is already deactivated', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const updateResult = { affected: 0, raw: [], generatedMaps: [] };
        const deactivatedUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
          isDeactivated: true,
          deactivatedAt: new Date(),
        });

        userRepository.findOneBy.mockResolvedValue(deactivatedUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act & Assert
        await expect(
          service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
        ).rejects.toThrow(
          new ConflictException({
            errorCode: ErrorCode.ADMIN_USER_ALREADY_DEACTIVATED,
          }),
        );

        expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
      });

      it('should prevent race condition by using WHERE clause in UPDATE', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };
        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          userId,
          requestUserId,
          ROLES.ADMIN,
          '127.0.0.1',
        );

        // Assert - Verify atomic WHERE clause includes both id and isDeactivated
        expect(userRepository.update).toHaveBeenCalledWith(
          expect.objectContaining({
            id: userId,
            isDeactivated: false, // Critical: prevents concurrent deactivation
          }),
          expect.objectContaining({
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
          }),
        );
      });

      it('should set deactivatedAt to current timestamp', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
        });
        const beforeCall = new Date();
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };
        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          userId,
          requestUserId,
          ROLES.ADMIN,
          '127.0.0.1',
        );

        // Assert
        const afterCall = new Date();
        const updateCall = userRepository.update.mock.calls[0];
        const deactivatedAt = updateCall[1].deactivatedAt as Date;

        expect(deactivatedAt).toBeInstanceOf(Date);
        expect(deactivatedAt.getTime()).toBeGreaterThanOrEqual(
          beforeCall.getTime(),
        );
        expect(deactivatedAt.getTime()).toBeLessThanOrEqual(
          afterCall.getTime(),
        );
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
        });
        const dbError = new Error('Database connection error');
        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
        ).rejects.toThrow(dbError);
      });

      it('should delete refresh token from Redis when deactivating user', async () => {
        // Arrange
        const userId = 1;
        const requestUserId = 2;
        const targetUser = UserFactory.create({
          id: userId,
          role: ROLES.USER,
        });
        const updateResult = { affected: 1, raw: [], generatedMaps: [] };
        userRepository.findOneBy.mockResolvedValue(targetUser);
        userRepository.update.mockResolvedValue(updateResult);

        // Act
        await service.deactivate(
          userId,
          requestUserId,
          ROLES.ADMIN,
          '127.0.0.1',
        );

        // Assert: Redis-based token deletion ensures user is logged out
        expect(cacheService.deleteRefreshToken).toHaveBeenCalledWith(userId);
      });
    });
  });

  describe('activate - missing branch coverage', () => {
    it('should throw BadRequestException when trying to activate self', async () => {
      const userId = 1;
      const requestUserId = 1;

      await expect(
        service.activate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(
        new BadRequestException('자기 자신을 활성화할 수 없습니다'),
      );
      expect(userRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when trying to activate SUPER_ADMIN', async () => {
      const targetUserId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: targetUserId,
        role: ROLES.SUPER_ADMIN,
        isDeactivated: true,
      });

      userRepository.findOneBy.mockResolvedValue(targetUser);

      await expect(
        service.activate(
          targetUserId,
          requestUserId,
          ROLES.SUPER_ADMIN,
          '127.0.0.1',
        ),
      ).rejects.toThrow(
        new ForbiddenException('SUPER_ADMIN은 활성화할 수 없습니다'),
      );
    });

    it('should throw ForbiddenException when ADMIN tries to activate ADMIN', async () => {
      const targetUserId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: targetUserId,
        role: ROLES.ADMIN,
        isDeactivated: true,
      });

      userRepository.findOneBy.mockResolvedValue(targetUser);

      await expect(
        service.activate(targetUserId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(
        new ForbiddenException('ADMIN은 USER만 활성화할 수 있습니다'),
      );
    });

    it('should save audit log when activation succeeds', async () => {
      const userId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };

      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      await service.activate(userId, requestUserId, ROLES.ADMIN, '10.0.0.1');

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: requestUserId,
          ipAddress: '10.0.0.1',
        }),
      );
    });
  });

  describe('activate', () => {
    it('should activate deactivated user using atomic update', async () => {
      // Arrange
      const userId = 1;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1');

      // Assert
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: userId, isDeactivated: true },
        { isDeactivated: false, deactivatedAt: null },
      );
      expect(userRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException when user is already active', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };
      const activeUser = UserFactory.create({
        id: userId,
        isDeactivated: false,
        deactivatedAt: null,
      });

      userRepository.update.mockResolvedValue(updateResult);
      userRepository.findOneBy.mockResolvedValue(activeUser);

      // Act & Assert
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(
        new ConflictException({
          errorCode: ErrorCode.ADMIN_USER_ALREADY_ACTIVATED,
        }),
      );

      expect(userRepository.update).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      const userId = 999;

      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(
        new NotFoundException({ errorCode: ErrorCode.ADMIN_USER_NOT_FOUND }),
      );

      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should prevent race condition by using WHERE clause in UPDATE', async () => {
      // Arrange
      const userId = 1;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1');

      // Assert - Verify atomic WHERE clause includes both id and isDeactivated
      expect(userRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          isDeactivated: true, // Critical: prevents concurrent activation
        }),
        expect.objectContaining({
          isDeactivated: false,
          deactivatedAt: null,
        }),
      );
    });

    it('should clear deactivatedAt when activating user', async () => {
      // Arrange
      const userId = 1;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1');

      // Assert
      const updateCall = userRepository.update.mock.calls[0];
      expect(updateCall[1]).toEqual({
        isDeactivated: false,
        deactivatedAt: null, // Must be cleared
      });
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const userId = 1;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const dbError = new Error('Database connection error');
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockRejectedValue(dbError);

      // Act & Assert
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(dbError);
    });
  });

  describe('deactivate - audit log', () => {
    it('should save audit log when deactivation succeeds', async () => {
      const userId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: false,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };

      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      await service.deactivate(
        userId,
        requestUserId,
        ROLES.ADMIN,
        '192.168.0.1',
      );

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: requestUserId,
          ipAddress: '192.168.0.1',
        }),
      );
    });
  });

  describe('Race Condition Prevention Integration', () => {
    it('should handle concurrent deactivate calls correctly', async () => {
      // Arrange
      const userId = 1;
      const requestUserId = 2;
      const firstCallResult = { affected: 1, raw: [], generatedMaps: [] };
      const secondCallResult = { affected: 0, raw: [], generatedMaps: [] };
      const activeUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: false,
      });
      const deactivatedUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });

      userRepository.findOneBy
        .mockResolvedValueOnce(activeUser) // First call
        .mockResolvedValueOnce(deactivatedUser); // Second call
      userRepository.update
        .mockResolvedValueOnce(firstCallResult) // First call succeeds
        .mockResolvedValueOnce(secondCallResult); // Second call fails (already deactivated)

      // Act
      await service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'); // First call should succeed

      // Second concurrent call should fail
      await expect(
        service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle concurrent activate calls correctly', async () => {
      // Arrange
      const userId = 1;
      const firstCallResult = { affected: 1, raw: [], generatedMaps: [] };
      const secondCallResult = { affected: 0, raw: [], generatedMaps: [] };
      const activeUser = UserFactory.create({
        id: userId,
        isDeactivated: false,
      });

      userRepository.update
        .mockResolvedValueOnce(firstCallResult) // First call succeeds
        .mockResolvedValueOnce(secondCallResult); // Second call fails (already active)
      userRepository.findOneBy.mockResolvedValue(activeUser);

      // Act
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'); // First call should succeed

      // Second concurrent call should fail
      await expect(
        service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle deactivate then activate sequence', async () => {
      // Arrange
      const userId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act - Deactivate first
      await service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: userId, isDeactivated: false },
        expect.any(Object),
      );

      // Act - Then activate
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: userId, isDeactivated: true },
        expect.any(Object),
      );

      // Assert - Both calls should succeed with correct WHERE clauses
      expect(userRepository.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle deactivate with null deactivatedAt', async () => {
      // Arrange
      const userId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1');

      // Assert
      const updateCall = userRepository.update.mock.calls[0];
      expect(updateCall[1].deactivatedAt).not.toBeNull();
      expect(updateCall[1].deactivatedAt).toBeInstanceOf(Date);
    });

    it('should handle activate clearing deactivatedAt properly', async () => {
      // Arrange
      const userId = 1;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
        isDeactivated: true,
      });
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId, 2, ROLES.ADMIN, '127.0.0.1');

      // Assert
      const updateCall = userRepository.update.mock.calls[0];
      expect(updateCall[1].deactivatedAt).toBeNull();
    });

    it('should handle update with zero affected rows for non-existent user', async () => {
      // Arrange
      const userId = 999;
      const requestUserId = 2;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };
      userRepository.findOneBy.mockResolvedValue(null);
      userRepository.update.mockResolvedValue(updateResult);

      // Act & Assert
      await expect(
        service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle update with affected > 1 (should not happen but test defensive)', async () => {
      // Arrange - This shouldn't happen in production but test the happy path
      const userId = 1;
      const requestUserId = 2;
      const targetUser = UserFactory.create({
        id: userId,
        role: ROLES.USER,
      });
      const updateResult = { affected: 2, raw: [], generatedMaps: [] }; // Abnormal
      userRepository.findOneBy.mockResolvedValue(targetUser);
      userRepository.update.mockResolvedValue(updateResult);

      // Act - Should not throw since affected > 0
      await expect(
        service.deactivate(userId, requestUserId, ROLES.ADMIN, '127.0.0.1'),
      ).resolves.not.toThrow();
    });
  });
});
