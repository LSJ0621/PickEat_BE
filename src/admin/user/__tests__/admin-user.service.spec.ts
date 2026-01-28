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
import { UserFactory } from '../../../../test/factories/entity.factory';
import { ROLES } from '@/common/constants/roles.constants';
import { ErrorCode } from '@/common/constants/error-codes';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let addressRepository: jest.Mocked<Repository<UserAddress>>;
  let menuRecommendationRepository: jest.Mocked<Repository<MenuRecommendation>>;
  let menuSelectionRepository: jest.Mocked<Repository<MenuSelection>>;
  let bugReportRepository: jest.Mocked<Repository<BugReport>>;
  let auditLogRepository: jest.Mocked<Repository<AdminAuditLog>>;

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
      ],
    }).compile();

    service = module.get<AdminUserService>(AdminUserService);
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
            refreshToken: null,
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
            refreshToken: null,
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
            refreshToken: null,
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
            refreshToken: null,
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

      it('should set refreshToken to null when deactivating user', async () => {
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
          expect.objectContaining({
            isDeactivated: true,
            deactivatedAt: expect.any(Date),
            refreshToken: null, // Critical: ensures user is logged out
          }),
        );
      });
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
