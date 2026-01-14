import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';
import { ADMIN_ROLES, Role, ROLES } from '@/common/constants/roles.constants';
import { SystemSetting } from './entities/system-setting.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminListItemDto } from './dto/admin-list-item.dto';
import { WebhookSettingsDto } from './dto/webhook-settings.dto';
import { UpdateWebhookSettingsDto } from './dto/update-webhook-settings.dto';
import {
  DataRetentionSettings,
  MenuRecommendationSettings,
  SecuritySettings,
  SystemSettingsDto,
} from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { EncryptionUtil } from './utils/encryption.util';

// System setting keys
const SETTING_KEYS = {
  WEBHOOK: 'webhook_settings',
  MENU_RECOMMENDATION: 'menu_recommendation',
  SECURITY: 'security',
  DATA_RETENTION: 'data_retention',
} as const;

// Default settings
const DEFAULT_WEBHOOK_SETTINGS = {
  enabled: false,
  webhookUrl: '',
  thresholds: {
    newBugReportEnabled: true,
    criticalBugAlertEnabled: true,
    dailySummaryEnabled: false,
  },
};

const DEFAULT_MENU_RECOMMENDATION_SETTINGS: MenuRecommendationSettings = {
  maxRecommendationsPerDay: 10,
  defaultCuisineTypes: ['korean', 'japanese', 'chinese', 'western'],
  aiModelVersion: 'gpt-4o-mini',
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  sessionTimeoutMinutes: 60,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 30,
};

