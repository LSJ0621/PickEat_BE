import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BugReportService } from '@/bug-report/bug-report.service';
import { BugReportNotificationService } from '@/bug-report/services/bug-report-notification.service';
import { BugReportSchedulerService } from '@/bug-report/services/bug-report-scheduler.service';
import { DiscordMessageBuilderService } from '@/bug-report/services/discord-message-builder.service';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportNotification } from '@/bug-report/entities/bug-report-notification.entity';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import { User } from '@/user/entities/user.entity';
import { CreateBugReportDto } from '@/bug-report/dto/create-bug-report.dto';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { UserFactory, BugReportFactory } from '../../factories/entity.factory';
import { mockS3Responses } from '../../mocks/external-clients.mock';
import {
  createTestingApp,
  closeTestingApp,
  createAllMockClients,
} from '../../e2e/setup/testing-app.module';

/**
 * Bug Report Flow Integration Tests
 *
 * Tests the complete flow of bug report operations involving multiple services:
 * - BugReportService
 * - BugReportNotificationService
 * - BugReportSchedulerService
 * - DiscordMessageBuilderService
 * - External clients (S3, Discord Webhook)
 *
 * Key Integration Points:
 * 1. Bug Report Creation → S3 Upload → DB Save → Discord Notification
 * 2. Status Update → Notification Trigger
 * 3. Scheduler → Threshold Check → Batch Notification
 */
