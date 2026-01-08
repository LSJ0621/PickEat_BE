import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { BugReportService } from '../bug-report.service';
import { BugReport } from '../entities/bug-report.entity';
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
  let userService: jest.Mocked<UserService>;
  let s3Client: ReturnType<typeof createMockS3Client>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bugReportRepository = createMockRepository<BugReport>();
    userService = createMockService<UserService>(['getAuthenticatedEntity']);
    s3Client = createMockS3Client();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugReportService,
        {
          provide: getRepositoryToken(BugReport),
          useValue: bugReportRepository,
        },
        {
          provide: UserService,
          useValue: userService,
        },
        {
          provide: S3Client,
          useValue: s3Client,
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
});
