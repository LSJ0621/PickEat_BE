import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BugReportNotificationService } from './bug-report-notification.service';
import { BugReportNotification } from '../entities/bug-report-notification.entity';
import { createMockRepository } from '../../../test/mocks/repository.mock';

describe('BugReportNotificationService', () => {
  let service: BugReportNotificationService;
  let notificationRepository: ReturnType<
    typeof createMockRepository<BugReportNotification>
  >;

  beforeEach(async () => {
    notificationRepository = createMockRepository<BugReportNotification>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugReportNotificationService,
        {
          provide: getRepositoryToken(BugReportNotification),
          useValue: notificationRepository,
        },
      ],
    }).compile();

    service = module.get<BugReportNotificationService>(
      BugReportNotificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shouldSendNotification', () => {
    it('should return false for counts below 10', async () => {
      const result = await service.shouldSendNotification(9);

      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBeNull();
      expect(notificationRepository.find).not.toHaveBeenCalled();
    });

    it('should return false for count 0', async () => {
      const result = await service.shouldSendNotification(0);

      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBeNull();
    });

    it('should return true for first notification at threshold 10', async () => {
      notificationRepository.find.mockResolvedValue([]);

      const result = await service.shouldSendNotification(10);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBeNull();
      expect(notificationRepository.find).toHaveBeenCalledWith({
        order: { sentAt: 'DESC' },
        take: 1,
      });
    });

    it('should return true for first notification at threshold 20', async () => {
      notificationRepository.find.mockResolvedValue([]);

      const result = await service.shouldSendNotification(25);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBeNull();
    });

    it('should return false if threshold has not increased', async () => {
      const lastNotification = {
        id: 1,
        unconfirmedCount: 15,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      const result = await service.shouldSendNotification(15);

      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBe(10);
    });

    it('should return true if threshold has increased from 10 to 20', async () => {
      const lastNotification = {
        id: 1,
        unconfirmedCount: 12,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      const result = await service.shouldSendNotification(22);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBe(10);
    });

    it('should return true if threshold has increased from 20 to 30', async () => {
      const lastNotification = {
        id: 2,
        unconfirmedCount: 25,
        threshold: 20,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      const result = await service.shouldSendNotification(35);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBe(20);
    });

    it('should return true if threshold has increased from 50 to 100', async () => {
      const lastNotification = {
        id: 3,
        unconfirmedCount: 55,
        threshold: 50,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      const result = await service.shouldSendNotification(105);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBe(50);
    });

    it('should return false if count is at same threshold level', async () => {
      const lastNotification = {
        id: 1,
        unconfirmedCount: 10,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      // Count increased but still in same threshold (10-19)
      const result = await service.shouldSendNotification(18);

      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBe(10);
    });

    it('should handle exact threshold boundaries', async () => {
      const lastNotification = {
        id: 1,
        unconfirmedCount: 19,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      // Exactly at next threshold
      const result = await service.shouldSendNotification(20);

      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBe(10);
    });
  });

  describe('recordNotification', () => {
    it('should save notification record', async () => {
      const mockNotification = {
        id: 1,
        unconfirmedCount: 15,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.create.mockReturnValue(mockNotification);
      notificationRepository.save.mockResolvedValue(mockNotification);

      await service.recordNotification(15, 10);

      expect(notificationRepository.create).toHaveBeenCalledWith({
        unconfirmedCount: 15,
        threshold: 10,
      });
      expect(notificationRepository.save).toHaveBeenCalledWith(
        mockNotification,
      );
    });

    it('should save notification for threshold 20', async () => {
      const mockNotification = {
        id: 2,
        unconfirmedCount: 22,
        threshold: 20,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.create.mockReturnValue(mockNotification);
      notificationRepository.save.mockResolvedValue(mockNotification);

      await service.recordNotification(22, 20);

      expect(notificationRepository.create).toHaveBeenCalledWith({
        unconfirmedCount: 22,
        threshold: 20,
      });
    });

    it('should save notification for threshold 100', async () => {
      const mockNotification = {
        id: 3,
        unconfirmedCount: 105,
        threshold: 100,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.create.mockReturnValue(mockNotification);
      notificationRepository.save.mockResolvedValue(mockNotification);

      await service.recordNotification(105, 100);

      expect(notificationRepository.create).toHaveBeenCalledWith({
        unconfirmedCount: 105,
        threshold: 100,
      });
    });

    it('should not throw error if save fails', async () => {
      const mockNotification = {
        id: 1,
        unconfirmedCount: 15,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.create.mockReturnValue(mockNotification);
      notificationRepository.save.mockRejectedValue(
        new Error('Database error'),
      );

      // Should not throw
      await expect(service.recordNotification(15, 10)).resolves.toBeUndefined();
    });

    it('should log error if save fails', async () => {
      const mockNotification = {
        id: 1,
        unconfirmedCount: 15,
        threshold: 10,
        sentAt: new Date(),
      } as BugReportNotification;

      notificationRepository.create.mockReturnValue(mockNotification);
      notificationRepository.save.mockRejectedValue(
        new Error('Database error'),
      );

      // Spy on logger
      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.recordNotification(15, 10);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('알림 기록 저장 실패'),
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe('getLastNotification', () => {
    it('should return the last notification', async () => {
      const lastNotification = {
        id: 1,
        unconfirmedCount: 15,
        threshold: 10,
        sentAt: new Date('2024-01-15T10:00:00Z'),
      } as BugReportNotification;

      notificationRepository.find.mockResolvedValue([lastNotification]);

      const result = await service.getLastNotification();

      expect(notificationRepository.find).toHaveBeenCalledWith({
        order: { sentAt: 'DESC' },
        take: 1,
      });
      expect(result).toEqual(lastNotification);
    });

    it('should return null if no notifications exist', async () => {
      notificationRepository.find.mockResolvedValue([]);

      const result = await service.getLastNotification();

      expect(result).toBeNull();
    });

    it('should return most recent notification when multiple exist', async () => {
      const olderNotification = {
        id: 1,
        unconfirmedCount: 10,
        threshold: 10,
        sentAt: new Date('2024-01-15T09:00:00Z'),
      } as BugReportNotification;

      const newerNotification = {
        id: 2,
        unconfirmedCount: 20,
        threshold: 20,
        sentAt: new Date('2024-01-15T10:00:00Z'),
      } as BugReportNotification;

      // Repository should return only the most recent due to take: 1
      notificationRepository.find.mockResolvedValue([newerNotification]);

      const result = await service.getLastNotification();

      expect(result).toEqual(newerNotification);
      expect(result?.id).toBe(2);
    });
  });
});
