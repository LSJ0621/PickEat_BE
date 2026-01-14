import { Test, TestingModule } from '@nestjs/testing';
import { NotificationSchedulerService } from '../services/notification-scheduler.service';
import { NotificationService } from '../notification.service';

describe('NotificationSchedulerService', () => {
  let service: NotificationSchedulerService;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    const mockNotificationService: jest.Mocked<Partial<NotificationService>> = {
      publishScheduledNotifications: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationSchedulerService,
        {
          provide: NotificationService,
          useValue: mockNotificationService,
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
  });
});
