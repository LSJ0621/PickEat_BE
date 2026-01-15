import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminUserService } from '../admin-user.service';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { UserFactory } from '../../../../test/factories/entity.factory';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let addressRepository: jest.Mocked<Repository<UserAddress>>;
  let menuRecommendationRepository: jest.Mocked<Repository<MenuRecommendation>>;
  let menuSelectionRepository: jest.Mocked<Repository<MenuSelection>>;
  let bugReportRepository: jest.Mocked<Repository<BugReport>>;

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
      ],
    }).compile();

    service = module.get<AdminUserService>(AdminUserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deactivate', () => {
    it('should deactivate active user using atomic update', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId);

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
      expect(userRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when user is already deactivated', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };
      const deactivatedUser = UserFactory.create({
        id: userId,
        isDeactivated: true,
        deactivatedAt: new Date(),
      });

      userRepository.update.mockResolvedValue(updateResult);
      userRepository.findOneBy.mockResolvedValue(deactivatedUser);

      // Act & Assert
      await expect(service.deactivate(userId)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.deactivate(userId)).rejects.toThrow(
        '이미 비활성화된 사용자입니다.',
      );

      expect(userRepository.update).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      const userId = 999;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };

      userRepository.update.mockResolvedValue(updateResult);
      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deactivate(userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deactivate(userId)).rejects.toThrow(
        '사용자를 찾을 수 없습니다.',
      );

      expect(userRepository.update).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
    });

    it('should prevent race condition by using WHERE clause in UPDATE', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId);

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
      const beforeCall = new Date();
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId);

      // Assert
      const afterCall = new Date();
      const updateCall = userRepository.update.mock.calls[0];
      const deactivatedAt = updateCall[1].deactivatedAt as Date;

      expect(deactivatedAt).toBeInstanceOf(Date);
      expect(deactivatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime(),
      );
      expect(deactivatedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const userId = 1;
      const dbError = new Error('Database connection error');
      userRepository.update.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.deactivate(userId)).rejects.toThrow(dbError);
    });

    it('should set refreshToken to null when deactivating user', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId);

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

  describe('activate', () => {
    it('should activate deactivated user using atomic update', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId);

      // Assert
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: userId, isDeactivated: true },
        { isDeactivated: false, deactivatedAt: null },
      );
      expect(userRepository.update).toHaveBeenCalledTimes(1);
      expect(userRepository.findOneBy).not.toHaveBeenCalled();
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
      await expect(service.activate(userId)).rejects.toThrow(ConflictException);
      await expect(service.activate(userId)).rejects.toThrow(
        '이미 활성화된 사용자입니다.',
      );

      expect(userRepository.update).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      const userId = 999;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };

      userRepository.update.mockResolvedValue(updateResult);
      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(service.activate(userId)).rejects.toThrow(NotFoundException);
      await expect(service.activate(userId)).rejects.toThrow(
        '사용자를 찾을 수 없습니다.',
      );

      expect(userRepository.update).toHaveBeenCalledTimes(2);
      expect(userRepository.findOneBy).toHaveBeenCalledTimes(2);
    });

    it('should prevent race condition by using WHERE clause in UPDATE', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId);

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
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId);

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
      const dbError = new Error('Database connection error');
      userRepository.update.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.activate(userId)).rejects.toThrow(dbError);
    });
  });

  describe('Race Condition Prevention Integration', () => {
    it('should handle concurrent deactivate calls correctly', async () => {
      // Arrange
      const userId = 1;
      const firstCallResult = { affected: 1, raw: [], generatedMaps: [] };
      const secondCallResult = { affected: 0, raw: [], generatedMaps: [] };
      const deactivatedUser = UserFactory.create({
        id: userId,
        isDeactivated: true,
      });

      userRepository.update
        .mockResolvedValueOnce(firstCallResult) // First call succeeds
        .mockResolvedValueOnce(secondCallResult); // Second call fails (already deactivated)
      userRepository.findOneBy.mockResolvedValue(deactivatedUser);

      // Act
      await service.deactivate(userId); // First call should succeed

      // Second concurrent call should fail
      await expect(service.deactivate(userId)).rejects.toThrow(
        ConflictException,
      );
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
      await service.activate(userId); // First call should succeed

      // Second concurrent call should fail
      await expect(service.activate(userId)).rejects.toThrow(ConflictException);
    });

    it('should handle deactivate then activate sequence', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act - Deactivate first
      await service.deactivate(userId);
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: userId, isDeactivated: false },
        expect.any(Object),
      );

      // Act - Then activate
      await service.activate(userId);
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
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.deactivate(userId);

      // Assert
      const updateCall = userRepository.update.mock.calls[0];
      expect(updateCall[1].deactivatedAt).not.toBeNull();
      expect(updateCall[1].deactivatedAt).toBeInstanceOf(Date);
    });

    it('should handle activate clearing deactivatedAt properly', async () => {
      // Arrange
      const userId = 1;
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);

      // Act
      await service.activate(userId);

      // Assert
      const updateCall = userRepository.update.mock.calls[0];
      expect(updateCall[1].deactivatedAt).toBeNull();
    });

    it('should handle update with zero affected rows for non-existent user', async () => {
      // Arrange
      const userId = 999;
      const updateResult = { affected: 0, raw: [], generatedMaps: [] };
      userRepository.update.mockResolvedValue(updateResult);
      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deactivate(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle update with affected > 1 (should not happen but test defensive)', async () => {
      // Arrange - This shouldn't happen in production but test the happy path
      const userId = 1;
      const updateResult = { affected: 2, raw: [], generatedMaps: [] }; // Abnormal
      userRepository.update.mockResolvedValue(updateResult);

      // Act - Should not throw since affected > 0
      await expect(service.deactivate(userId)).resolves.not.toThrow();

      // Assert
      expect(userRepository.findOneBy).not.toHaveBeenCalled();
    });
  });
});
