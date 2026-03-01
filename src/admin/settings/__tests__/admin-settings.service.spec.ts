import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { AdminSettingsService } from '../admin-settings.service';
import { User } from '@/user/entities/user.entity';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { ROLES, ADMIN_ROLES } from '@/common/constants/roles.constants';

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let userRepository: jest.Mocked<Repository<User>>;
  let auditLogRepository: jest.Mocked<Repository<AdminAuditLog>>;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AdminAuditLog>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: auditLogRepository,
        },
      ],
    }).compile();

    service = module.get<AdminSettingsService>(AdminSettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdminList', () => {
    it('should return only users with ADMIN or SUPER_ADMIN role', async () => {
      // Arrange
      const admin1 = UserFactory.create({
        id: 1,
        email: 'admin1@example.com',
        role: ROLES.ADMIN,
      });
      const admin2 = UserFactory.create({
        id: 2,
        email: 'admin2@example.com',
        role: ROLES.SUPER_ADMIN,
      });
      userRepository.find.mockResolvedValue([admin1, admin2]);

      // Act
      const result = await service.getAdminList();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(ROLES.ADMIN);
      expect(result[1].role).toBe(ROLES.SUPER_ADMIN);
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { role: In([...ADMIN_ROLES]) },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no admins exist', async () => {
      // Arrange
      userRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.getAdminList();

      // Assert
      expect(result).toEqual([]);
      expect(userRepository.find).toHaveBeenCalledTimes(1);
    });

    it('should return admin list with correct DTO structure', async () => {
      // Arrange
      const admin = UserFactory.create({
        id: 1,
        email: 'admin@example.com',
        name: 'Admin User',
        role: ROLES.ADMIN,
        lastLoginAt: new Date('2024-01-01'),
        createdAt: new Date('2023-01-01'),
      });
      userRepository.find.mockResolvedValue([admin]);

      // Act
      const result = await service.getAdminList();

      // Assert
      expect(result[0]).toEqual({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
        createdAt: admin.createdAt.toISOString(),
      });
    });

    it('should order admins by createdAt DESC', async () => {
      // Arrange
      const admin1 = UserFactory.create({
        id: 1,
        createdAt: new Date('2023-01-01'),
      });
      const admin2 = UserFactory.create({
        id: 2,
        createdAt: new Date('2024-01-01'),
      });
      userRepository.find.mockResolvedValue([admin2, admin1]);

      // Act
      await service.getAdminList();

      // Assert
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { role: In([...ADMIN_ROLES]) },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('promoteToAdmin', () => {
    it('should promote user to ADMIN and create audit log', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.USER });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.ADMIN });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.promoteToAdmin(
        user.id,
        undefined,
        ROLES.ADMIN,
        currentAdmin,
        ipAddress,
      );

      // Assert
      expect(user.role).toBe(ROLES.ADMIN);
      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should promote user to SUPER_ADMIN and create audit log', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.ADMIN });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({
        ...user,
        role: ROLES.SUPER_ADMIN,
      });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.promoteToAdmin(
        user.id,
        undefined,
        ROLES.SUPER_ADMIN,
        currentAdmin,
        ipAddress,
      );

      // Assert
      expect(user.role).toBe(ROLES.SUPER_ADMIN);
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.promoteToAdmin(
          999,
          undefined,
          ROLES.ADMIN,
          currentAdmin,
          ipAddress,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(auditLogRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user already has the role', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.ADMIN });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);

      // Act & Assert
      await expect(
        service.promoteToAdmin(
          user.id,
          undefined,
          ROLES.ADMIN,
          currentAdmin,
          ipAddress,
        ),
      ).rejects.toThrow(
        new BadRequestException(`User is already ${ROLES.ADMIN}`),
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when neither userId nor email is provided (line 57)', async () => {
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';

      await expect(
        service.promoteToAdmin(
          undefined,
          undefined,
          ROLES.ADMIN,
          currentAdmin,
          ipAddress,
        ),
      ).rejects.toThrow(
        new BadRequestException('Either userId or email must be provided'),
      );
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when both userId and email are provided (line 61)', async () => {
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';

      await expect(
        service.promoteToAdmin(
          1,
          'user@example.com',
          ROLES.ADMIN,
          currentAdmin,
          ipAddress,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Provide only one identifier: userId or email, not both',
        ),
      );
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it('should find user by email when userId is not provided', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        role: ROLES.USER,
      });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.ADMIN });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      await service.promoteToAdmin(
        undefined,
        'user@example.com',
        ROLES.ADMIN,
        currentAdmin,
        ipAddress,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('should create audit log with correct data', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.USER });
      const currentAdmin = UserFactory.create({
        id: 2,
        email: 'admin@example.com',
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '192.168.1.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.ADMIN });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.promoteToAdmin(
        user.id,
        undefined,
        ROLES.ADMIN,
        currentAdmin,
        ipAddress,
      );

      // Assert
      expect(auditLogRepository.create).toHaveBeenCalledWith({
        adminId: currentAdmin.id,
        action: 'PROMOTE_ADMIN',
        target: `user:${user.id}`,
        previousValue: { role: ROLES.USER },
        newValue: { role: ROLES.ADMIN },
        ipAddress,
      });
    });
  });

  describe('demoteAdmin', () => {
    it('should demote admin to USER and create audit log', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.ADMIN });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.USER });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.demoteAdmin(user.id, currentAdmin, ipAddress);

      // Assert
      expect(user.role).toBe(ROLES.USER);
      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when trying to demote self', async () => {
      // Arrange
      const currentAdmin = UserFactory.create({
        id: 1,
        role: ROLES.ADMIN,
      });
      const ipAddress = '127.0.0.1';

      // Act & Assert
      await expect(
        service.demoteAdmin(currentAdmin.id, currentAdmin, ipAddress),
      ).rejects.toThrow(
        new ForbiddenException('Cannot remove your own admin role'),
      );
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.demoteAdmin(999, currentAdmin, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is not an admin', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.USER });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);

      // Act & Assert
      await expect(
        service.demoteAdmin(user.id, currentAdmin, ipAddress),
      ).rejects.toThrow(new BadRequestException('User is not an admin'));
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should create audit log with correct data', async () => {
      // Arrange
      const user = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        role: ROLES.ADMIN,
      });
      const currentAdmin = UserFactory.create({
        id: 2,
        email: 'admin@example.com',
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '192.168.1.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.USER });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.demoteAdmin(user.id, currentAdmin, ipAddress);

      // Assert
      expect(auditLogRepository.create).toHaveBeenCalledWith({
        adminId: currentAdmin.id,
        action: 'DEMOTE_ADMIN',
        target: `user:${user.id}`,
        previousValue: { role: ROLES.ADMIN },
        newValue: { role: ROLES.USER },
        ipAddress,
      });
    });

    it('should throw ForbiddenException when trying to demote SUPER_ADMIN', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.SUPER_ADMIN });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);

      // Act & Assert
      await expect(
        service.demoteAdmin(user.id, currentAdmin, ipAddress),
      ).rejects.toThrow(
        new ForbiddenException('SUPER_ADMIN 역할은 강등할 수 없습니다'),
      );
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(auditLogRepository.save).not.toHaveBeenCalled();
    });

    it('should successfully demote regular ADMIN to USER', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.ADMIN });
      const currentAdmin = UserFactory.create({
        id: 2,
        role: ROLES.SUPER_ADMIN,
      });
      const ipAddress = '127.0.0.1';
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, role: ROLES.USER });
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.demoteAdmin(user.id, currentAdmin, ipAddress);

      // Assert
      expect(user.role).toBe(ROLES.USER);
      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousValue: { role: ROLES.ADMIN },
          newValue: { role: ROLES.USER },
        }),
      );
    });
  });
});