const DEFAULT_DATA_RETENTION_SETTINGS: DataRetentionSettings = {
  userDataRetentionDays: 365,
  auditLogRetentionDays: 90,
  deletedAccountRetentionDays: 30,
};

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);
  private readonly encryptionUtil: EncryptionUtil;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SystemSetting)
    private readonly systemSettingRepository: Repository<SystemSetting>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepository: Repository<AdminAuditLog>,
    private readonly discordWebhookClient: DiscordWebhookClient,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    const encryptionKey = this.configService.getOrThrow<string>(
      'SETTINGS_ENCRYPTION_KEY',
    );
    this.encryptionUtil = new EncryptionUtil(encryptionKey);
  }

  /**
   * Get list of all admin users
   */
  async getAdminList(): Promise<AdminListItemDto[]> {
    const admins = await this.userRepository.find({
      where: { role: In([...ADMIN_ROLES]) },
      order: { createdAt: 'DESC' },
    });

    return admins.map((admin) => ({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as Role,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    }));
  }

  /**
   * Promote a user to admin or super admin role
   */
  async promoteToAdmin(
    userId: number,
    role: Role,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === role) {
      throw new BadRequestException(`User is already ${role}`);
    }

    const previousRole = user.role;
    user.role = role;
    await this.userRepository.save(user);

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: 'PROMOTE_ADMIN',
      target: `user:${userId}`,
      previousValue: { role: previousRole },
      newValue: { role },
      ipAddress,
    });

    this.logger.log(
      `Admin ${currentAdmin.email} promoted user ${user.email} from ${previousRole} to ${role}`,
    );
  }

  /**
   * Demote an admin back to regular user
   */
  async demoteAdmin(
    userId: number,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<void> {
    if (userId === currentAdmin.id) {
      throw new ForbiddenException('Cannot remove your own admin role');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === ROLES.USER) {
      throw new BadRequestException('User is not an admin');
    }

    const previousRole = user.role;
    user.role = ROLES.USER;
    await this.userRepository.save(user);

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: 'DEMOTE_ADMIN',
      target: `user:${userId}`,
      previousValue: { role: previousRole },
      newValue: { role: ROLES.USER },
      ipAddress,
    });

    this.logger.log(
      `Admin ${currentAdmin.email} demoted user ${user.email} from ${previousRole} to USER`,
    );
  }

  /**
   * Get webhook settings with masked URL
   */
  async getWebhookSettings(): Promise<WebhookSettingsDto> {
    const setting = await this.systemSettingRepository.findOne({
      where: { key: SETTING_KEYS.WEBHOOK },
    });

    if (!setting) {
      return {
        ...DEFAULT_WEBHOOK_SETTINGS,
        webhookUrl: '',
      };
    }

    const value = setting.value as typeof DEFAULT_WEBHOOK_SETTINGS;
    let webhookUrl = '';

    if (value.webhookUrl) {
      try {
        const decryptedUrl = this.encryptionUtil.decrypt(value.webhookUrl);
        webhookUrl = EncryptionUtil.maskUrl(decryptedUrl);
      } catch {
        this.logger.warn('Failed to decrypt webhook URL');
        webhookUrl = '[Encrypted - Unable to display]';
      }
    }

    return {
      enabled: value.enabled ?? DEFAULT_WEBHOOK_SETTINGS.enabled,
      webhookUrl,
      thresholds: value.thresholds ?? DEFAULT_WEBHOOK_SETTINGS.thresholds,
    };
  }

  /**
   * Update webhook settings
   */
  async updateWebhookSettings(
    dto: UpdateWebhookSettingsDto,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<WebhookSettingsDto> {
    let setting = await this.systemSettingRepository.findOne({
      where: { key: SETTING_KEYS.WEBHOOK },
    });

    const previousValue = setting?.value ?? DEFAULT_WEBHOOK_SETTINGS;

    const prevThresholds =
      (previousValue as { thresholds?: Record<string, unknown> }).thresholds ??
      {};
    const updatedValue = {
      enabled:
        dto.enabled ??
        (previousValue as { enabled?: boolean }).enabled ??
        false,
      webhookUrl: dto.webhookUrl
        ? this.encryptionUtil.encrypt(dto.webhookUrl)
        : ((previousValue as { webhookUrl?: string }).webhookUrl ?? ''),
      thresholds: {
        ...prevThresholds,
        ...dto.thresholds,
      },
    };

    if (setting) {
      setting.value = updatedValue as unknown as Record<string, unknown>;
      setting.updatedById = currentAdmin.id;
    } else {
      setting = this.systemSettingRepository.create({
        key: SETTING_KEYS.WEBHOOK,
        value: updatedValue as unknown as Record<string, unknown>,
        description: 'Discord webhook notification settings',
        updatedById: currentAdmin.id,
      });
    }

    await this.systemSettingRepository.save(setting);

    // Create sanitized audit log (never log actual webhook URL)
    const sanitizedPrevious = {
      ...previousValue,
      webhookUrl: (previousValue as Record<string, unknown>).webhookUrl
        ? '[ENCRYPTED]'
        : '',
    };
    const sanitizedNew = {
      ...updatedValue,
      webhookUrl: updatedValue.webhookUrl ? '[ENCRYPTED]' : '',
    };

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: 'UPDATE_WEBHOOK_SETTINGS',
      target: SETTING_KEYS.WEBHOOK,
      previousValue: sanitizedPrevious as Record<string, unknown>,
      newValue: sanitizedNew as Record<string, unknown>,
      ipAddress,
    });

    this.logger.log(`Admin ${currentAdmin.email} updated webhook settings`);

    return this.getWebhookSettings();
  }

  /**
   * Test webhook by sending a test message
   */
  async testWebhook(): Promise<{ success: boolean; message: string }> {
    const setting = await this.systemSettingRepository.findOne({
      where: { key: SETTING_KEYS.WEBHOOK },
    });

    if (!setting) {
      throw new BadRequestException('Webhook settings not configured');
    }

    const value = setting.value as typeof DEFAULT_WEBHOOK_SETTINGS;

    if (!value.enabled) {
      throw new BadRequestException('Webhook is disabled');
    }

    if (!value.webhookUrl) {
      throw new BadRequestException('Webhook URL is not configured');
    }

    try {
      await this.discordWebhookClient.sendMessage({
        embeds: [
          {
            title: 'Test Notification',
            description:
              'This is a test message from PickEat Admin Panel. If you see this message, the webhook is configured correctly.',
            color: 3066993, // Green
            timestamp: new Date().toISOString(),
          },
        ],
      });

      return {
        success: true,
        message: 'Test message sent successfully',
      };
    } catch (error) {
      this.logger.error(`Webhook test failed: ${(error as Error).message}`);
      return {
        success: false,
        message: `Failed to send test message: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get all system settings
   */
  async getSystemSettings(): Promise<SystemSettingsDto> {
    const settings = await this.systemSettingRepository.find({
      where: {
        key: In([
          SETTING_KEYS.MENU_RECOMMENDATION,
          SETTING_KEYS.SECURITY,
          SETTING_KEYS.DATA_RETENTION,
        ]),
      },
    });

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    return {
      menuRecommendation: (settingsMap.get(SETTING_KEYS.MENU_RECOMMENDATION) ??
        DEFAULT_MENU_RECOMMENDATION_SETTINGS) as MenuRecommendationSettings,
      security: (settingsMap.get(SETTING_KEYS.SECURITY) ??
        DEFAULT_SECURITY_SETTINGS) as SecuritySettings,
      dataRetention: (settingsMap.get(SETTING_KEYS.DATA_RETENTION) ??
        DEFAULT_DATA_RETENTION_SETTINGS) as DataRetentionSettings,
    };
  }

  /**
   * Update system settings
   */
  async updateSystemSettings(
    dto: UpdateSystemSettingsDto,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<SystemSettingsDto> {
    return await this.dataSource.transaction(async (manager) => {
      const currentSettings = await this.getSystemSettings();

      const updatePromises: Promise<void>[] = [];

      if (dto.menuRecommendation) {
        updatePromises.push(
          this.updateSingleSettingInTransaction(
            manager,
            SETTING_KEYS.MENU_RECOMMENDATION,
            {
              ...currentSettings.menuRecommendation,
              ...dto.menuRecommendation,
            } as unknown as Record<string, unknown>,
            currentSettings.menuRecommendation as unknown as Record<
              string,
              unknown
            >,
            currentAdmin,
            ipAddress,
            'Menu recommendation settings',
          ),
        );
      }

      if (dto.security) {
        updatePromises.push(
          this.updateSingleSettingInTransaction(
            manager,
            SETTING_KEYS.SECURITY,
            {
              ...currentSettings.security,
              ...dto.security,
            } as unknown as Record<string, unknown>,
            currentSettings.security as unknown as Record<string, unknown>,
            currentAdmin,
            ipAddress,
            'Security settings',
          ),
        );
      }

      if (dto.dataRetention) {
        updatePromises.push(
          this.updateSingleSettingInTransaction(
            manager,
            SETTING_KEYS.DATA_RETENTION,
            {
              ...currentSettings.dataRetention,
              ...dto.dataRetention,
            } as unknown as Record<string, unknown>,
            currentSettings.dataRetention as unknown as Record<string, unknown>,
            currentAdmin,
            ipAddress,
            'Data retention settings',
          ),
        );
      }

      await Promise.all(updatePromises);

      this.logger.log(`Admin ${currentAdmin.email} updated system settings`);

      return this.getSystemSettings();
    });
  }

  /**
   * Helper to update a single system setting
   */
  private async updateSingleSetting(
    key: string,
    newValue: Record<string, unknown>,
    previousValue: Record<string, unknown>,
    currentAdmin: User,
    ipAddress: string,
    description: string,
  ): Promise<void> {
    let setting = await this.systemSettingRepository.findOne({
      where: { key },
    });

    if (setting) {
      setting.value = newValue;
      setting.updatedById = currentAdmin.id;
    } else {
      setting = this.systemSettingRepository.create({
        key,
        value: newValue,
        description,
        updatedById: currentAdmin.id,
      });
    }

    await this.systemSettingRepository.save(setting);

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: 'UPDATE_SYSTEM_SETTINGS',
      target: key,
      previousValue,
      newValue,
      ipAddress,
    });
  }

  /**
   * Helper to update a single system setting within a transaction
   */
  private async updateSingleSettingInTransaction(
    manager: EntityManager,
    key: string,
    newValue: Record<string, unknown>,
    previousValue: Record<string, unknown>,
    currentAdmin: User,
    ipAddress: string,
    description: string,
  ): Promise<void> {
    let setting = await manager.findOne(SystemSetting, {
      where: { key },
    });

    if (setting) {
      setting.value = newValue;
      setting.updatedById = currentAdmin.id;
    } else {
      setting = manager.create(SystemSetting, {
        key,
        value: newValue,
        description,
        updatedById: currentAdmin.id,
      });
    }

    await manager.save(SystemSetting, setting);

    const auditLog = manager.create(AdminAuditLog, {
      adminId: currentAdmin.id,
      action: 'UPDATE_SYSTEM_SETTINGS',
      target: key,
      previousValue,
      newValue,
      ipAddress,
    });

    await manager.save(AdminAuditLog, auditLog);
  }

  /**
   * Create an audit log entry
   */
  private async createAuditLog(params: {
    adminId: number;
    action: string;
    target: string | null;
    previousValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    ipAddress: string;
  }): Promise<void> {
    const auditLog = this.auditLogRepository.create({
      adminId: params.adminId,
      action: params.action,
      target: params.target,
      previousValue: params.previousValue,
      newValue: params.newValue,
      ipAddress: params.ipAddress,
    });

    await this.auditLogRepository.save(auditLog);
  }
}
