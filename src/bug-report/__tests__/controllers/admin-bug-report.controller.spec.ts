import { Test, TestingModule } from '@nestjs/testing';
import { AdminBugReportController } from '../../controllers/admin-bug-report.controller';
import { BugReportService } from '../../bug-report.service';
import { createMockService } from '../../../../test/utils/test-helpers';
import { BugReportFactory } from '../../../../test/factories/entity.factory';
import { BugReportListQueryDto } from '../../dto/bug-report-list-query.dto';
import { UpdateBugReportStatusDto } from '../../dto/update-bug-report-status.dto';
import { BugReportStatus } from '../../enum/bug-report-status.enum';
import { User } from '../../../user/entities/user.entity';

describe('AdminBugReportController', () => {
  let controller: AdminBugReportController;
  let bugReportService: jest.Mocked<BugReportService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bugReportService = createMockService<BugReportService>([
      'findAll',
      'findOne',
      'updateStatus',
    ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminBugReportController],
      providers: [
        {
          provide: BugReportService,
          useValue: bugReportService,
        },
      ],
    }).compile();

    controller = module.get<AdminBugReportController>(AdminBugReportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated bug reports', async () => {
      const queryDto: BugReportListQueryDto = { page: 1, limit: 20 };
      const bugReports = [
        BugReportFactory.create({ id: 1 }),
        BugReportFactory.create({ id: 2 }),
      ];
      const paginatedResponse = {
        items: bugReports,
        pageInfo: {
          page: 1,
          limit: 20,
          totalCount: 2,
          hasNext: false,
        },
      };

      bugReportService.findAll.mockResolvedValue(paginatedResponse);

      const result = await controller.findAll(queryDto);

      expect(bugReportService.findAll).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(paginatedResponse);
    });

    it('should filter by status', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        status: BugReportStatus.UNCONFIRMED,
      };

      const paginatedResponse = {
        items: [
          BugReportFactory.create({ status: BugReportStatus.UNCONFIRMED }),
        ],
        pageInfo: {
          page: 1,
          limit: 20,
          totalCount: 1,
          hasNext: false,
        },
      };

      bugReportService.findAll.mockResolvedValue(paginatedResponse);

      const result = await controller.findAll(queryDto);

      expect(bugReportService.findAll).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(paginatedResponse);
    });

    it('should filter by date', async () => {
      const queryDto: BugReportListQueryDto = {
        page: 1,
        limit: 20,
        date: '2024-01-15',
      };

      const paginatedResponse = {
        items: [],
        pageInfo: {
          page: 1,
          limit: 20,
          totalCount: 0,
          hasNext: false,
        },
      };

      bugReportService.findAll.mockResolvedValue(paginatedResponse);

      const result = await controller.findAll(queryDto);

      expect(bugReportService.findAll).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(paginatedResponse);
    });

    it('should handle pagination with page 2', async () => {
      const queryDto: BugReportListQueryDto = { page: 2, limit: 10 };
      const paginatedResponse = {
        items: Array(10).fill(BugReportFactory.create()),
        pageInfo: {
          page: 2,
          limit: 10,
          totalCount: 25,
          hasNext: true,
        },
      };

      bugReportService.findAll.mockResolvedValue(paginatedResponse);

      const result = await controller.findAll(queryDto);

      expect(result.pageInfo.page).toBe(2);
      expect(result.pageInfo.hasNext).toBe(true);
    });

    it('should use default pagination values if not provided', async () => {
      const queryDto: BugReportListQueryDto = {};
      const paginatedResponse = {
        items: [],
        pageInfo: {
          page: 1,
          limit: 20,
          totalCount: 0,
          hasNext: false,
        },
      };

      bugReportService.findAll.mockResolvedValue(paginatedResponse);

      await controller.findAll(queryDto);

      expect(bugReportService.findAll).toHaveBeenCalledWith(queryDto);
    });
  });

  describe('findOne', () => {
    it('should return a single bug report by id', async () => {
      const bugReport = BugReportFactory.create({ id: 1 });
      bugReportService.findOne.mockResolvedValue(bugReport);

      const result = await controller.findOne(1);

      expect(bugReportService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(bugReport);
    });

    it('should handle numeric id correctly', async () => {
      const bugReport = BugReportFactory.create({ id: 123 });
      bugReportService.findOne.mockResolvedValue(bugReport);

      const result = await controller.findOne(123);

      expect(bugReportService.findOne).toHaveBeenCalledWith(123);
      expect(result).toEqual(bugReport);
    });

    it('should return bug report with user relation', async () => {
      const bugReport = BugReportFactory.create({
        id: 1,
        user: {
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
        } as Partial<User> as User,
      });

      bugReportService.findOne.mockResolvedValue(bugReport);

      const result = await controller.findOne(1);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should return bug report with images', async () => {
      const bugReport = BugReportFactory.create({
        id: 1,
        images: [
          'https://s3.amazonaws.com/bug-reports/image1.png',
          'https://s3.amazonaws.com/bug-reports/image2.png',
        ],
      });

      bugReportService.findOne.mockResolvedValue(bugReport);

      const result = await controller.findOne(1);

      expect(result.images).toHaveLength(2);
    });
  });

  describe('updateStatus', () => {
    it('should update bug report status to CONFIRMED', async () => {
      const dto: UpdateBugReportStatusDto = {
        status: BugReportStatus.CONFIRMED,
      };
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.CONFIRMED,
      });

      bugReportService.updateStatus.mockResolvedValue(bugReport);

      const result = await controller.updateStatus(1, dto);

      expect(bugReportService.updateStatus).toHaveBeenCalledWith(
        1,
        BugReportStatus.CONFIRMED,
      );
      expect(result.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('should update bug report status to UNCONFIRMED', async () => {
      const dto: UpdateBugReportStatusDto = {
        status: BugReportStatus.UNCONFIRMED,
      };
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.UNCONFIRMED,
      });

      bugReportService.updateStatus.mockResolvedValue(bugReport);

      const result = await controller.updateStatus(1, dto);

      expect(bugReportService.updateStatus).toHaveBeenCalledWith(
        1,
        BugReportStatus.UNCONFIRMED,
      );
      expect(result.status).toBe(BugReportStatus.UNCONFIRMED);
    });

    it('should handle numeric id correctly', async () => {
      const dto: UpdateBugReportStatusDto = {
        status: BugReportStatus.CONFIRMED,
      };
      const bugReport = BugReportFactory.create({ id: 456 });

      bugReportService.updateStatus.mockResolvedValue(bugReport);

      await controller.updateStatus(456, dto);

      expect(bugReportService.updateStatus).toHaveBeenCalledWith(
        456,
        BugReportStatus.CONFIRMED,
      );
    });

    it('should return the updated bug report with all fields', async () => {
      const dto: UpdateBugReportStatusDto = {
        status: BugReportStatus.CONFIRMED,
      };
      const bugReport = BugReportFactory.create({
        id: 1,
        status: BugReportStatus.CONFIRMED,
        category: 'UI/UX',
        title: 'Test Bug',
        description: 'Test Description',
      });

      bugReportService.updateStatus.mockResolvedValue(bugReport);

      const result = await controller.updateStatus(1, dto);

      expect(result).toEqual(bugReport);
      expect(result.category).toBe('UI/UX');
      expect(result.title).toBe('Test Bug');
      expect(result.description).toBe('Test Description');
    });
  });
});
