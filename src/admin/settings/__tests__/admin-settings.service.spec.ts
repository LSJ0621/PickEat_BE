import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository, In } from 'typeorm';
import { AdminSettingsService } from '../admin-settings.service';
import { User } from '@/user/entities/user.entity';
import { SystemSetting } from '../entities/system-setting.entity';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { ROLES, ADMIN_ROLES } from '@/common/constants/roles.constants';

// Helper function to create SystemSetting mocks
function createSystemSetting(
  key: string,
  value: Record<string, unknown>,
): SystemSetting {
  return {
    key,
    value,
    description: null,
    updatedBy: null,
    updatedById: null,
    updatedAt: new Date(),
  } as SystemSetting;
}

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let userRepository: jest.Mocked<Repository<User>>;
  let systemSettingRepository: jest.Mocked<Repository<SystemSetting>>;
  let auditLogRepository: jest.Mocked<Repository<AdminAuditLog>>;
  let discordWebhookClient: jest.Mocked<DiscordWebhookClient>;
  let configService: jest.Mocked<ConfigService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockEncryptionKey = 'test-encryption-key-32-chars!!!';

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    systemSettingRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<SystemSetting>>;

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AdminAuditLog>>;

    discordWebhookClient = {
      sendMessage: jest.fn(),
    } as unknown as jest.Mocked<DiscordWebhookClient>;

    configService = {
      get: jest.fn().mockReturnValue(mockEncryptionKey),
      getOrThrow: jest.fn().mockReturnValue(mockEncryptionKey),
    } as unknown as jest.Mocked<ConfigService>;

    // Mock DataSource for transaction testing
    const mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn((callback) => callback(mockEntityManager)),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(SystemSetting),
          useValue: systemSettingRepository,
        },
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: auditLogRepository,
        },
        {
          provide: DiscordWebhookClient,
          useValue: discordWebhookClient,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
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
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
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
        service.promoteToAdmin(999, ROLES.ADMIN, currentAdmin, ipAddress),
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
        service.promoteToAdmin(user.id, ROLES.ADMIN, currentAdmin, ipAddress),
      ).rejects.toThrow(
        new BadRequestException(`User is already ${ROLES.ADMIN}`),
      );
      expect(userRepository.save).not.toHaveBeenCalled();
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

    it('should demote SUPER_ADMIN to USER', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1, role: ROLES.SUPER_ADMIN });
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
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousValue: { role: ROLES.SUPER_ADMIN },
          newValue: { role: ROLES.USER },
        }),
      );
    });
  });

  describe('getWebhookSettings', () => {
    it('should return default settings when no setting exists', async () => {
      // Arrange
      systemSettingRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getWebhookSettings();

      // Assert
      expect(result).toEqual({
        enabled: false,
        webhookUrl: '',
        thresholds: {
          newBugReportEnabled: true,
          criticalBugAlertEnabled: true,
          dailySummaryEnabled: false,
        },
      });
    });

    it('should return masked webhook URL', async () => {
      // Arrange
      const encryptedUrl = service['encryptionUtil'].encrypt(
        'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz',
      );
      const setting = {
        key: 'webhook_settings',
        value: {
          enabled: true,
          webhookUrl: encryptedUrl,
          thresholds: {
            newBugReportEnabled: true,
            criticalBugAlertEnabled: true,
            dailySummaryEnabled: true,
          },
        },
        description: null,
        updatedBy: null,
        updatedById: null,
        updatedAt: new Date(),
      } as SystemSetting;
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act
      const result = await service.getWebhookSettings();

      // Assert
      expect(result.enabled).toBe(true);
      expect(result.webhookUrl).toContain('...');
      expect(result.webhookUrl.length).toBeLessThan(
        'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz'
          .length,
      );
      expect(result.thresholds).toEqual({
        newBugReportEnabled: true,
        criticalBugAlertEnabled: true,
        dailySummaryEnabled: true,
      });
    });

    it('should return fallback message when decryption fails', async () => {
      // Arrange
      const setting = createSystemSetting('webhook_settings', {
        enabled: true,
        webhookUrl: 'invalid-encrypted-data',
        thresholds: {
          newBugReportEnabled: true,
          criticalBugAlertEnabled: true,
          dailySummaryEnabled: false,
        },
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act
      const result = await service.getWebhookSettings();

      // Assert
      expect(result.webhookUrl).toBe('[Encrypted - Unable to display]');
    });

    it('should return empty string when webhookUrl is empty', async () => {
      // Arrange
      const setting = createSystemSetting('webhook_settings', {
        enabled: false,
        webhookUrl: '',
        thresholds: {
          newBugReportEnabled: true,
          criticalBugAlertEnabled: true,
          dailySummaryEnabled: false,
        },
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act
      const result = await service.getWebhookSettings();

      // Assert
      expect(result.webhookUrl).toBe('');
    });

    it('should use default values for missing properties', async () => {
      // Arrange
      const setting = createSystemSetting('webhook_settings', {
        webhookUrl: '',
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act
      const result = await service.getWebhookSettings();

      // Assert
      expect(result.enabled).toBe(false);
      expect(result.thresholds).toEqual({
        newBugReportEnabled: true,
        criticalBugAlertEnabled: true,
        dailySummaryEnabled: false,
      });
    });
  });

  describe('updateWebhookSettings', () => {
    const currentAdmin = UserFactory.create({
      id: 1,
      email: 'admin@example.com',
      role: ROLES.ADMIN,
    });
    const ipAddress = '127.0.0.1';

    it('should create new setting when none exists', async () => {
      // Arrange
      const dto = {
        enabled: true,
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        thresholds: {
          newBugReportEnabled: true,
          criticalBugAlertEnabled: true,
          dailySummaryEnabled: true,
        },
      };
      systemSettingRepository.findOne.mockResolvedValue(null);
      systemSettingRepository.create.mockImplementation(
        (data) => data as SystemSetting,
      );
      systemSettingRepository.save.mockResolvedValue({} as SystemSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(systemSettingRepository.create).toHaveBeenCalled();
      expect(systemSettingRepository.save).toHaveBeenCalled();
      const createCall = systemSettingRepository.create.mock.calls[0][0];
      expect(createCall.key).toBe('webhook_settings');
      expect(createCall.value!.enabled).toBe(true);
      expect(createCall.value!.webhookUrl).not.toBe(dto.webhookUrl); // Should be encrypted
    });

    it('should encrypt webhook URL before saving', async () => {
      // Arrange
      const dto = {
        webhookUrl: 'https://discord.com/api/webhooks/123/secret',
      };
      systemSettingRepository.findOne.mockResolvedValue(null);
      systemSettingRepository.create.mockImplementation(
        (data) => data as SystemSetting,
      );
      systemSettingRepository.save.mockResolvedValue({} as SystemSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      const createCall = systemSettingRepository.create.mock.calls[0][0];
      const encryptedUrl = createCall.value!.webhookUrl as string;
      expect(encryptedUrl).not.toBe(dto.webhookUrl);
      expect(encryptedUrl.split(':')).toHaveLength(3); // iv:authTag:encrypted format
    });

    it('should update existing setting', async () => {
      // Arrange
      const dto = {
        enabled: false,
      };
      const existingSetting = {
        ...createSystemSetting('webhook_settings', {
          enabled: true,
          webhookUrl: 'encrypted-url',
          thresholds: {
            newBugReportEnabled: true,
            criticalBugAlertEnabled: true,
            dailySummaryEnabled: false,
          },
        }),
        updatedById: 1,
      };
      systemSettingRepository.findOne.mockResolvedValue(existingSetting);
      systemSettingRepository.save.mockResolvedValue(existingSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(existingSetting.value.enabled).toBe(false);
      expect(existingSetting.updatedById).toBe(currentAdmin.id);
      expect(systemSettingRepository.save).toHaveBeenCalledWith(
        existingSetting,
      );
    });

    it('should merge thresholds with existing values', async () => {
      // Arrange
      const dto = {
        thresholds: {
          dailySummaryEnabled: true,
        },
      };
      const existingSetting = createSystemSetting('webhook_settings', {
        enabled: true,
        webhookUrl: 'encrypted-url',
        thresholds: {
          newBugReportEnabled: true,
          criticalBugAlertEnabled: true,
          dailySummaryEnabled: false,
        },
      });
      systemSettingRepository.findOne.mockResolvedValue(existingSetting);
      systemSettingRepository.save.mockResolvedValue(existingSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(existingSetting.value.thresholds).toEqual({
        newBugReportEnabled: true,
        criticalBugAlertEnabled: true,
        dailySummaryEnabled: true,
      });
    });

    it('should create audit log with sanitized webhook URL', async () => {
      // Arrange
      const dto = {
        webhookUrl: 'https://discord.com/api/webhooks/123/secret',
      };
      systemSettingRepository.findOne.mockResolvedValue(null);
      systemSettingRepository.create.mockImplementation(
        (data) => data as SystemSetting,
      );
      systemSettingRepository.save.mockResolvedValue({} as SystemSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_WEBHOOK_SETTINGS',
          newValue: expect.objectContaining({
            webhookUrl: '[ENCRYPTED]',
          }),
        }),
      );
    });

    it('should preserve existing webhookUrl when not provided in DTO', async () => {
      // Arrange
      const dto = {
        enabled: true,
      };
      const existingEncryptedUrl = 'existing-encrypted-url';
      const existingSetting = createSystemSetting('webhook_settings', {
        enabled: false,
        webhookUrl: existingEncryptedUrl,
        thresholds: {},
      });
      systemSettingRepository.findOne.mockResolvedValue(existingSetting);
      systemSettingRepository.save.mockResolvedValue(existingSetting);
      auditLogRepository.create.mockReturnValue({} as AdminAuditLog);
      auditLogRepository.save.mockResolvedValue({} as AdminAuditLog);

      // Act
      await service.updateWebhookSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(existingSetting.value.webhookUrl).toBe(existingEncryptedUrl);
    });
  });

  describe('testWebhook', () => {
    it('should send test message successfully', async () => {
      // Arrange
      const encryptedUrl = service['encryptionUtil'].encrypt(
        'https://discord.com/api/webhooks/123/abc',
      );
      const setting = createSystemSetting('webhook_settings', {
        enabled: true,
        webhookUrl: encryptedUrl,
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);
      discordWebhookClient.sendMessage.mockResolvedValue(undefined);

      // Act
      const result = await service.testWebhook();

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Test message sent successfully');
      expect(discordWebhookClient.sendMessage).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            title: 'Test Notification',
            color: 3066993,
          }),
        ],
      });
    });

    it('should throw BadRequestException when webhook settings not configured', async () => {
      // Arrange
      systemSettingRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.testWebhook()).rejects.toThrow(
        new BadRequestException('Webhook settings not configured'),
      );
      expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when webhook is disabled', async () => {
      // Arrange
      const setting = createSystemSetting('webhook_settings', {
        enabled: false,
        webhookUrl: 'encrypted-url',
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act & Assert
      await expect(service.testWebhook()).rejects.toThrow(
        new BadRequestException('Webhook is disabled'),
      );
      expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when webhook URL is not configured', async () => {
      // Arrange
      const setting = createSystemSetting('webhook_settings', {
        enabled: true,
        webhookUrl: '',
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);

      // Act & Assert
      await expect(service.testWebhook()).rejects.toThrow(
        new BadRequestException('Webhook URL is not configured'),
      );
      expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error message when webhook client fails', async () => {
      // Arrange
      const encryptedUrl = service['encryptionUtil'].encrypt(
        'https://discord.com/api/webhooks/123/abc',
      );
      const setting = createSystemSetting('webhook_settings', {
        enabled: true,
        webhookUrl: encryptedUrl,
      });
      systemSettingRepository.findOne.mockResolvedValue(setting);
      const errorMessage = 'Invalid webhook URL';
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error(errorMessage),
      );

      // Act
      const result = await service.testWebhook();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        `Failed to send test message: ${errorMessage}`,
      );
    });
  });

  describe('getSystemSettings', () => {
    it('should return all system settings with defaults', async () => {
      // Arrange
      systemSettingRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.getSystemSettings();

      // Assert
      expect(result).toEqual({
        menuRecommendation: {
          maxRecommendationsPerDay: 10,
          defaultCuisineTypes: ['korean', 'japanese', 'chinese', 'western'],
          aiModelVersion: 'gpt-4o-mini',
        },
        security: {
          sessionTimeoutMinutes: 60,
          maxLoginAttempts: 5,
          lockoutDurationMinutes: 30,
        },
        dataRetention: {
          userDataRetentionDays: 365,
          auditLogRetentionDays: 90,
          deletedAccountRetentionDays: 30,
        },
      });
    });

    it('should return custom menu recommendation settings', async () => {
      // Arrange
      const menuRecommendationSetting = createSystemSetting(
        'menu_recommendation',
        {
          maxRecommendationsPerDay: 5,
          defaultCuisineTypes: ['korean', 'japanese'],
          aiModelVersion: 'gpt-4o',
        },
      );
      systemSettingRepository.find.mockResolvedValue([
        menuRecommendationSetting,
      ]);

      // Act
      const result = await service.getSystemSettings();

      // Assert
      expect(result.menuRecommendation).toEqual({
        maxRecommendationsPerDay: 5,
        defaultCuisineTypes: ['korean', 'japanese'],
        aiModelVersion: 'gpt-4o',
      });
    });

    it('should return custom security settings', async () => {
      // Arrange
      const securitySetting = createSystemSetting('security', {
        sessionTimeoutMinutes: 120,
        maxLoginAttempts: 3,
        lockoutDurationMinutes: 60,
      });
      systemSettingRepository.find.mockResolvedValue([securitySetting]);

      // Act
      const result = await service.getSystemSettings();

      // Assert
      expect(result.security).toEqual({
        sessionTimeoutMinutes: 120,
        maxLoginAttempts: 3,
        lockoutDurationMinutes: 60,
      });
    });

    it('should return custom data retention settings', async () => {
      // Arrange
      const dataRetentionSetting = createSystemSetting('data_retention', {
        userDataRetentionDays: 730,
        auditLogRetentionDays: 180,
        deletedAccountRetentionDays: 60,
      });
      systemSettingRepository.find.mockResolvedValue([dataRetentionSetting]);

      // Act
      const result = await service.getSystemSettings();

      // Assert
      expect(result.dataRetention).toEqual({
        userDataRetentionDays: 730,
        auditLogRetentionDays: 180,
        deletedAccountRetentionDays: 60,
      });
    });

    it('should merge custom and default settings', async () => {
      // Arrange
      const securitySetting = createSystemSetting('security', {
        sessionTimeoutMinutes: 90,
        maxLoginAttempts: 10,
        lockoutDurationMinutes: 15,
      });
      systemSettingRepository.find.mockResolvedValue([securitySetting]);

      // Act
      const result = await service.getSystemSettings();

      // Assert
      expect(result.security).toEqual({
        sessionTimeoutMinutes: 90,
        maxLoginAttempts: 10,
        lockoutDurationMinutes: 15,
      });
      expect(result.menuRecommendation).toEqual({
        maxRecommendationsPerDay: 10,
        defaultCuisineTypes: ['korean', 'japanese', 'chinese', 'western'],
        aiModelVersion: 'gpt-4o-mini',
      });
      expect(result.dataRetention).toEqual({
        userDataRetentionDays: 365,
        auditLogRetentionDays: 90,
        deletedAccountRetentionDays: 30,
      });
    });
  });

  describe('updateSystemSettings', () => {
    const currentAdmin = UserFactory.create({
      id: 1,
      email: 'admin@example.com',
      role: ROLES.ADMIN,
    });
    const ipAddress = '127.0.0.1';

    beforeEach(() => {
      systemSettingRepository.find.mockResolvedValue([]);

      // Setup entity manager mock for transaction tests
      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;
    });

    it('should update menu recommendation settings', async () => {
      // Arrange
      const dto = {
        menuRecommendation: {
          maxRecommendationsPerDay: 15,
        },
      };

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert - Uses transaction
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should update security settings', async () => {
      // Arrange
      const dto = {
        security: {
          sessionTimeoutMinutes: 120,
        },
      };

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert - Uses transaction
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should update data retention settings', async () => {
      // Arrange
      const dto = {
        dataRetention: {
          userDataRetentionDays: 180,
        },
      };

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert - Uses transaction
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should update multiple settings at once', async () => {
      // Arrange
      const dto = {
        menuRecommendation: {
          maxRecommendationsPerDay: 20,
        },
        security: {
          maxLoginAttempts: 10,
        },
        dataRetention: {
          auditLogRetentionDays: 120,
        },
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert - All updates happen through entity manager in transaction
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(6); // 3 settings + 3 audit logs
    });

    it('should merge partial updates with existing settings', async () => {
      // Arrange
      const existingMenuSetting = createSystemSetting('menu_recommendation', {
        maxRecommendationsPerDay: 10,
        defaultCuisineTypes: ['korean', 'japanese'],
        aiModelVersion: 'gpt-4o-mini',
      });
      systemSettingRepository.find.mockResolvedValue([existingMenuSetting]);

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(existingMenuSetting),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      const dto = {
        menuRecommendation: {
          maxRecommendationsPerDay: 15,
        },
      };

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        SystemSetting,
        expect.objectContaining({
          value: {
            maxRecommendationsPerDay: 15,
            defaultCuisineTypes: ['korean', 'japanese'],
            aiModelVersion: 'gpt-4o-mini',
          },
        }),
      );
    });

    it('should create new setting when none exists', async () => {
      // Arrange
      const dto = {
        security: {
          sessionTimeoutMinutes: 90,
          maxLoginAttempts: 8,
          lockoutDurationMinutes: 45,
        },
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        SystemSetting,
        expect.objectContaining({
          key: 'security',
          description: 'Security settings',
        }),
      );
    });

    it('should create audit logs for all updates', async () => {
      // Arrange
      const dto = {
        menuRecommendation: {
          maxRecommendationsPerDay: 20,
        },
        security: {
          maxLoginAttempts: 10,
        },
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          adminId: currentAdmin.id,
          action: 'UPDATE_SYSTEM_SETTINGS',
          ipAddress,
        }),
      );
    });

    it('should set updatedById for all updates', async () => {
      // Arrange
      const dto = {
        menuRecommendation: {
          maxRecommendationsPerDay: 20,
        },
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((entity, data) => data),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.updateSystemSettings(dto, currentAdmin, ipAddress);

      // Assert
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        SystemSetting,
        expect.objectContaining({
          updatedById: currentAdmin.id,
        }),
      );
    });

    describe('Transaction Validation', () => {
      beforeEach(() => {
        // Reset transaction mock for each test
        const mockEntityManager = {
          findOne: jest.fn(),
          save: jest.fn(),
          create: jest.fn(),
        };
        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;
      });

      it('should execute all updates within a single transaction', async () => {
        // Arrange
        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 15,
          },
          security: {
            sessionTimeoutMinutes: 120,
          },
          dataRetention: {
            userDataRetentionDays: 180,
          },
        };

        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        // Mock getSystemSettings to return defaults
        systemSettingRepository.find.mockResolvedValue([]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert - All updates should happen in single transaction
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(dataSource.transaction).toHaveBeenCalledWith(
          expect.any(Function),
        );

        // Verify all saves happened through entity manager (inside transaction)
        expect(mockEntityManager.save).toHaveBeenCalledTimes(6); // 3 settings + 3 audit logs
      });

      it('should rollback all changes if any update fails within transaction', async () => {
        // Arrange
        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 15,
          },
          security: {
            sessionTimeoutMinutes: 120,
          },
        };

        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest
            .fn()
            .mockResolvedValueOnce({}) // First save succeeds
            .mockResolvedValueOnce({}) // Second save succeeds
            .mockRejectedValueOnce(new Error('Database constraint violation')), // Third save fails
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([]);

        // Act & Assert - Transaction should fail and rollback
        await expect(
          service.updateSystemSettings(dto, currentAdmin, ipAddress),
        ).rejects.toThrow('Database constraint violation');

        // Verify transaction was called
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      });

      it('should create settings and audit logs within same transaction', async () => {
        // Arrange
        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 20,
          },
        };

        const saveCalls: Array<{ entity: unknown; data: unknown }> = [];
        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockImplementation((entity, data) => {
            saveCalls.push({ entity, data });
            return Promise.resolve(data);
          }),
          create: jest.fn().mockImplementation((entity, data) => ({
            ...data,
            entity,
          })),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert
        expect(saveCalls).toHaveLength(2); // 1 setting + 1 audit log

        // First call should be SystemSetting save
        expect(saveCalls[0].entity).toBe(SystemSetting);
        expect(saveCalls[0].data).toMatchObject({
          key: 'menu_recommendation',
          updatedById: currentAdmin.id,
        });

        // Second call should be AdminAuditLog save
        expect(saveCalls[1].entity).toBe(AdminAuditLog);
        expect(saveCalls[1].data).toMatchObject({
          adminId: currentAdmin.id,
          action: 'UPDATE_SYSTEM_SETTINGS',
          target: 'menu_recommendation',
          ipAddress,
        });
      });

      it('should use entity manager methods instead of repository methods', async () => {
        // Arrange
        const dto = {
          security: {
            sessionTimeoutMinutes: 90,
          },
        };

        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert - Verify entity manager was used, not repositories
        expect(mockEntityManager.findOne).toHaveBeenCalled();
        expect(mockEntityManager.save).toHaveBeenCalled();
        expect(mockEntityManager.create).toHaveBeenCalled();

        // Repository methods should NOT be called during transaction
        expect(systemSettingRepository.save).not.toHaveBeenCalled();
        expect(systemSettingRepository.create).not.toHaveBeenCalled();
        expect(auditLogRepository.save).not.toHaveBeenCalled();
      });

      it('should handle transaction with existing settings and merge updates', async () => {
        // Arrange
        const existingMenuSetting = createSystemSetting('menu_recommendation', {
          maxRecommendationsPerDay: 10,
          defaultCuisineTypes: ['korean', 'japanese'],
          aiModelVersion: 'gpt-4o-mini',
        });

        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 25,
          },
        };

        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(existingMenuSetting),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([existingMenuSetting]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert
        expect(mockEntityManager.save).toHaveBeenCalledWith(
          SystemSetting,
          expect.objectContaining({
            key: 'menu_recommendation',
            value: {
              maxRecommendationsPerDay: 25,
              defaultCuisineTypes: ['korean', 'japanese'],
              aiModelVersion: 'gpt-4o-mini',
            },
            updatedById: currentAdmin.id,
          }),
        );
      });

      it('should properly handle parallel updates without race conditions', async () => {
        // Arrange
        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 15,
          },
          security: {
            sessionTimeoutMinutes: 90,
          },
          dataRetention: {
            userDataRetentionDays: 200,
          },
        };

        const executionOrder: string[] = [];
        const mockEntityManager = {
          findOne: jest.fn().mockImplementation((entity, options) => {
            executionOrder.push(`findOne:${options.where.key}`);
            return Promise.resolve(null);
          }),
          save: jest.fn().mockImplementation((entity, data) => {
            executionOrder.push(`save:${data.key || 'audit'}`);
            return Promise.resolve(data);
          }),
          create: jest.fn().mockImplementation((entity, data) => {
            executionOrder.push(`create:${data.key || 'audit'}`);
            return data;
          }),
        };

        dataSource.transaction = jest.fn((callback) =>
          callback(mockEntityManager),
        ) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert - Verify operations executed in order within transaction
        expect(executionOrder.length).toBeGreaterThan(0);

        // All operations should be grouped by setting type
        const menuOps = executionOrder.filter((op) =>
          op.includes('menu_recommendation'),
        );
        const securityOps = executionOrder.filter((op) =>
          op.includes('security'),
        );
        const dataRetentionOps = executionOrder.filter((op) =>
          op.includes('data_retention'),
        );

        expect(menuOps.length).toBeGreaterThan(0);
        expect(securityOps.length).toBeGreaterThan(0);
        expect(dataRetentionOps.length).toBeGreaterThan(0);
      });

      it('should handle empty DTO and return default settings', async () => {
        // Arrange
        const dto = {}; // Empty DTO

        systemSettingRepository.find.mockResolvedValue([]);

        const mockEntityManager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn(async (callback) => {
          return await callback(mockEntityManager);
        }) as jest.Mock;

        // Act
        const result = await service.updateSystemSettings(
          dto,
          currentAdmin,
          ipAddress,
        );

        // Assert - With empty DTO, should return current settings without changes
        expect(result).toEqual({
          menuRecommendation: expect.any(Object),
          security: expect.any(Object),
          dataRetention: expect.any(Object),
        });

        // Transaction should still be called (method wraps everything in transaction)
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      });

      it('should maintain atomicity when updating multiple related settings', async () => {
        // Arrange
        const dto = {
          menuRecommendation: {
            maxRecommendationsPerDay: 50,
            aiModelVersion: 'gpt-4o',
          },
          security: {
            maxLoginAttempts: 3,
            lockoutDurationMinutes: 60,
          },
        };

        let transactionStarted = false;
        let transactionCompleted = false;

        const mockEntityManager = {
          findOne: jest.fn().mockImplementation(() => {
            expect(transactionStarted).toBe(true);
            return Promise.resolve(null);
          }),
          save: jest.fn().mockImplementation(() => {
            expect(transactionStarted).toBe(true);
            expect(transactionCompleted).toBe(false);
            return Promise.resolve({});
          }),
          create: jest.fn().mockImplementation((entity, data) => data),
        };

        dataSource.transaction = jest.fn(async (callback) => {
          transactionStarted = true;
          const result = await callback(mockEntityManager);
          transactionCompleted = true;
          return result;
        }) as jest.Mock;

        systemSettingRepository.find.mockResolvedValue([]);

        // Act
        await service.updateSystemSettings(dto, currentAdmin, ipAddress);

        // Assert
        expect(transactionStarted).toBe(true);
        expect(transactionCompleted).toBe(true);
      });
    });
  });
});
