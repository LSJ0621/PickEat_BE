import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationSchedulerService } from '../services/notification-scheduler.service';
import { NotificationService } from '../notification.service';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';

describe('NotificationSchedulerService', () => {
  let service: NotificationSchedulerService;
  let notificationService: jest.Mocked<NotificationService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockNotificationService: jest.Mocked<Partial<NotificationService>> = {
      publishScheduledNotifications: jest.fn(),
    };

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
        NotificationSchedulerService,
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: SchedulerAlertService,
          useValue: {
            alertFailure: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('* * * * *'),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addCronJob: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationSchedulerService>(
      NotificationSchedulerService,
    );
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('publishScheduledNotifications', () => {
    it('should call notificationService.publishScheduledNotifications', async () => {
      notificationService.publishScheduledNotifications.mockResolvedValue(0);

      await service.publishScheduledNotifications();

      expect(
        notificationService.publishScheduledNotifications,
      ).toHaveBeenCalledTimes(1);
    });

    it('should not log when no notifications are published', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      notificationService.publishScheduledNotifications.mockResolvedValue(0);

      await service.publishScheduledNotifications();

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should log when notifications are published', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      notificationService.publishScheduledNotifications.mockResolvedValue(3);

      await service.publishScheduledNotifications();

      expect(logSpy).toHaveBeenCalledWith('예약 공지사항 발행 완료: 3개');
    });

    it('should log multiple times when called multiple times with published notifications', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      notificationService.publishScheduledNotifications
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1);

      await service.publishScheduledNotifications();
      await service.publishScheduledNotifications();
      await service.publishScheduledNotifications();

      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy).toHaveBeenNthCalledWith(1, '예약 공지사항 발행 완료: 2개');
      expect(logSpy).toHaveBeenNthCalledWith(2, '예약 공지사항 발행 완료: 5개');
      expect(logSpy).toHaveBeenNthCalledWith(3, '예약 공지사항 발행 완료: 1개');
    });

    it('should handle errors gracefully and log error', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      const testError = new Error('Database connection failed');
      notificationService.publishScheduledNotifications.mockRejectedValue(
        testError,
      );

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        '예약 공지사항 발행 실패: Database connection failed',
        testError.stack,
      );
    });

    it('should convert non-Error exceptions to Error when logging', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      const nonErrorException = 'String error message';
      notificationService.publishScheduledNotifications.mockRejectedValue(
        nonErrorException,
      );

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        '예약 공지사항 발행 실패: String error message',
        expect.any(String),
      );
    });

    it('should not throw error when service method fails', async () => {
      notificationService.publishScheduledNotifications.mockRejectedValue(
        new Error('Service error'),
      );

      await expect(
        service.publishScheduledNotifications(),
      ).resolves.not.toThrow();
    });

    it('should continue execution after error without interruption', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      notificationService.publishScheduledNotifications.mockRejectedValue(
        new Error('Temporary failure'),
      );

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(
        notificationService.publishScheduledNotifications,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined error gracefully', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      notificationService.publishScheduledNotifications.mockRejectedValue(
        undefined,
      );

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        '예약 공지사항 발행 실패: undefined',
        expect.any(String),
      );
    });

    it('should handle null error gracefully', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      notificationService.publishScheduledNotifications.mockRejectedValue(null);

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        '예약 공지사항 발행 실패: null',
        expect.any(String),
      );
    });

    it('should handle numeric error gracefully', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      notificationService.publishScheduledNotifications.mockRejectedValue(404);

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        '예약 공지사항 발행 실패: 404',
        expect.any(String),
      );
    });

    it('should handle object error gracefully', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error');
      const objectError = { code: 'ERR_001', message: 'Custom error' };
      notificationService.publishScheduledNotifications.mockRejectedValue(
        objectError,
      );

      await service.publishScheduledNotifications();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('예약 공지사항 발행 실패:'),
        expect.any(String),
      );
    });

    it('should warn when advisory lock is not acquired (another instance running)', async () => {
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

      const warnSpy = jest.spyOn(service['logger'], 'warn');

      // Act
      await service.publishScheduledNotifications();

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('다른 인스턴스에서 이미 실행 중입니다'),
      );
      expect(
        notificationService.publishScheduledNotifications,
      ).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit', () => {
    it('should use default cron expression when CRON_NOTIFICATION_PUBLISH is not set', async () => {
      // Arrange - configService.get returns the default value when env var is not set
      const mockConfigServiceDefault = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      };
      const schedulerRegistryMock = { addCronJob: jest.fn() };

      const { Test: TestUtil } = await import('@nestjs/testing');
      const { NotificationSchedulerService: NSS } = await import(
        '../services/notification-scheduler.service'
      );
      const { NotificationService: NS } = await import(
        '../notification.service'
      );
      const { SchedulerAlertService: SAS } = await import(
        '@/common/services/scheduler-alert.service'
      );
      const { ConfigService: CS } = await import('@nestjs/config');
      const { SchedulerRegistry: SR } = await import('@nestjs/schedule');

      const mod = await TestUtil.createTestingModule({
        providers: [
          NSS,
          {
            provide: NS,
            useValue: { publishScheduledNotifications: jest.fn() },
          },
          { provide: DataSource, useValue: dataSource },
          { provide: SAS, useValue: { alertFailure: jest.fn() } },
          { provide: CS, useValue: mockConfigServiceDefault },
          { provide: SR, useValue: schedulerRegistryMock },
        ],
      }).compile();

      const svc = mod.get(NSS);
      // Manually call onModuleInit since lifecycle hooks aren't called in compile()
      svc.onModuleInit();

      expect(svc).toBeDefined();
      expect(mockConfigServiceDefault.get).toHaveBeenCalledWith(
        'CRON_NOTIFICATION_PUBLISH',
        '* * * * *',
      );
    });

    it('should register cron job with custom expression when config provides it', async () => {
      // Arrange
      const mockConfigServiceCustom = {
        get: jest.fn().mockReturnValue('0 * * * *'),
      };
      const schedulerRegistryMock = { addCronJob: jest.fn() };

      const { Test: TestUtil } = await import('@nestjs/testing');
      const { NotificationSchedulerService: NSS } = await import(
        '../services/notification-scheduler.service'
      );
      const { NotificationService: NS } = await import(
        '../notification.service'
      );
      const { SchedulerAlertService: SAS } = await import(
        '@/common/services/scheduler-alert.service'
      );
      const { ConfigService: CS } = await import('@nestjs/config');
      const { SchedulerRegistry: SR } = await import('@nestjs/schedule');

      const mod = await TestUtil.createTestingModule({
        providers: [
          NSS,
          {
            provide: NS,
            useValue: { publishScheduledNotifications: jest.fn() },
          },
          { provide: DataSource, useValue: dataSource },
          { provide: SAS, useValue: { alertFailure: jest.fn() } },
          { provide: CS, useValue: mockConfigServiceCustom },
          { provide: SR, useValue: schedulerRegistryMock },
        ],
      }).compile();

      const svc = mod.get(NSS);
      // Manually call onModuleInit to test the lifecycle
      svc.onModuleInit();

      expect(svc).toBeDefined();
      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'notification-publish',
        expect.anything(),
      );
    });
  });
});