describe('Bug Report Flow Integration', () => {
  jest.setTimeout(60000); // 60 seconds timeout

  let app: INestApplication;
  let module: TestingModule;
  let bugReportService: BugReportService;
  let notificationService: BugReportNotificationService;
  let schedulerService: BugReportSchedulerService;
  let messageBuilderService: DiscordMessageBuilderService;
  let bugReportRepository: Repository<BugReport>;
  let bugReportNotificationRepository: Repository<BugReportNotification>;
  let userRepository: Repository<User>;
  let mocks: ReturnType<typeof createAllMockClients>;

  beforeAll(async () => {
    // Create testing app with all external clients mocked
    const testApp = await createTestingApp();
    app = testApp.app;
    module = testApp.module;
    mocks = testApp.mocks;

    // Set default mock responses
    mocks.mockS3Client.uploadBugReportImage.mockResolvedValue(
      mockS3Responses.uploadSuccess.Location,
    );
    mocks.mockDiscordWebhookClient.sendMessage.mockResolvedValue(undefined);

    bugReportService = module.get<BugReportService>(BugReportService);
    notificationService = module.get<BugReportNotificationService>(
      BugReportNotificationService,
    );
    schedulerService = module.get<BugReportSchedulerService>(
      BugReportSchedulerService,
    );
    messageBuilderService = module.get<DiscordMessageBuilderService>(
      DiscordMessageBuilderService,
    );
    bugReportRepository = module.get(getRepositoryToken(BugReport));
    bugReportNotificationRepository = module.get(
      getRepositoryToken(BugReportNotification),
    );
    userRepository = module.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(async () => {
    // Clear all repositories in correct order (dependent tables first)
    // Use query builder to avoid empty criteria error
    await bugReportNotificationRepository
      .createQueryBuilder()
      .delete()
      .execute();
    await bugReportRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Reset all mocks
    jest.clearAllMocks();

    // Reset default mock responses
    mocks.mockS3Client.uploadBugReportImage.mockResolvedValue(
      mockS3Responses.uploadSuccess.Location,
    );
    mocks.mockDiscordWebhookClient.sendMessage.mockResolvedValue(undefined);
  });

  describe('Bug Report Creation Flow', () => {
    it('should create bug report without images and save to database', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const authUser: AuthUserPayload = {
        email: user.email,
        role: user.role,
      };
      const dto: CreateBugReportDto = {
        category: 'UI/UX',
        title: '버튼이 작동하지 않습니다',
        description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
      };

      // Act
      const result = await bugReportService.createBugReport(authUser, dto, []);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.category).toBe(dto.category);
      expect(result.title).toBe(dto.title);
      expect(result.description).toBe(dto.description);
      expect(result.images).toBeNull();
      expect(result.status).toBe(BugReportStatus.UNCONFIRMED);
      expect(result.user.id).toBe(user.id);

      // Verify database record
      const savedReport = await bugReportRepository.findOne({
        where: { id: result.id },
        relations: ['user'],
      });
      expect(savedReport).toBeDefined();
      expect(savedReport?.user.id).toBe(user.id);

      // Verify S3 was NOT called
      expect(mocks.mockS3Client.uploadBugReportImage).not.toHaveBeenCalled();
    });

    it('should create bug report with images, upload to S3, and save URLs to database', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const authUser: AuthUserPayload = {
        email: user.email,
        role: user.role,
      };
      const dto: CreateBugReportDto = {
        category: 'Crash',
        title: '앱이 종료됩니다',
        description: '메뉴 추천 중 앱이 갑자기 종료되었습니다.',
      };
      const files: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'screenshot1.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-1'),
          size: 1024,
        } as Express.Multer.File,
        {
          fieldname: 'images',
          originalname: 'screenshot2.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-2'),
          size: 2048,
        } as Express.Multer.File,
      ];

      // Act
      const result = await bugReportService.createBugReport(
        authUser,
        dto,
        files,
      );

      // Assert
      expect(result.images).toBeDefined();
      expect(result.images).toHaveLength(2);
      expect(result.images?.[0]).toBe(mockS3Responses.uploadSuccess.Location);
      expect(result.images?.[1]).toBe(mockS3Responses.uploadSuccess.Location);

      // Verify S3 was called twice
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledTimes(2);
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledWith(
        files[0],
      );
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledWith(
        files[1],
      );

      // Verify database record
      const savedReport = await bugReportRepository.findOne({
        where: { id: result.id },
      });
      expect(savedReport?.images).toHaveLength(2);
    });

    it('should limit images to maximum 5', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const authUser: AuthUserPayload = {
        email: user.email,
        role: user.role,
      };
      const dto: CreateBugReportDto = {
        category: 'Crash',
        title: '앱이 종료됩니다',
        description: '메뉴 추천 중 앱이 갑자기 종료되었습니다.',
      };
      const files: Express.Multer.File[] = Array.from(
        { length: 6 },
        (_, i) =>
          ({
            fieldname: 'images',
            originalname: `screenshot${i}.png`,
            encoding: '7bit',
            mimetype: 'image/png',
            buffer: Buffer.from(`fake-image-${i}`),
            size: 1024 * (i + 1),
          }) as Express.Multer.File,
      );

      // Act
      const result = await bugReportService.createBugReport(
        authUser,
        dto,
        files,
      );

      // Assert
      expect(result.images).toHaveLength(5);
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledTimes(5);
    });

    it('should handle S3 upload failure and propagate error', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const authUser: AuthUserPayload = {
        email: user.email,
        role: user.role,
      };
      const dto: CreateBugReportDto = {
        category: 'Crash',
        title: '앱이 종료됩니다',
        description: '메뉴 추천 중 앱이 갑자기 종료되었습니다.',
      };
      const files: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'screenshot.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image'),
          size: 1024,
        } as Express.Multer.File,
      ];

      mocks.mockS3Client.uploadBugReportImage.mockRejectedValue(
        new Error('S3 upload failed'),
      );

      // Act & Assert
      await expect(
        bugReportService.createBugReport(authUser, dto, files),
      ).rejects.toThrow();

      // Verify no database record was created
      const count = await bugReportRepository.count();
      expect(count).toBe(0);
    });
  });

  describe('Status Update Flow', () => {
    it('should update bug report status and reflect in database', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({
          user,
          status: BugReportStatus.UNCONFIRMED,
        }),
      );

      // Act
      const result = await bugReportService.updateStatus(
        bugReport.id,
        BugReportStatus.CONFIRMED,
      );

      // Assert
      expect(result.status).toBe(BugReportStatus.CONFIRMED);
      expect(result.id).toBe(bugReport.id);

      // Verify database update
      const updatedReport = await bugReportRepository.findOne({
        where: { id: bugReport.id },
      });
      expect(updatedReport?.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('should update bug report status from CONFIRMED back to UNCONFIRMED', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({
          user,
          status: BugReportStatus.CONFIRMED,
        }),
      );

      // Act
      const result = await bugReportService.updateStatus(
        bugReport.id,
        BugReportStatus.UNCONFIRMED,
      );

      // Assert
      expect(result.status).toBe(BugReportStatus.UNCONFIRMED);

      // Verify database update
      const updatedReport = await bugReportRepository.findOne({
        where: { id: bugReport.id },
      });
      expect(updatedReport?.status).toBe(BugReportStatus.UNCONFIRMED);
    });

    it('should update updatedAt timestamp when status changes', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const savedBugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      // Fetch from database to get the actual database timestamp
      const bugReportBeforeUpdate = await bugReportRepository.findOne({
        where: { id: savedBugReport.id },
      });
      const originalUpdatedAt = bugReportBeforeUpdate!.updatedAt;

      // Wait to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act
      await bugReportService.updateStatus(
        savedBugReport.id,
        BugReportStatus.CONFIRMED,
      );

      // Assert
      const updatedReport = await bugReportRepository.findOne({
        where: { id: savedBugReport.id },
      });
      expect(updatedReport).toBeDefined();
      expect(updatedReport!.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });

    it('should throw NotFoundException when bug report does not exist', async () => {
      // Arrange
      const nonExistentId = 99999;

      // Act & Assert
      await expect(
        bugReportService.updateStatus(nonExistentId, BugReportStatus.CONFIRMED),
      ).rejects.toThrow('버그 제보를 찾을 수 없습니다');
    });
  });

  describe('Notification Service Flow', () => {
    it('should determine notification is needed for first threshold (10)', async () => {
      // Arrange
      const currentCount = 10;

      // Act
      const result =
        await notificationService.shouldSendNotification(currentCount);

      // Assert
      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBeNull(); // First notification
    });

    it('should not send notification when count is below first threshold', async () => {
      // Arrange
      const currentCount = 9;

      // Act
      const result =
        await notificationService.shouldSendNotification(currentCount);

      // Assert
      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBeNull();
    });

    it('should send notification when threshold increases', async () => {
      // Arrange
      await bugReportNotificationRepository.save({
        unconfirmedCount: 15,
        threshold: 10,
      });
      const currentCount = 20;

      // Act
      const result =
        await notificationService.shouldSendNotification(currentCount);

      // Assert
      expect(result.should).toBe(true);
      expect(result.lastThreshold).toBe(10);
    });

    it('should not send notification when threshold does not increase', async () => {
      // Arrange
      await bugReportNotificationRepository.save({
        unconfirmedCount: 15,
        threshold: 10,
      });
      const currentCount = 18; // Still in threshold 10

      // Act
      const result =
        await notificationService.shouldSendNotification(currentCount);

      // Assert
      expect(result.should).toBe(false);
      expect(result.lastThreshold).toBe(10);
    });

    it('should record notification with correct threshold and count', async () => {
      // Arrange
      const count = 25;
      const threshold = 20;

      // Act
      await notificationService.recordNotification(count, threshold);

      // Assert
      const notification = await bugReportNotificationRepository.findOne({
        where: { threshold },
        order: { sentAt: 'DESC' },
      });
      expect(notification).toBeDefined();
      expect(notification?.unconfirmedCount).toBe(count);
      expect(notification?.threshold).toBe(threshold);
      expect(notification?.sentAt).toBeDefined();
    });

    it('should retrieve last notification correctly', async () => {
      // Arrange
      await bugReportNotificationRepository.save([
        { unconfirmedCount: 10, threshold: 10 },
        { unconfirmedCount: 20, threshold: 20 },
      ]);

      // Wait to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 100));

      await bugReportNotificationRepository.save({
        unconfirmedCount: 30,
        threshold: 30,
      });

      // Act
      const lastNotification = await notificationService.getLastNotification();

      // Assert
      expect(lastNotification).toBeDefined();
      expect(lastNotification?.threshold).toBe(30);
      expect(lastNotification?.unconfirmedCount).toBe(30);
    });
  });

  describe('Discord Message Builder Flow', () => {
    it('should build threshold alert embed for first notification', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const recentBugs = [
        await bugReportRepository.save(
          BugReportFactory.create({
            user,
            title: '버그 1',
            category: 'UI/UX',
          }),
        ),
        await bugReportRepository.save(
          BugReportFactory.create({
            user,
            title: '버그 2',
            category: 'Crash',
          }),
        ),
      ];

      // Act
      const embed = messageBuilderService.buildThresholdAlertEmbed({
        currentCount: 10,
        lastThreshold: null,
        threshold: 10,
        recentBugs,
      });

      // Assert
      expect(embed).toBeDefined();
      expect(embed.title).toBe('🚨 미확인 버그 제보 임계값 도달');
      expect(embed.description).toContain('10개');
      expect(embed.fields).toBeDefined();
      expect(embed.fields?.length).toBeGreaterThanOrEqual(2);
      expect(embed.timestamp).toBeDefined();

      // Verify fields contain current count and threshold
      const countField = embed.fields?.find(
        (f) => f.name === '현재 미확인 개수',
      );
      expect(countField?.value).toBe('10개');

      const thresholdField = embed.fields?.find((f) => f.name === '임계값');
      expect(thresholdField?.value).toBe('10개');
    });

    it('should build threshold alert embed with increase information', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const recentBugs = [
        await bugReportRepository.save(BugReportFactory.create({ user })),
      ];

      // Act
      const embed = messageBuilderService.buildThresholdAlertEmbed({
        currentCount: 25,
        lastThreshold: 20,
        threshold: 20,
        recentBugs,
      });

      // Assert
      expect(embed.description).toContain('25개');
      expect(embed.description).toContain('20개');
      expect(embed.description).toContain('+5개');

      // Verify increase field exists
      const increaseField = embed.fields?.find((f) => f.name === '증가량');
      expect(increaseField?.value).toBe('+5개');
    });

    it('should include recent bugs in embed fields', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      const recentBugs = await bugReportRepository.save([
        BugReportFactory.create({ user, title: '버그 1' }),
        BugReportFactory.create({ user, title: '버그 2' }),
        BugReportFactory.create({ user, title: '버그 3' }),
      ]);

      // Act
      const embed = messageBuilderService.buildThresholdAlertEmbed({
        currentCount: 15,
        lastThreshold: null,
        threshold: 10,
        recentBugs,
      });

      // Assert
      const recentBugsField = embed.fields?.find((f) =>
        f.name.includes('최근 제보'),
      );
      expect(recentBugsField).toBeDefined();
      expect(recentBugsField?.value).toBeTruthy();
      expect(recentBugsField?.inline).toBe(false);
    });
  });

  describe('Scheduler Service Flow', () => {
    it('should not send notification when count is below threshold', async () => {
      // Arrange - Create 5 unconfirmed bug reports (below threshold of 10)
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 5 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).not.toHaveBeenCalled();

      // Verify no notification record was created
      const notificationCount = await bugReportNotificationRepository.count();
      expect(notificationCount).toBe(0);
    });

    it('should send notification when reaching first threshold (10)', async () => {
      // Arrange - Create 10 unconfirmed bug reports
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 10 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      // Verify notification payload structure
      const callArgs =
        mocks.mockDiscordWebhookClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toHaveProperty('embeds');
      expect(Array.isArray(callArgs.embeds)).toBe(true);
      expect(callArgs.embeds[0]).toHaveProperty('title');
      expect(callArgs.embeds[0].title).toContain('미확인 버그');

      // Verify notification record was created
      const notification = await bugReportNotificationRepository.findOne({
        where: { threshold: 10 },
      });
      expect(notification).toBeDefined();
      expect(notification?.unconfirmedCount).toBe(10);
    });

    it('should send notification when threshold increases from 10 to 20', async () => {
      // Arrange - Setup previous notification at threshold 10
      await bugReportNotificationRepository.save({
        unconfirmedCount: 15,
        threshold: 10,
      });

      // Create 20 unconfirmed bug reports
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 20 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      // Verify new notification record was created
      const notifications = await bugReportNotificationRepository.find({
        order: { sentAt: 'DESC' },
      });
      expect(notifications).toHaveLength(2);
      expect(notifications[0].threshold).toBe(20);
      expect(notifications[0].unconfirmedCount).toBe(20);
    });

    it('should not send duplicate notification for same threshold', async () => {
      // Arrange - Setup previous notification at threshold 10
      await bugReportNotificationRepository.save({
        unconfirmedCount: 12,
        threshold: 10,
      });

      // Create 15 unconfirmed bug reports (still in threshold 10 range)
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 15 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).not.toHaveBeenCalled();

      // Verify no new notification record
      const notificationCount = await bugReportNotificationRepository.count();
      expect(notificationCount).toBe(1);
    });

    it('should include recent bugs in notification payload', async () => {
      // Arrange - Create 10 unconfirmed bug reports with different titles
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 10 }, (_, i) =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
            title: `버그 제보 ${i + 1}`,
            category: i % 2 === 0 ? 'UI/UX' : 'Crash',
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalled();

      const callArgs =
        mocks.mockDiscordWebhookClient.sendMessage.mock.calls[0][0];
      const embed = callArgs.embeds[0];

      // Verify embed contains recent bugs field
      const recentBugsField = embed.fields?.find((f: any) =>
        f.name.includes('최근 제보'),
      );
      expect(recentBugsField).toBeDefined();
      expect(recentBugsField?.value).toBeTruthy();
    });

    it('should handle Discord webhook failure gracefully', async () => {
      // Arrange
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 10 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Mock Discord webhook to fail
      mocks.mockDiscordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord API error'),
      );

      // Act - Should not throw
      await expect(
        schedulerService.checkAndNotifyUnconfirmedCount(),
      ).resolves.not.toThrow();

      // Assert - Notification attempt was made
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalled();

      // Verify notification record was still created
      const notification = await bugReportNotificationRepository.findOne({
        where: { threshold: 10 },
      });
      expect(notification).toBeDefined();
    });

    it('should handle multiple thresholds correctly (50 → 100)', async () => {
      // Arrange - Setup previous notification at threshold 50
      await bugReportNotificationRepository.save({
        unconfirmedCount: 55,
        threshold: 50,
      });

      // Create 100 unconfirmed bug reports
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save(
        Array.from({ length: 100 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      const notifications = await bugReportNotificationRepository.find({
        order: { sentAt: 'DESC' },
      });
      expect(notifications[0].threshold).toBe(100);
      expect(notifications[0].unconfirmedCount).toBe(100);
    });

    it('should only count UNCONFIRMED status for threshold check', async () => {
      // Arrange - Create mix of different statuses
      const user = await userRepository.save(UserFactory.create());
      await bugReportRepository.save([
        ...Array.from({ length: 10 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
        ...Array.from({ length: 5 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.CONFIRMED,
          }),
        ),
        ...Array.from({ length: 3 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.CONFIRMED,
          }),
        ),
      ]);

      // Act
      await schedulerService.checkAndNotifyUnconfirmedCount();

      // Assert
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      const notification = await bugReportNotificationRepository.findOne({
        where: { threshold: 10 },
      });
      expect(notification?.unconfirmedCount).toBe(10); // Only UNCONFIRMED count
    });
  });

  describe('Complete Integration Flow', () => {
    it('should complete full workflow: create → accumulate → threshold → notify', async () => {
      // Phase 1: Create 5 bug reports (below threshold)
      const user1 = await userRepository.save(
        UserFactory.create({ email: 'user1@example.com' }),
      );
      const authUser1: AuthUserPayload = {
        email: user1.email,
        role: user1.role,
      };

      for (let i = 0; i < 5; i++) {
        await bugReportService.createBugReport(
          authUser1,
          {
            category: 'UI/UX',
            title: `버그 ${i + 1}`,
            description: `버그 설명 ${i + 1}`,
          },
          [],
        );
      }

      // Verify no notification yet
      await schedulerService.checkAndNotifyUnconfirmedCount();
      expect(mocks.mockDiscordWebhookClient.sendMessage).not.toHaveBeenCalled();

      // Phase 2: Create 5 more bug reports (reach threshold of 10)
      const user2 = await userRepository.save(
        UserFactory.create({ email: 'user2@example.com' }),
      );
      const authUser2: AuthUserPayload = {
        email: user2.email,
        role: user2.role,
      };

      for (let i = 5; i < 10; i++) {
        await bugReportService.createBugReport(
          authUser2,
          {
            category: 'Crash',
            title: `버그 ${i + 1}`,
            description: `버그 설명 ${i + 1}`,
          },
          [],
        );
      }

      // Verify notification sent
      jest.clearAllMocks();
      await schedulerService.checkAndNotifyUnconfirmedCount();
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      // Verify notification record
      const notification1 = await bugReportNotificationRepository.findOne({
        where: { threshold: 10 },
      });
      expect(notification1).toBeDefined();

      // Phase 3: Admin updates some reports to CONFIRMED
      const allReports = await bugReportRepository.find({ take: 5 });
      for (const report of allReports) {
        await bugReportService.updateStatus(
          report.id,
          BugReportStatus.CONFIRMED,
        );
      }

      // Verify UNCONFIRMED count decreased
      const unconfirmedCount = await bugReportRepository.count({
        where: { status: BugReportStatus.UNCONFIRMED },
      });
      expect(unconfirmedCount).toBe(5);

      // Phase 4: Create 15 more reports to reach threshold 20 (5 remaining + 15 new = 20 UNCONFIRMED)
      for (let i = 10; i < 25; i++) {
        await bugReportService.createBugReport(
          authUser1,
          {
            category: 'Performance',
            title: `버그 ${i + 1}`,
            description: `버그 설명 ${i + 1}`,
          },
          [],
        );
      }

      // Verify new notification for threshold 20
      jest.clearAllMocks();
      await schedulerService.checkAndNotifyUnconfirmedCount();
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      const notification2 = await bugReportNotificationRepository.findOne({
        where: { threshold: 20 },
      });
      expect(notification2).toBeDefined();
      expect(notification2?.unconfirmedCount).toBe(20);
    });

    it('should handle workflow with images: create with S3 upload → notify → status update', async () => {
      // Phase 1: Create bug report with images
      const user = await userRepository.save(UserFactory.create());
      const authUser: AuthUserPayload = {
        email: user.email,
        role: user.role,
      };

      const files: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'bug-screenshot.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-data'),
          size: 2048,
        } as Express.Multer.File,
      ];

      const bugReport = await bugReportService.createBugReport(
        authUser,
        {
          category: 'Crash',
          title: '화면이 깨집니다',
          description: '메뉴 페이지에서 화면이 깨져서 스크린샷 첨부합니다.',
        },
        files,
      );

      // Verify S3 upload
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledTimes(1);
      expect(bugReport.images).toHaveLength(1);

      // Phase 2: Create more reports to reach threshold
      await bugReportRepository.save(
        Array.from({ length: 9 }, () =>
          BugReportFactory.create({
            user,
            status: BugReportStatus.UNCONFIRMED,
          }),
        ),
      );

      // Verify notification
      jest.clearAllMocks();
      await schedulerService.checkAndNotifyUnconfirmedCount();
      expect(mocks.mockDiscordWebhookClient.sendMessage).toHaveBeenCalledTimes(
        1,
      );

      // Phase 3: Update status
      const updated = await bugReportService.updateStatus(
        bugReport.id,
        BugReportStatus.CONFIRMED,
      );
      expect(updated.status).toBe(BugReportStatus.CONFIRMED);
      expect(updated.images).toHaveLength(1); // Images preserved
    });
  });
});
