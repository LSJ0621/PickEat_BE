import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { BugReportService } from '../bug-report.service';
import { BugReport } from '../entities/bug-report.entity';
import { BugReportStatusHistory } from '../entities/bug-report-status-history.entity';
import { BugReportAdminNote } from '../entities/bug-report-admin-note.entity';
import { BugReportStatus } from '../enum/bug-report-status.enum';
import { UserService } from '../../user/user.service';
import { S3Client } from '../../external/aws/clients/s3.client';
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
  let adminNoteRepository: ReturnType<
    typeof createMockRepository<BugReportAdminNote>
  >;
  let userService: jest.Mocked<UserService>;
  let s3Client: ReturnType<typeof createMockS3Client>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bugReportRepository = createMockRepository<BugReport>();
    statusHistoryRepository = createMockRepository<BugReportStatusHistory>();
    adminNoteRepository = createMockRepository<BugReportAdminNote>();
    userService = createMockService<UserService>(['getAuthenticatedEntity']);
    s3Client = createMockS3Client();

    // Mock DataSource for transaction testing
    const mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn((callback) => callback(mockEntityManager)),
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
          provide: getRepositoryToken(BugReportAdminNote),
          useValue: adminNoteRepository,
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
      ],
    }).compile();

    service = module.get<BugReportService>(BugReportService);
  });

  it('should create service instance with all dependencies injected', () => {
    expect(service).toBeDefined();
  });

  describe('createBugReport', () => {
    const authUser = { email: 'test@example.com', role: 'USER' as const };
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

  describe('updateStatus', () => {
    it('should update bug report status', async () => {
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.UNCONFIRMED,
      });
      const updatedBugReport = {
        ...bugReport,
        status: BugReportStatus.CONFIRMED,
      };

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      bugReportRepository.save.mockResolvedValue(updatedBugReport);

      const result = await service.updateStatus(1, BugReportStatus.CONFIRMED);

      expect(bugReportRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['user'],
      });
      expect(bugReportRepository.save).toHaveBeenCalledWith(bugReport);
      expect(result.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('should throw NotFoundException if bug report not found', async () => {
      bugReportRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(999, BugReportStatus.CONFIRMED),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update status from UNCONFIRMED to CONFIRMED', async () => {
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.UNCONFIRMED,
      });
      const updatedBugReport = {
        ...bugReport,
        status: BugReportStatus.CONFIRMED,
      };

      bugReportRepository.findOne.mockResolvedValue(bugReport);
      bugReportRepository.save.mockResolvedValue(updatedBugReport);

      const result = await service.updateStatus(1, BugReportStatus.CONFIRMED);

      expect(result.status).toBe(BugReportStatus.CONFIRMED);
    });
  });

  describe('batchUpdateStatus', () => {
    const changedBy = UserFactory.create({
      id: 1,
      email: 'admin@example.com',
    });

    beforeEach(() => {
      // Reset transaction mock for each test
      const mockEntityManager = {
        findOne: jest.fn(),
        save: jest.fn(),
      };
      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;
    });

    it('should update all bug reports in a transaction when all exist', async () => {
      // Arrange
      const ids = [1, 2, 3];
      const status = BugReportStatus.CONFIRMED;

      const mockBugReports = ids.map((id) =>
        BugReportFactory.create({
          id,
          status: BugReportStatus.UNCONFIRMED,
        }),
      );

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockBugReports[0])
          .mockResolvedValueOnce(mockBugReports[1])
          .mockResolvedValueOnce(mockBugReports[2]),
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(3);
      expect(result.failedIds).toEqual([]);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.findOne).toHaveBeenCalledTimes(3);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(6); // 3 BugReport + 3 BugReportStatusHistory
    });

    it('should handle partial failure and return failedIds', async () => {
      // Arrange
      const ids = [1, 2, 3];
      const status = BugReportStatus.CONFIRMED;

      const mockBugReport1 = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.UNCONFIRMED,
      });
      const mockBugReport3 = BugReportFactory.create({
        id: 3,
        status: BugReportStatus.UNCONFIRMED,
      });

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockBugReport1) // ID 1 exists
          .mockResolvedValueOnce(null) // ID 2 not found
          .mockResolvedValueOnce(mockBugReport3), // ID 3 exists
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(2);
      expect(result.failedIds).toEqual([2]);
      expect(mockEntityManager.findOne).toHaveBeenCalledTimes(3);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(4); // 2 BugReport + 2 BugReportStatusHistory
    });

    it('should handle empty array input', async () => {
      // Arrange
      const ids: number[] = [];
      const status = BugReportStatus.CONFIRMED;

      const mockEntityManager = {
        findOne: jest.fn(),
        save: jest.fn(),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(0);
      expect(result.failedIds).toEqual([]);
      expect(mockEntityManager.findOne).not.toHaveBeenCalled();
      expect(mockEntityManager.save).not.toHaveBeenCalled();
    });

    it('should handle all failures when no bug reports exist', async () => {
      // Arrange
      const ids = [999, 1000, 1001];
      const status = BugReportStatus.CONFIRMED;

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null), // All not found
        save: jest.fn(),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(0);
      expect(result.failedIds).toEqual([999, 1000, 1001]);
      expect(mockEntityManager.findOne).toHaveBeenCalledTimes(3);
      expect(mockEntityManager.save).not.toHaveBeenCalled();
    });

    it('should update bug report status and create status history', async () => {
      // Arrange
      const ids = [1];
      const status = BugReportStatus.FIXED;
      const previousStatus = BugReportStatus.CONFIRMED;

      const mockBugReport = BugReportFactory.create({
        id: 1,
        status: previousStatus,
      });

      const saveCalls: unknown[] = [];
      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(mockBugReport),
        save: jest.fn().mockImplementation((entity, data) => {
          saveCalls.push({ entity, data });
          return Promise.resolve(data);
        }),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);

      // First call should be BugReport save
      expect(saveCalls[0]).toEqual({
        entity: BugReport,
        data: expect.objectContaining({
          id: 1,
          status: BugReportStatus.FIXED,
        }),
      });

      // Second call should be BugReportStatusHistory save
      expect(saveCalls[1]).toEqual({
        entity: expect.anything(),
        data: expect.objectContaining({
          bugReport: expect.objectContaining({ id: 1 }),
          previousStatus,
          status: BugReportStatus.FIXED,
          changedBy,
        }),
      });
    });

    it('should run all updates within a single transaction', async () => {
      // Arrange
      const ids = [1, 2];
      const status = BugReportStatus.CLOSED;

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(
          BugReportFactory.create({
            status: BugReportStatus.FIXED,
          }),
        ),
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.batchUpdateStatus(ids, status, changedBy);

      // Assert - Verify transaction was called once (all updates in single transaction)
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(dataSource.transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle database errors gracefully and include failed ID', async () => {
      // Arrange
      const ids = [1, 2];
      const status = BugReportStatus.CONFIRMED;

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(BugReportFactory.create({ id: 1 }))
          .mockRejectedValueOnce(new Error('Database connection lost')), // ID 2 fails
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(1);
      expect(result.failedIds).toEqual([2]);
    });

    it('should continue processing remaining IDs after individual failure', async () => {
      // Arrange
      const ids = [1, 2, 3, 4];
      const status = BugReportStatus.CONFIRMED;

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(BugReportFactory.create({ id: 1 })) // Success
          .mockResolvedValueOnce(null) // ID 2 fails (not found)
          .mockRejectedValueOnce(new Error('DB error')) // ID 3 fails (error)
          .mockResolvedValueOnce(BugReportFactory.create({ id: 4 })), // Success
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      const result = await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(result.updatedCount).toBe(2); // IDs 1 and 4 succeeded
      expect(result.failedIds).toEqual([2, 3]); // IDs 2 and 3 failed
      expect(mockEntityManager.findOne).toHaveBeenCalledTimes(4); // All 4 were attempted
    });

    it('should query bug reports with correct relations', async () => {
      // Arrange
      const ids = [1];
      const status = BugReportStatus.CONFIRMED;

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(
          BugReportFactory.create({
            id: 1,
            user: UserFactory.create(),
          }),
        ),
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction = jest.fn((callback) =>
        callback(mockEntityManager),
      ) as jest.Mock;

      // Act
      await service.batchUpdateStatus(ids, status, changedBy);

      // Assert
      expect(mockEntityManager.findOne).toHaveBeenCalledWith(BugReport, {
        where: { id: 1 },
        relations: ['user'],
      });
    });
  });
});
