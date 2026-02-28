import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { BugReportService } from '../bug-report.service';
import { BugReport } from '../entities/bug-report.entity';
import { BugReportStatusHistory } from '../entities/bug-report-status-history.entity';
import { BugReportStatus } from '../enum/bug-report-status.enum';
import { UserService } from '@/user/user.service';
import { S3Client } from '@/external/aws/clients/s3.client';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';
import { DiscordMessageBuilderService } from '../services/discord-message-builder.service';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { createMockService } from '../../../test/utils/test-helpers';
import { createMockS3Client } from '../../../test/mocks/external-clients.mock';
import {
  BugReportFactory,
  UserFactory,
} from '../../../test/factories/entity.factory';
import { CreateBugReportDto } from '../dto/create-bug-report.dto';
import { BugReportListQueryDto } from '../dto/bug-report-list-query.dto';

describe('BugReportService', () => {
  let service: BugReportService;
  let bugReportRepository: ReturnType<typeof createMockRepository<BugReport>>;
  let statusHistoryRepository: ReturnType<
    typeof createMockRepository<BugReportStatusHistory>
  >;
  let userService: jest.Mocked<UserService>;
  let s3Client: ReturnType<typeof createMockS3Client>;
  let dataSource: jest.Mocked<DataSource>;
  let discordWebhookClient: { sendMessage: jest.Mock };
  let discordMessageBuilderService: { buildImmediateAlertEmbed: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    bugReportRepository = createMockRepository<BugReport>();
    statusHistoryRepository = createMockRepository<BugReportStatusHistory>();
    userService = createMockService<UserService>(['getAuthenticatedEntity']);
    s3Client = createMockS3Client();
    discordWebhookClient = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    discordMessageBuilderService = {
      buildImmediateAlertEmbed: jest.fn().mockReturnValue({
        title: 'test',
        color: 0xff0000,
        fields: [],
        timestamp: new Date().toISOString(),
      }),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (runInTransaction) => {
        const manager = {
          findOne: jest.fn((EntityClass, options) => {
            // Forward to repository mock
            return bugReportRepository.findOne(options);
          }),
          save: jest.fn((EntityClass, entity) => {
            // Forward to repository mock
            return bugReportRepository.save(entity);
          }),
        };
        return runInTransaction(manager as any);
      }),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugReportService,
        {
          provide: getRepositoryToken(BugReport),
          useValue: bugReportRepository,
        },
        {
          provide: getRepositoryToken(BugReportStatusHistory),
          useValue: statusHistoryRepository,
        },
        {
          provide: UserService,
          useValue: userService,
        },
        {
          provide: S3Client,
          useValue: s3Client,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: DiscordWebhookClient,
          useValue: discordWebhookClient,
        },
        {
          provide: DiscordMessageBuilderService,
          useValue: discordMessageBuilderService,
        },
      ],
    }).compile();

    service = module.get<BugReportService>(BugReportService);
  });

  it('should create service instance with all dependencies injected', () => {
    expect(service).toBeDefined();
  });

  describe('createBugReport', () => {
    const authUser = { sub: 1, email: 'test@example.com', role: 'USER' as const };
    const dto: CreateBugReportDto = {
      category: 'UI/UX',
      title: '버튼이 작동하지 않습니다',
      description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
    };

    it('should create a bug report without images', async () => {
      const user = UserFactory.create();
      const bugReport = BugReportFactory.create({ user, images: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);

      const result = await service.createBugReport(authUser, dto, []);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(bugReportRepository.create).toHaveBeenCalledWith({
        user,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        images: null,
      });
      expect(bugReportRepository.save).toHaveBeenCalledWith(bugReport);
      expect(result).toEqual(bugReport);
      expect(s3Client.uploadBugReportImage).not.toHaveBeenCalled();
    });

    it('should create a bug report with images', async () => {
      const user = UserFactory.create();
      const imageUrls = [
        'https://s3.amazonaws.com/bug-reports/image1.png',
        'https://s3.amazonaws.com/bug-reports/image2.png',
      ];
      const bugReport = BugReportFactory.create({ user, images: imageUrls });

      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'image1.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-1'),
          size: 1024,
        } as Express.Multer.File,
        {
          fieldname: 'images',
          originalname: 'image2.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-2'),
          size: 2048,
        } as Express.Multer.File,
      ];

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      s3Client.uploadBugReportImage
        .mockResolvedValueOnce(imageUrls[0])
        .mockResolvedValueOnce(imageUrls[1]);
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);

      const result = await service.createBugReport(authUser, dto, mockFiles);

      expect(s3Client.uploadBugReportImage).toHaveBeenCalledTimes(2);
      expect(s3Client.uploadBugReportImage).toHaveBeenNthCalledWith(
        1,
        mockFiles[0],
      );
      expect(s3Client.uploadBugReportImage).toHaveBeenNthCalledWith(
        2,
        mockFiles[1],
      );
      expect(bugReportRepository.create).toHaveBeenCalledWith({
        user,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        images: imageUrls,
      });
      expect(result).toEqual(bugReport);
    });

    it('should limit images to 5 maximum', async () => {
      const user = UserFactory.create();
      const mockFiles: Express.Multer.File[] = Array(7)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `image${i + 1}.png`,
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from(`fake-image-${i + 1}`),
          size: 1024,
        })) as Express.Multer.File[];

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      s3Client.uploadBugReportImage.mockImplementation(
        (file: Express.Multer.File) =>
          Promise.resolve(
            `https://s3.amazonaws.com/bug-reports/${file.originalname}`,
          ),
      );
      bugReportRepository.create.mockReturnValue(BugReportFactory.create());
      bugReportRepository.save.mockResolvedValue(BugReportFactory.create());

      await service.createBugReport(authUser, dto, mockFiles);

      // Should only upload first 5 images
      expect(s3Client.uploadBugReportImage).toHaveBeenCalledTimes(5);
    });

    it('버그 생성 후 Discord 알림을 전송해야 한다', async () => {
      const user = UserFactory.create();
      const bugReport = BugReportFactory.create({ user, images: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);

      await service.createBugReport(authUser, dto, []);

      // Flush the void promise so the async notification runs
      await new Promise((resolve) => setImmediate(resolve));

      expect(discordMessageBuilderService.buildImmediateAlertEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          bugReport: expect.objectContaining({
            user: expect.objectContaining({ email: authUser.email }),
          }),
        }),
      );
      expect(discordWebhookClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    });

    it('Discord 알림 실패 시에도 버그를 정상 반환해야 한다', async () => {
      const user = UserFactory.create();
      const bugReport = BugReportFactory.create({ user, images: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord 연결 실패'),
      );

      const result = await service.createBugReport(authUser, dto, []);

      // Flush the void promise so the async notification runs
      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toEqual(bugReport);
    });

    it('Discord 알림 실패 시 에러를 로그에 기록해야 한다', async () => {
      const user = UserFactory.create();
      const bugReport = BugReportFactory.create({ user, images: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);
      discordWebhookClient.sendMessage.mockRejectedValue(
        new Error('Discord 연결 실패'),
      );

      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.createBugReport(authUser, dto, []);

      // Flush the void promise so the async notification runs
      await new Promise((resolve) => setImmediate(resolve));

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Discord 버그리포트 알림 전송 실패'),
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('should return paginated bug reports', async () => {
      const queryDto: BugReportListQueryDto = { page: 1, limit: 20 };
      const bugReports = [
        BugReportFactory.create({ id: 1 }),
        BugReportFactory.create({ id: 2 }),
      ];
      const totalCount = 2;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      expect(bugReportRepository.createQueryBuilder).toHaveBeenCalledWith(
        'bugReport',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'bugReport.user',
        'user',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'bugReport.createdAt',
        'DESC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        items: bugReports,
        pageInfo: {
          page: 1,
          limit: 20,
          totalCount: 2,
          hasNext: false,
        },
      });
    });

    it('should filter by status', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        status: BugReportStatus.UNCONFIRMED,
      };

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'bugReport.status = :status',
        {
          status: BugReportStatus.UNCONFIRMED,
        },
      );
    });

    it('should filter by date', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        date: '2024-01-15',
      };

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'bugReport.createdAt >= :start',

        expect.objectContaining({ start: expect.any(Date) }),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'bugReport.createdAt < :end',

        expect.objectContaining({ end: expect.any(Date) }),
      );
    });

    it('should calculate hasNext correctly', async () => {
      const queryDto: BugReportListQueryDto = { page: 1, limit: 10 };
      const bugReports = Array(10).fill(BugReportFactory.create());
      const totalCount = 25;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      expect(result.pageInfo.hasNext).toBe(true);
    });

    it('should handle pagination correctly for page 2', async () => {
      const queryDto: BugReportListQueryDto = { page: 2, limit: 10 };
      const bugReports = Array(10).fill(BugReportFactory.create());
      const totalCount = 25;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(result.pageInfo.page).toBe(2);
      expect(result.pageInfo.hasNext).toBe(true);
    });

    it('should use default values when page and limit are not provided', async () => {
      const queryDto: BugReportListQueryDto = {};
      const bugReports = [BugReportFactory.create({ id: 1 })];
      const totalCount = 1;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      // Should use default page=1, limit=20
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0); // (1-1) * 20
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.pageInfo.page).toBe(1);
      expect(result.pageInfo.limit).toBe(20);
    });

    it('should handle query with explicit undefined for page and limit', async () => {
      const queryDto: BugReportListQueryDto = {
        page: undefined,
        limit: undefined,
      };
      const bugReports = [BugReportFactory.create()];
      const totalCount = 1;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      // Should use default values when undefined
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.pageInfo.page).toBe(1);
      expect(result.pageInfo.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return a bug report by id', async () => {
      const bugReport = BugReportFactory.create({ id: 1 });

      bugReportRepository.findOne.mockResolvedValue(bugReport);

      const result = await service.findOne(1);

      expect(bugReportRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['user'],
      });
      expect(result).toEqual(bugReport);
    });

    it('should throw NotFoundException if bug report not found', async () => {
      bugReportRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow(
        '버그 제보를 찾을 수 없습니다. (ID: 999)',
      );
    });
  });

  describe('updateStatusWithHistory', () => {
    it('should update status and create status history record', async () => {
      const adminUser = UserFactory.create({ id: 10, role: 'ADMIN' });
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.UNCONFIRMED,
      });
      bugReport.createdAt = new Date('2024-01-01T00:00:00Z');
      bugReport.updatedAt = new Date('2024-01-01T00:00:00Z');
      const updatedBugReport = {
        ...bugReport,
        status: BugReportStatus.CONFIRMED,
      };

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      bugReportRepository.save
        .mockResolvedValueOnce(updatedBugReport as BugReport)
        .mockResolvedValueOnce({} as any);

      const result = await service.updateStatusWithHistory(
        1,
        BugReportStatus.CONFIRMED,
        adminUser,
      );

      expect(result.status).toBe(BugReportStatus.CONFIRMED);
      expect(bugReportRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should record the previous status in the history entry', async () => {
      const adminUser = UserFactory.create({ id: 10, role: 'ADMIN' });
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.CONFIRMED,
      });
      bugReport.createdAt = new Date('2024-01-01T00:00:00Z');
      bugReport.updatedAt = new Date('2024-01-01T00:00:00Z');

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport as BugReport);

      await service.updateStatusWithHistory(
        1,
        BugReportStatus.FIXED,
        adminUser,
      );

      // Second save call is for BugReportStatusHistory
      const secondSaveCall = bugReportRepository.save.mock.calls[1];
      const historyData = secondSaveCall[0] as Record<string, unknown>;
      expect(historyData['previousStatus']).toBe(BugReportStatus.CONFIRMED);
      expect(historyData['status']).toBe(BugReportStatus.FIXED);
      expect(historyData['changedBy']).toBe(adminUser);
    });

    it('should throw NotFoundException when bug report does not exist in transaction', async () => {
      const adminUser = UserFactory.create({ id: 10, role: 'ADMIN' });

      bugReportRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatusWithHistory(
          999,
          BugReportStatus.CONFIRMED,
          adminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use the provided changedBy user in history entry', async () => {
      const adminUser = UserFactory.create({ id: 99, email: 'admin@test.com', role: 'ADMIN' });
      const bugReport = BugReportFactory.create({ id: 1 });
      bugReport.createdAt = new Date();
      bugReport.updatedAt = new Date();

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport as BugReport);

      await service.updateStatusWithHistory(
        1,
        BugReportStatus.FIXED,
        adminUser,
      );

      const secondSaveCall = bugReportRepository.save.mock.calls[1];
      const historyData = secondSaveCall[0] as Record<string, unknown>;
      expect(historyData['changedBy']).toEqual(adminUser);
    });
  });

  describe('findOneWithDetails', () => {
    it('should return bug report detail with status history', async () => {
      const user = UserFactory.create({
        id: 1,
        email: 'user@test.com',
        name: 'Test User',
      });
      user.createdAt = new Date('2024-01-01T00:00:00Z');

      const bugReport = BugReportFactory.create({ id: 1, user });
      bugReport.createdAt = new Date('2024-01-15T10:00:00Z');
      bugReport.updatedAt = new Date('2024-01-16T12:00:00Z');

      const changedBy = UserFactory.create({ id: 10, email: 'admin@test.com' });
      const statusHistory = [
        {
          id: 'uuid-1',
          bugReport,
          previousStatus: BugReportStatus.UNCONFIRMED,
          status: BugReportStatus.CONFIRMED,
          changedAt: new Date('2024-01-16T12:00:00Z'),
          changedBy,
          deletedAt: null,
        },
      ];

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      statusHistoryRepository.find.mockResolvedValue(statusHistory as any);

      const result = await service.findOneWithDetails(1);

      expect(result.id).toBe(1);
      expect(result.title).toBe(bugReport.title);
      expect(result.statusHistory).toHaveLength(1);
      expect(result.statusHistory[0].previousStatus).toBe(
        BugReportStatus.UNCONFIRMED,
      );
      expect(result.statusHistory[0].status).toBe(BugReportStatus.CONFIRMED);
      expect(result.statusHistory[0].changedBy).toEqual({
        id: changedBy.id,
        email: changedBy.email,
      });
      expect(result.user.email).toBe(user.email);
    });

    it('should return null changedBy when changedBy is null in history', async () => {
      const user = UserFactory.create({ id: 1 });
      user.createdAt = new Date('2024-01-01T00:00:00Z');

      const bugReport = BugReportFactory.create({ id: 1, user });
      bugReport.createdAt = new Date('2024-01-15T10:00:00Z');
      bugReport.updatedAt = new Date('2024-01-16T12:00:00Z');

      const statusHistory = [
        {
          id: 'uuid-2',
          bugReport,
          previousStatus: BugReportStatus.UNCONFIRMED,
          status: BugReportStatus.CONFIRMED,
          changedAt: new Date('2024-01-16T12:00:00Z'),
          changedBy: null,
          deletedAt: null,
        },
      ];

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      statusHistoryRepository.find.mockResolvedValue(statusHistory as any);

      const result = await service.findOneWithDetails(1);

      expect(result.statusHistory[0].changedBy).toBeNull();
    });

    it('should return empty statusHistory array when no history exists', async () => {
      const user = UserFactory.create({ id: 1 });
      user.createdAt = new Date('2024-01-01T00:00:00Z');

      const bugReport = BugReportFactory.create({ id: 1, user });
      bugReport.createdAt = new Date('2024-01-15T10:00:00Z');
      bugReport.updatedAt = new Date('2024-01-15T10:00:00Z');

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      statusHistoryRepository.find.mockResolvedValue([]);

      const result = await service.findOneWithDetails(1);

      expect(result.statusHistory).toHaveLength(0);
    });

    it('should throw NotFoundException when bug report does not exist', async () => {
      bugReportRepository.findOne.mockResolvedValue(null);

      await expect(service.findOneWithDetails(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should query status history ordered by changedAt DESC', async () => {
      const user = UserFactory.create({ id: 1 });
      user.createdAt = new Date('2024-01-01T00:00:00Z');

      const bugReport = BugReportFactory.create({ id: 1, user });
      bugReport.createdAt = new Date('2024-01-15T10:00:00Z');
      bugReport.updatedAt = new Date('2024-01-15T10:00:00Z');

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      statusHistoryRepository.find.mockResolvedValue([]);

      await service.findOneWithDetails(1);

      expect(statusHistoryRepository.find).toHaveBeenCalledWith({
        where: { bugReport: { id: 1 } },
        relations: ['changedBy'],
        order: { changedAt: 'DESC' },
      });
    });

    it('should return correct ISO date strings for all timestamps', async () => {
      const user = UserFactory.create({ id: 1 });
      user.createdAt = new Date('2024-01-01T00:00:00Z');

      const bugReport = BugReportFactory.create({ id: 1, user });
      const fixedDate = new Date('2024-06-15T08:30:00Z');
      bugReport.createdAt = fixedDate;
      bugReport.updatedAt = fixedDate;

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      statusHistoryRepository.find.mockResolvedValue([]);

      const result = await service.findOneWithDetails(1);

      expect(result.createdAt).toBe(fixedDate.toISOString());
      expect(result.updatedAt).toBe(fixedDate.toISOString());
    });
  });

  describe('createBugReport - image upload failures', () => {
    const authUser = { sub: 1, email: 'test@example.com', role: 'USER' as const };

    it('should log warning when some image uploads fail', async () => {
      const user = UserFactory.create();
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'success.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('data'),
          size: 1024,
        } as Express.Multer.File,
        {
          fieldname: 'images',
          originalname: 'fail.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('data'),
          size: 1024,
        } as Express.Multer.File,
      ];

      const successUrl = 'https://s3.amazonaws.com/bug-reports/success.png';

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      s3Client.uploadBugReportImage
        .mockResolvedValueOnce(successUrl)
        .mockRejectedValueOnce(new Error('Upload failed'));
      bugReportRepository.create.mockReturnValue(
        BugReportFactory.create({ user, images: [successUrl] }),
      );
      bugReportRepository.save.mockResolvedValue(
        BugReportFactory.create({ user, images: [successUrl] }),
      );

      const loggerWarnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation();

      const result = await service.createBugReport(authUser, {
        category: 'Bug',
        title: 'Test',
        description: 'Desc',
      }, mockFiles);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bug report image upload(s) failed'),
      );
      expect(result).toBeDefined();

      loggerWarnSpy.mockRestore();
    });

    it('should set imageUrls to null when all image uploads fail', async () => {
      const user = UserFactory.create();
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'fail.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('data'),
          size: 1024,
        } as Express.Multer.File,
      ];

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      s3Client.uploadBugReportImage.mockRejectedValue(
        new Error('Upload failed'),
      );
      const bugReport = BugReportFactory.create({ user, images: null });
      bugReportRepository.create.mockReturnValue(bugReport);
      bugReportRepository.save.mockResolvedValue(bugReport);

      const result = await service.createBugReport(authUser, {
        category: 'Bug',
        title: 'Test',
        description: 'Desc',
      }, mockFiles);

      expect(bugReportRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ images: null }),
      );
      expect(result.images).toBeNull();
    });
  });

  describe('findAll - additional branch coverage', () => {
    it('should filter by category when provided', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        category: 'UI/UX',
      };

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'bugReport.category = :category',
        { category: 'UI/UX' },
      );
    });

    it('should filter by search term when provided', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        search: '버튼',
      };

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(bugReport.title ILIKE :search OR bugReport.description ILIKE :search)',
        { search: '%버튼%' },
      );
    });

    it('should return hasNext false when on last page', async () => {
      const queryDto: BugReportListQueryDto = { page: 3, limit: 10 };
      const bugReports = Array(5).fill(BugReportFactory.create());
      const totalCount = 25;

      const mockQueryBuilder =
        bugReportRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<BugReport>
        >;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        bugReports,
        totalCount,
      ]);

      const result = await service.findAll(queryDto);

      // skip=20, items=5, totalCount=25 => hasNext = (20+5 < 25) = false
      expect(result.pageInfo.hasNext).toBe(false);
    });
  });
});
