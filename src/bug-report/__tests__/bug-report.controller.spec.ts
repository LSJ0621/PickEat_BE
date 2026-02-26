import { Test, TestingModule } from '@nestjs/testing';
import { BugReportController } from '../bug-report.controller';
import { BugReportService } from '../bug-report.service';
import { createMockService } from '../../../test/utils/test-helpers';
import { BugReportFactory } from '../../../test/factories/entity.factory';
import { CreateBugReportDto } from '../dto/create-bug-report.dto';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';

describe('BugReportController', () => {
  let controller: BugReportController;
  let bugReportService: jest.Mocked<BugReportService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bugReportService = createMockService<BugReportService>(['createBugReport']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BugReportController],
      providers: [
        {
          provide: BugReportService,
          useValue: bugReportService,
        },
      ],
    }).compile();

    controller = module.get<BugReportController>(BugReportController);
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  describe('createBugReport', () => {
    const authUser: AuthUserPayload = {
      sub: 1,
      email: 'test@example.com',
      role: 'USER',
    };

    const dto: CreateBugReportDto = {
      category: 'UI/UX',
      title: '버튼이 작동하지 않습니다',
      description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
    };

    it('should create a bug report when no files are provided', async () => {
      const bugReport = BugReportFactory.create({ id: 1, images: null });
      bugReportService.createBugReport.mockResolvedValue(bugReport);

      const result = await controller.createBugReport(dto, [], authUser);

      expect(bugReportService.createBugReport).toHaveBeenCalledWith(
        authUser,
        dto,
        [],
      );
      expect(result).toEqual({ id: 1 });
    });

    it('should create a bug report when files are provided', async () => {
      const mockFiles: Express.Multer.File[] = [
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

      const bugReport = BugReportFactory.create({
        id: 2,
        images: [
          'https://s3.amazonaws.com/bug-reports/screenshot1.png',
          'https://s3.amazonaws.com/bug-reports/screenshot2.png',
        ],
      });

      bugReportService.createBugReport.mockResolvedValue(bugReport);

      const result = await controller.createBugReport(dto, mockFiles, authUser);

      expect(bugReportService.createBugReport).toHaveBeenCalledWith(
        authUser,
        dto,
        mockFiles,
      );
      expect(result).toEqual({ id: 2 });
    });

    it('should handle bug report creation when files parameter is undefined', async () => {
      const bugReport = BugReportFactory.create({ id: 3, images: null });
      bugReportService.createBugReport.mockResolvedValue(bugReport);

      const result = await controller.createBugReport(
        dto,
        undefined as unknown as Express.Multer.File[],
        authUser,
      );

      expect(bugReportService.createBugReport).toHaveBeenCalledWith(
        authUser,
        dto,
        [],
      );
      expect(result).toEqual({ id: 3 });
    });

    it('should return only the id when bug report is created', async () => {
      const bugReport = BugReportFactory.create({
        id: 123,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        images: ['https://s3.amazonaws.com/bug-reports/image.png'],
      });

      bugReportService.createBugReport.mockResolvedValue(bugReport);

      const result = await controller.createBugReport(dto, [], authUser);

      expect(result).toEqual({ id: 123 });
      expect(result).not.toHaveProperty('category');
      expect(result).not.toHaveProperty('title');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('images');
    });

    it('should handle bug report creation when different categories are provided', async () => {
      const categories = [
        'UI/UX',
        'Performance',
        'Security',
        'Feature Request',
      ];

      for (const category of categories) {
        const categoryDto = { ...dto, category };
        const bugReport = BugReportFactory.create({ id: 1, category });

        bugReportService.createBugReport.mockResolvedValue(bugReport);

        const result = await controller.createBugReport(
          categoryDto,
          [],
          authUser,
        );

        expect(bugReportService.createBugReport).toHaveBeenCalledWith(
          authUser,
          categoryDto,
          [],
        );
        expect(result).toEqual({ id: 1 });
      }
    });

    it('should accept up to 5 files when multiple files are uploaded', async () => {
      const mockFiles: Express.Multer.File[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `image${i + 1}.png`,
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from(`fake-image-${i + 1}`),
          size: 1024,
        })) as Express.Multer.File[];

      const bugReport = BugReportFactory.create({ id: 1 });
      bugReportService.createBugReport.mockResolvedValue(bugReport);

      const result = await controller.createBugReport(dto, mockFiles, authUser);

      expect(bugReportService.createBugReport).toHaveBeenCalledWith(
        authUser,
        dto,
        mockFiles,
      );
      expect(result).toEqual({ id: 1 });
    });
  });
});
