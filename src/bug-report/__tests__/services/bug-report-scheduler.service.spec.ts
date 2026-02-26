import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BugReportSchedulerService } from '../../services/bug-report-scheduler.service';
import { BugReportNotificationService } from '../../services/bug-report-notification.service';
import { DiscordMessageBuilderService } from '../../services/discord-message-builder.service';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';
import { BugReport } from '../../entities/bug-report.entity';
import { BugReportStatus } from '../../enum/bug-report-status.enum';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import { createMockService } from '../../../../test/utils/test-helpers';
import { createMockDiscordWebhookClient } from '../../../../test/mocks/external-clients.mock';
import { BugReportFactory } from '../../../../test/factories/entity.factory';
import { DiscordEmbed } from '@/external/discord/discord.types';

const buildMockEmbed = (description = ''): DiscordEmbed => ({
  title: '🚨 미확인 버그 제보 임계값 도달',
  description,
  color: 0xff0000,
  fields: [],
  timestamp: new Date().toISOString(),
});

describe('BugReportSchedulerService', () => {
  let service: BugReportSchedulerService;
  let bugReportRepository: ReturnType<typeof createMockRepository<BugReport>>;
  let discordWebhookClient: ReturnType<typeof createMockDiscordWebhookClient>;
  let notificationService: jest.Mocked<BugReportNotificationService>;
  let messageBuilder: jest.Mocked<DiscordMessageBuilderService>;
  let schedulerAlertService: jest.Mocked<SchedulerAlertService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    jest.clearAllMocks();

    bugReportRepository = createMockRepository<BugReport>();
    discordWebhookClient = createMockDiscordWebhookClient();
    notificationService = createMockService<BugReportNotificationService>([
      'shouldSendNotification',
      'recordNotification',
    ]);
    messageBuilder = createMockService<DiscordMessageBuilderService>([
      'buildThresholdAlertEmbed',
    ]);
    schedulerAlertService = createMockService<SchedulerAlertService>([
      'alertFailure',
    ]);

    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

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
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: SchedulerAlertService,
          useValue: schedulerAlertService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('300000'),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addInterval: jest.fn(),
            deleteInterval: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BugReportSchedulerService>(BugReportSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAndNotifyUnconfirmedCount', () => {
    describe('when notification should not be sent', () => {
      it.each([
        {
          label: 'count below threshold',
          count: 8,
          shouldSendResult: { should: false, lastThreshold: null },
        },
        {
          label: 'threshold has not increased',
          count: 15,
          shouldSendResult: { should: false, lastThreshold: 10 },
        },
      ])(
        'should not send notification when $label',
        async ({ count, shouldSendResult }) => {
          bugReportRepository.count.mockResolvedValue(count);
          notificationService.shouldSendNotification.mockResolvedValue(
            shouldSendResult,
          );

          await service.checkAndNotifyUnconfirmedCount();

          expect(bugReportRepository.count).toHaveBeenCalledWith({
            where: { status: BugReportStatus.UNCONFIRMED },
          });
          expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
          expect(notificationService.recordNotification).not.toHaveBeenCalled();
        },
      );
    });

    describe('when notification should be sent', () => {
      it.each([
        {
          label: 'first threshold (10)',
          currentCount: 12,
          threshold: 10,
          lastThreshold: null,
          bugCount: 2,
        },
        {
          label: 'threshold increases from 10 to 20',
          currentCount: 22,
          threshold: 20,
          lastThreshold: 10,
          bugCount: 1,
        },
        {
          label: 'threshold increases to 30',
          currentCount: 35,
          threshold: 30,
          lastThreshold: 20,
          bugCount: 2,
        },
        {
          label: 'threshold increases to 50',
          currentCount: 55,
          threshold: 50,
          lastThreshold: 30,
          bugCount: 3,
        },
        {
          label: 'threshold increases to 100',
          currentCount: 105,
          threshold: 100,
          lastThreshold: 50,
          bugCount: 5,
        },
      ])(
        'should send Discord notification and record it when $label',
        async ({ currentCount, threshold, lastThreshold, bugCount }) => {
          const recentBugs = Array.from({ length: bugCount }, (_, i) =>
            BugReportFactory.create({ id: i + 1 }),
          );
          const mockEmbed = buildMockEmbed(`count: ${currentCount}`);

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
          expect(messageBuilder.buildThresholdAlertEmbed).toHaveBeenCalledWith({
            currentCount,
            lastThreshold,
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
        },
      );

      it('should handle empty recentBugs array when no bugs exist', async () => {
        const currentCount = 12;
        const mockEmbed = buildMockEmbed();

        bugReportRepository.count.mockResolvedValue(currentCount);
        notificationService.shouldSendNotification.mockResolvedValue({
          should: true,
          lastThreshold: null,
        });
        bugReportRepository.find.mockResolvedValue([]);
        messageBuilder.buildThresholdAlertEmbed.mockReturnValue(mockEmbed);
        discordWebhookClient.sendMessage.mockResolvedValue(undefined);

        await service.checkAndNotifyUnconfirmedCount();

        expect(messageBuilder.buildThresholdAlertEmbed).toHaveBeenCalledWith({
          currentCount,
          lastThreshold: null,
          threshold: 10,
          recentBugs: [],
        });
        expect(notificationService.recordNotification).toHaveBeenCalledWith(
          currentCount,
          10,
        );
      });
    });

    describe('when currentThreshold cannot be determined', () => {
      it('should log warning and skip notification when count is below all thresholds despite should=true', async () => {
        const currentCount = 9;

        bugReportRepository.count.mockResolvedValue(currentCount);
        notificationService.shouldSendNotification.mockResolvedValue({
          should: true,
          lastThreshold: null,
        });
        bugReportRepository.find.mockResolvedValue([BugReportFactory.create()]);

        const loggerWarnSpy = jest
          .spyOn(service['logger'], 'warn')
          .mockImplementation();

        await service.checkAndNotifyUnconfirmedCount();

        expect(loggerWarnSpy).toHaveBeenCalledWith(
          '알림 전송 조건을 만족했지만 임계값을 계산할 수 없음',
        );
        expect(messageBuilder.buildThresholdAlertEmbed).not.toHaveBeenCalled();
        expect(discordWebhookClient.sendMessage).not.toHaveBeenCalled();
        expect(notificationService.recordNotification).not.toHaveBeenCalled();

        loggerWarnSpy.mockRestore();
      });
    });

    describe('when Discord webhook fails', () => {
      const setupWebhookFailure = (
        rejection: unknown,
      ): {
        setup: () => void;
      } => ({
        setup: () => {
          bugReportRepository.count.mockResolvedValue(15);
          notificationService.shouldSendNotification.mockResolvedValue({
            should: true,
            lastThreshold: null,
          });
          bugReportRepository.find.mockResolvedValue([
            BugReportFactory.create(),
          ]);
          messageBuilder.buildThresholdAlertEmbed.mockReturnValue(
            buildMockEmbed(),
          );
          discordWebhookClient.sendMessage.mockRejectedValue(rejection);
        },
      });

      it('should not throw when Discord send fails', async () => {
        setupWebhookFailure(new Error('Discord API error')).setup();

        await expect(
          service.checkAndNotifyUnconfirmedCount(),
        ).resolves.toBeUndefined();
      });

      it('should log error message when Discord send fails with Error instance', async () => {
        setupWebhookFailure(new Error('Discord API error')).setup();

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

      it('should convert non-Error rejection to Error and log it', async () => {
        setupWebhookFailure('Non-Error exception string').setup();

        const loggerErrorSpy = jest
          .spyOn(service['logger'], 'error')
          .mockImplementation();

        await service.checkAndNotifyUnconfirmedCount();

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          '버그 제보 알림 전송 실패: Non-Error exception string',
          expect.any(String),
        );

        loggerErrorSpy.mockRestore();
      });

      it('should not record notification when Discord send fails', async () => {
        setupWebhookFailure(new Error('Discord API error')).setup();

        await service.checkAndNotifyUnconfirmedCount();

        expect(notificationService.recordNotification).not.toHaveBeenCalled();
      });
    });

    describe('when advisory lock is not acquired', () => {
      it('should warn and skip processing when lock is not acquired', async () => {
        // Arrange - mock lock not acquired
        const mockQueryRunnerNotAcquired = {
          connect: jest.fn().mockResolvedValue(undefined),
          query: jest
            .fn()
            .mockResolvedValue([{ pg_try_advisory_lock: false }]),
          release: jest.fn().mockResolvedValue(undefined),
        };
        dataSource.createQueryRunner = jest
          .fn()
          .mockReturnValue(mockQueryRunnerNotAcquired);

        const warnSpy = jest
          .spyOn(service['logger'], 'warn')
          .mockImplementation();

        // Act
        await service.checkAndNotifyUnconfirmedCount();

        // Assert
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('다른 인스턴스에서 이미 실행 중입니다'),
        );
        expect(bugReportRepository.count).not.toHaveBeenCalled();

        warnSpy.mockRestore();
      });
    });
  });

  describe('onModuleInit', () => {
    it('should use default interval when BUG_REPORT_CHECK_INTERVAL_MS is not configured', async () => {
      // Arrange - mock get to return the default value (simulating ConfigService default fallback)
      const mockConfigDefault = {
        get: jest.fn().mockReturnValue('300000'),
      };
      const schedulerRegistryMock = {
        addInterval: jest.fn(),
        deleteInterval: jest.fn(),
      };

      const module = await (
        await import('@nestjs/testing')
      ).Test.createTestingModule({
        providers: [
          BugReportSchedulerService,
          {
            provide: getRepositoryToken(BugReport),
            useValue: bugReportRepository,
          },
          { provide: DiscordWebhookClient, useValue: discordWebhookClient },
          {
            provide: BugReportNotificationService,
            useValue: notificationService,
          },
          { provide: DiscordMessageBuilderService, useValue: messageBuilder },
          { provide: DataSource, useValue: dataSource },
          {
            provide: SchedulerAlertService,
            useValue: schedulerAlertService,
          },
          { provide: ConfigService, useValue: mockConfigDefault },
          {
            provide: SchedulerRegistry,
            useValue: schedulerRegistryMock,
          },
        ],
      }).compile();

      const svc = module.get<BugReportSchedulerService>(
        BugReportSchedulerService,
      );
      // Manually invoke onModuleInit since TestingModule does not trigger lifecycle hooks automatically
      svc.onModuleInit();

      expect(svc).toBeDefined();
      // configService.get was called with the key and the default '300000'
      expect(mockConfigDefault.get).toHaveBeenCalledWith(
        'BUG_REPORT_CHECK_INTERVAL_MS',
        '300000',
      );
      expect(schedulerRegistryMock.addInterval).toHaveBeenCalledWith(
        'bug-report-check',
        expect.anything(),
      );
    });

    it('should throw when configured interval is NaN', async () => {
      const mockConfigNaN = {
        get: jest.fn().mockReturnValue('not-a-number'),
      };
      const schedulerRegistryMock = {
        addInterval: jest.fn(),
        deleteInterval: jest.fn(),
      };

      const module = await (
        await import('@nestjs/testing')
      ).Test.createTestingModule({
        providers: [
          BugReportSchedulerService,
          {
            provide: getRepositoryToken(BugReport),
            useValue: bugReportRepository,
          },
          { provide: DiscordWebhookClient, useValue: discordWebhookClient },
          {
            provide: BugReportNotificationService,
            useValue: notificationService,
          },
          { provide: DiscordMessageBuilderService, useValue: messageBuilder },
          { provide: DataSource, useValue: dataSource },
          {
            provide: SchedulerAlertService,
            useValue: schedulerAlertService,
          },
          { provide: ConfigService, useValue: mockConfigNaN },
          {
            provide: SchedulerRegistry,
            useValue: schedulerRegistryMock,
          },
        ],
      }).compile();

      const svc = module.get<BugReportSchedulerService>(
        BugReportSchedulerService,
      );
      expect(() => svc.onModuleInit()).toThrow(
        'Invalid BUG_REPORT_CHECK_INTERVAL_MS: must be a positive integer',
      );
    });

    it('should throw when configured interval is zero or negative', async () => {
      const mockConfigZero = {
        get: jest.fn().mockReturnValue('0'),
      };
      const schedulerRegistryMock = {
        addInterval: jest.fn(),
        deleteInterval: jest.fn(),
      };

      const module = await (
        await import('@nestjs/testing')
      ).Test.createTestingModule({
        providers: [
          BugReportSchedulerService,
          {
            provide: getRepositoryToken(BugReport),
            useValue: bugReportRepository,
          },
          { provide: DiscordWebhookClient, useValue: discordWebhookClient },
          {
            provide: BugReportNotificationService,
            useValue: notificationService,
          },
          { provide: DiscordMessageBuilderService, useValue: messageBuilder },
          { provide: DataSource, useValue: dataSource },
          {
            provide: SchedulerAlertService,
            useValue: schedulerAlertService,
          },
          { provide: ConfigService, useValue: mockConfigZero },
          {
            provide: SchedulerRegistry,
            useValue: schedulerRegistryMock,
          },
        ],
      }).compile();

      const svc = module.get<BugReportSchedulerService>(
        BugReportSchedulerService,
      );
      expect(() => svc.onModuleInit()).toThrow(
        'Invalid BUG_REPORT_CHECK_INTERVAL_MS: must be a positive integer',
      );
    });
  });
});
