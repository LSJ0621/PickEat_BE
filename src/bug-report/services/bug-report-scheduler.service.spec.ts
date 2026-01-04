import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BugReportSchedulerService } from './bug-report-scheduler.service';
import { BugReportNotificationService } from './bug-report-notification.service';
import { DiscordMessageBuilderService } from './discord-message-builder.service';
import { BugReport } from '../entities/bug-report.entity';
import { BugReportStatus } from '../enum/bug-report-status.enum';
import { DiscordWebhookClient } from '../../external/discord/clients/discord-webhook.client';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { createMockService } from '../../../test/utils/test-helpers';
import { createMockDiscordWebhookClient } from '../../../test/mocks/external-clients.mock';
import { BugReportFactory } from '../../../test/factories/entity.factory';
import { DiscordEmbed } from '../../external/discord/discord.types';

describe('BugReportSchedulerService', () => {
  let service: BugReportSchedulerService;
  let bugReportRepository: ReturnType<typeof createMockRepository<BugReport>>;
  let discordWebhookClient: ReturnType<typeof createMockDiscordWebhookClient>;
  let notificationService: jest.Mocked<BugReportNotificationService>;
  let messageBuilder: jest.Mocked<DiscordMessageBuilderService>;

  beforeEach(async () => {
    bugReportRepository = createMockRepository<BugReport>();
    discordWebhookClient = createMockDiscordWebhookClient();
    notificationService = createMockService<BugReportNotificationService>([
      'shouldSendNotification',
      'recordNotification',
    ]);
    messageBuilder = createMockService<DiscordMessageBuilderService>([
      'buildThresholdAlertEmbed',
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugReportSchedulerService,
        {
          provide: getRepositoryToken(BugReport),
          useValue: bugReportRepository,
        },
        {
          provide: DiscordWebhookClient,
          useValue: discordWebhookClient,
        },
        {
          provide: BugReportNotificationService,
          useValue: notificationService,
        },
        {
          provide: DiscordMessageBuilderService,
          useValue: messageBuilder,
        },
      ],
    }).compile();

    service = module.get<BugReportSchedulerService>(BugReportSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAndNotifyUnconfirmedCount', () => {
    it('should not send notification if threshold not reached', async () => {
      bugReportRepository.count.mockResolvedValue(8);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: false,
        lastThreshold: null,
      });

      await service.checkAndNotifyUnconfirmedCount();

      expect(bugReportRepository.count).toHaveBeenCalledWith({
        where: { status: BugReportStatus.UNCONFIRMED },
      });
      expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
      expect(notificationService.recordNotification).not.toHaveBeenCalled();
    });

    it('should not send notification if threshold has not increased', async () => {
      bugReportRepository.count.mockResolvedValue(15);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: false,
        lastThreshold: 10,
      });

      await service.checkAndNotifyUnconfirmedCount();

      expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
      expect(notificationService.recordNotification).not.toHaveBeenCalled();
    });

    it('should send notification for first threshold (10)', async () => {
      const currentCount = 12;
      const threshold = 10;
      const recentBugs = [
        BugReportFactory.create({ id: 1 }),
        BugReportFactory.create({ id: 2 }),
      ];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: `미확인 버그가 **${currentCount}개**에 도달했습니다.`,
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockResolvedValue(undefined);

      await service.checkAndNotifyUnconfirmedCount();

      expect(bugReportRepository.find).toHaveBeenCalledWith({
        where: { status: BugReportStatus.UNCONFIRMED },
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: 5,
      });
      expect(messageBuilder.buildThresholdAlertEmbed).toHaveBeenCalledWith({
        currentCount,
        lastThreshold: null,
        threshold,
        recentBugs,
      });
      expect(discordWebhookClient.sendMessage).toHaveBeenCalledWith({
        embeds: [mockEmbed],
      });
      expect(notificationService.recordNotification).toHaveBeenCalledWith(
        currentCount,
        threshold,
      );
    });

    it('should send notification when threshold increases from 10 to 20', async () => {
      const currentCount = 22;
      const threshold = 20;
      const lastThreshold = 10;
      const recentBugs = [BugReportFactory.create({ id: 1 })];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: `미확인 버그가 **${currentCount}개**에 도달했습니다. (이전: ${lastThreshold}개, +${currentCount - lastThreshold}개 증가)`,
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockResolvedValue(undefined);

      await service.checkAndNotifyUnconfirmedCount();

      expect(messageBuilder.buildThresholdAlertEmbed).toHaveBeenCalledWith({
        currentCount,
        lastThreshold,
        threshold,
        recentBugs,
      });
      expect(notificationService.recordNotification).toHaveBeenCalledWith(
        currentCount,
        threshold,
      );
    });

    it('should send notification when threshold increases to 100', async () => {
      const currentCount = 105;
      const threshold = 100;
      const lastThreshold = 50;
      const recentBugs = [
        BugReportFactory.create({ id: 1 }),
        BugReportFactory.create({ id: 2 }),
        BugReportFactory.create({ id: 3 }),
        BugReportFactory.create({ id: 4 }),
        BugReportFactory.create({ id: 5 }),
      ];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: `미확인 버그가 **${currentCount}개**에 도달했습니다.`,
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockResolvedValue(undefined);

      await service.checkAndNotifyUnconfirmedCount();

      expect(bugReportRepository.find).toHaveBeenCalledWith({
        where: { status: BugReportStatus.UNCONFIRMED },
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: 5,
      });
      expect(notificationService.recordNotification).toHaveBeenCalledWith(
        currentCount,
        threshold,
      );
    });

    it('should not throw if Discord webhook fails', async () => {
      const currentCount = 15;
      const recentBugs = [BugReportFactory.create()];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: '',
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord API error'),
      );

      // Should not throw
      await expect(
        service.checkAndNotifyUnconfirmedCount(),
      ).resolves.toBeUndefined();
    });

    it('should log error if Discord webhook fails', async () => {
      const currentCount = 15;
      const recentBugs = [BugReportFactory.create()];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: '',
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord API error'),
      );

      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.checkAndNotifyUnconfirmedCount();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('버그 제보 알림 전송 실패'),
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it('should handle edge case when currentThreshold is null (should not happen)', async () => {
      const currentCount = 105;

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });

      // Mock determineThreshold to return null (edge case simulation)
      // This is handled by the service itself
      const recentBugs = [BugReportFactory.create()];
      bugReportRepository.find.mockResolvedValue(recentBugs);

      // Since determineThreshold would return 100 for count 105, this test ensures the check works
      await service.checkAndNotifyUnconfirmedCount();

      // Should call messageBuilder since 105 is >= 100
      expect(messageBuilder.buildThresholdAlertEmbed).toHaveBeenCalled();
    });

    it('should not record notification if Discord send fails', async () => {
      const currentCount = 15;
      const recentBugs = [BugReportFactory.create()];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: '',
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord API error'),
      );

      await service.checkAndNotifyUnconfirmedCount();

      // Should not record notification if send fails
      expect(notificationService.recordNotification).not.toHaveBeenCalled();
    });

    it('should include user relation in recent bugs query', async () => {
      const currentCount = 12;
      const recentBugs = [BugReportFactory.create()];
      const mockEmbed: DiscordEmbed = {
        title: '🚨 미확인 버그 제보 임계값 도달',
        description: '',
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      };

      bugReportRepository.count.mockResolvedValue(currentCount);
      notificationService.shouldSendNotification.mockResolvedValue({
        should: true,
        lastThreshold: null,
      });
      bugReportRepository.find.mockResolvedValue(recentBugs);
      messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
      discordWebhookClient.sendMessage.mockResolvedValue(undefined);

      await service.checkAndNotifyUnconfirmedCount();

      expect(bugReportRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user'],
        }),
      );
    });
  });
});
