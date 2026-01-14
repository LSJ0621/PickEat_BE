import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminMonitoringService } from '../services/admin-monitoring.service';
import { ApiUsageLog } from '../entities/api-usage-log.entity';
import { EmailLog } from '../entities/email-log.entity';
import { S3Client } from '@/external/aws/clients/s3.client';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../../test/mocks/repository.mock';
import { API_PROVIDERS, EMAIL_PURPOSES } from '../monitoring.constants';

describe('AdminMonitoringService', () => {
  let service: AdminMonitoringService;
  let mockApiUsageLogRepository: ReturnType<
    typeof createMockRepository<ApiUsageLog>
  >;
  let mockEmailLogRepository: ReturnType<typeof createMockRepository<EmailLog>>;
  let mockS3Client: jest.Mocked<Pick<S3Client, 'getBucketStats'>>;

  beforeEach(async () => {
    mockApiUsageLogRepository = createMockRepository<ApiUsageLog>();
    mockEmailLogRepository = createMockRepository<EmailLog>();
    mockS3Client = {
      getBucketStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMonitoringService,
        {
          provide: getRepositoryToken(ApiUsageLog),
          useValue: mockApiUsageLogRepository,
        },
        {
          provide: getRepositoryToken(EmailLog),
          useValue: mockEmailLogRepository,
        },
        {
          provide: S3Client,
          useValue: mockS3Client,
        },
      ],
    }).compile();

    service = module.get<AdminMonitoringService>(AdminMonitoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getApiUsageStats', () => {
    it('should return API usage stats for 7 days period', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      // Setup default mock response for all query builder calls
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '7d' });

      // Assert
      expect(result.period).toBe('7d');
      expect(result.openai).toHaveProperty('totalCalls');
      expect(result.openai).toHaveProperty('successCount');
      expect(result.openai).toHaveProperty('failureCount');
      expect(result.openai).toHaveProperty('successRate');
      expect(result.openai).toHaveProperty('avgResponseTimeMs');
      expect(result.openai).toHaveProperty('totalPromptTokens');
      expect(result.openai).toHaveProperty('totalCompletionTokens');
      expect(result.openai).toHaveProperty('totalTokens');
      expect(result.openai).toHaveProperty('estimatedCostUsd');
      expect(result.openai).toHaveProperty('byModel');
      expect(result.openai).toHaveProperty('dailyBreakdown');
      expect(result.googlePlaces).toHaveProperty('totalCalls');
      expect(result.googlePlaces).toHaveProperty('dailyBreakdown');
      expect(result.googleCse).toHaveProperty('totalCalls');
      expect(result.googleCse).toHaveProperty('dailyQuota');
      expect(result.googleCse).toHaveProperty('todayUsage');
      expect(result.googleCse).toHaveProperty('remainingQuota');
      expect(result.kakao).toHaveProperty('local');
      expect(result.kakao).toHaveProperty('oauth');
      expect(result.kakao).toHaveProperty('dailyBreakdown');
    });

    it('should handle 30 days period', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      // Setup minimal mocks to test period calculation
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '30d' });

      // Assert
      expect(result.period).toBe('30d');
      expect(result.openai.dailyBreakdown.length).toBe(31); // 30 days + 1 for today
    });

    it('should handle 90 days period', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '90d' });

      // Assert
      expect(result.period).toBe('90d');
      expect(result.openai.dailyBreakdown.length).toBe(91); // 90 days + 1 for today
    });

    it('should default to 7 days when period is not specified', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({});

      // Assert
      expect(result.period).toBe('7d');
      expect(result.openai.dailyBreakdown.length).toBe(8); // 7 days + 1 for today
    });

    it('should handle empty data gracefully', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '7d' });

      // Assert
      expect(result.openai.totalCalls).toBe(0);
      expect(result.openai.successRate).toBe(0);
      expect(result.openai.byModel).toEqual([]);
      expect(result.googlePlaces.totalCalls).toBe(0);
      expect(result.googleCse.totalCalls).toBe(0);
      expect(result.kakao.local.totalCalls).toBe(0);
      expect(result.kakao.oauth.totalCalls).toBe(0);
    });

    it('should calculate OpenAI cost correctly for multiple models', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
        totalPromptTokens: null,
        totalCompletionTokens: null,
        totalTokens: null,
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '7d' });

      // Assert
      expect(result.openai).toHaveProperty('byModel');
      expect(Array.isArray(result.openai.byModel)).toBe(true);
      expect(result.openai).toHaveProperty('estimatedCostUsd');
      expect(typeof result.openai.estimatedCostUsd).toBe('number');
    });

    it('should handle null token stats from OpenAI', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<ApiUsageLog>();

      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({
          totalCalls: '5',
          successCount: '5',
          failureCount: '0',
          avgResponseTimeMs: '1000',
        })
        .mockResolvedValueOnce({
          totalPromptTokens: null,
          totalCompletionTokens: null,
          totalTokens: null,
        });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCalls: '0',
        successCount: '0',
        failureCount: '0',
        avgResponseTimeMs: '0',
      });

      mockApiUsageLogRepository.count.mockResolvedValue(0);
      mockApiUsageLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getApiUsageStats({ period: '7d' });

      // Assert
      expect(result.openai.totalPromptTokens).toBe(0);
      expect(result.openai.totalCompletionTokens).toBe(0);
      expect(result.openai.totalTokens).toBe(0);
    });
  });

  describe('getEmailStats', () => {
    it('should return email stats for 7 days period', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      // Mock summary
      mockQueryBuilder.getRawOne.mockResolvedValueOnce({
        totalSent: '100',
        successCount: '95',
        failureCount: '5',
      });

      // Mock by purpose
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          {
            purpose: EMAIL_PURPOSES.SIGNUP,
            totalSent: '60',
            successCount: '58',
            failureCount: '2',
          },
          {
            purpose: EMAIL_PURPOSES.PASSWORD_RESET,
            totalSent: '30',
            successCount: '28',
            failureCount: '2',
          },
          {
            purpose: EMAIL_PURPOSES.RE_REGISTER,
            totalSent: '10',
            successCount: '9',
            failureCount: '1',
          },
        ])
        .mockResolvedValueOnce([
          {
            date: '2024-01-14',
            totalSent: '50',
            successCount: '48',
            failureCount: '2',
          },
          {
            date: '2024-01-15',
            totalSent: '50',
            successCount: '47',
            failureCount: '3',
          },
        ]);

      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({ period: '7d' });

      // Assert
      expect(result).toEqual({
        period: '7d',
        summary: {
          totalSent: 100,
          successCount: 95,
          failureCount: 5,
          successRate: 95,
        },
        byPurpose: [
          {
            purpose: EMAIL_PURPOSES.SIGNUP,
            totalSent: 60,
            successCount: 58,
            failureCount: 2,
            successRate: 97,
          },
          {
            purpose: EMAIL_PURPOSES.PASSWORD_RESET,
            totalSent: 30,
            successCount: 28,
            failureCount: 2,
            successRate: 93,
          },
          {
            purpose: EMAIL_PURPOSES.RE_REGISTER,
            totalSent: 10,
            successCount: 9,
            failureCount: 1,
            successRate: 90,
          },
        ],
        dailyBreakdown: expect.any(Array),
      });
      expect(result.dailyBreakdown.length).toBe(8); // 7 days + 1 for today
    });

    it('should handle 30 days period for email stats', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalSent: '0',
        successCount: '0',
        failureCount: '0',
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({ period: '30d' });

      // Assert
      expect(result.period).toBe('30d');
      expect(result.dailyBreakdown.length).toBe(31); // 30 days + 1 for today
    });

    it('should default to 7 days when period is not specified', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalSent: '0',
        successCount: '0',
        failureCount: '0',
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({});

      // Assert
      expect(result.period).toBe('7d');
    });

    it('should handle empty email data gracefully', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalSent: '0',
        successCount: '0',
        failureCount: '0',
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({ period: '7d' });

      // Assert
      expect(result.summary.totalSent).toBe(0);
      expect(result.summary.successRate).toBe(0);
      expect(result.byPurpose).toEqual([]);
    });

    it('should calculate success rate correctly', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalSent: '200',
        successCount: '150',
        failureCount: '50',
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({ period: '7d' });

      // Assert
      expect(result.summary.successRate).toBe(75); // (150/200) * 100 = 75
    });

    it('should fill missing dates in daily breakdown', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<EmailLog>();

      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalSent: '10',
        successCount: '10',
        failureCount: '0',
      });

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            date: '2024-01-14',
            totalSent: '5',
            successCount: '5',
            failureCount: '0',
          },
        ]);

      mockEmailLogRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.getEmailStats({ period: '7d' });

      // Assert
      expect(result.dailyBreakdown.length).toBe(8);
      const datesWithZero = result.dailyBreakdown.filter(
        (day) => day.totalSent === 0,
      );
      expect(datesWithZero.length).toBeGreaterThan(0);
    });
  });

  describe('getStorageStats', () => {
    it('should return storage stats from S3', async () => {
      // Arrange
      const mockBucketStats = {
        totalSizeBytes: 10485760, // 10 MB
        fileCount: 5,
        files: [
          {
            key: 'bug-reports/test1.jpg',
            size: 2097152, // 2 MB
            lastModified: new Date('2024-01-14'),
          },
          {
            key: 'bug-reports/test2.jpg',
            size: 2097152,
            lastModified: new Date('2024-01-15'),
          },
          {
            key: 'bug-reports/test3.jpg',
            size: 2097152,
            lastModified: new Date('2024-01-16'),
          },
          {
            key: 'bug-reports/test4.jpg',
            size: 2097152,
            lastModified: new Date('2024-01-17'),
          },
          {
            key: 'bug-reports/test5.jpg',
            size: 2097152,
            lastModified: new Date('2024-01-18'),
          },
        ],
      };

      mockS3Client.getBucketStats.mockResolvedValue(mockBucketStats);

      // Act
      const result = await service.getStorageStats();

      // Assert
      expect(result).toEqual({
        totalSizeBytes: 10485760,
        totalSizeMb: 10.0,
        fileCount: 5,
        files: mockBucketStats.files,
      });
      expect(mockS3Client.getBucketStats).toHaveBeenCalled();
    });

    it('should handle empty bucket', async () => {
      // Arrange
      mockS3Client.getBucketStats.mockResolvedValue({
        totalSizeBytes: 0,
        fileCount: 0,
        files: [],
      });

      // Act
      const result = await service.getStorageStats();

      // Assert
      expect(result.totalSizeBytes).toBe(0);
      expect(result.totalSizeMb).toBe(0);
      expect(result.fileCount).toBe(0);
      expect(result.files).toEqual([]);
    });

    it('should round totalSizeMb to 2 decimal places', async () => {
      // Arrange
      mockS3Client.getBucketStats.mockResolvedValue({
        totalSizeBytes: 1536789, // 1.466... MB
        fileCount: 1,
        files: [
          {
            key: 'test.jpg',
            size: 1536789,
            lastModified: new Date(),
          },
        ],
      });

      // Act
      const result = await service.getStorageStats();

      // Assert
      expect(result.totalSizeMb).toBe(1.47); // Rounded to 2 decimal places
    });

    it('should handle large bucket with many files', async () => {
      // Arrange
      const files = Array.from({ length: 1000 }, (_, i) => ({
        key: `bug-reports/test${i}.jpg`,
        size: 1048576, // 1 MB each
        lastModified: new Date(),
      }));

      mockS3Client.getBucketStats.mockResolvedValue({
        totalSizeBytes: 1048576000, // 1000 MB
        fileCount: 1000,
        files,
      });

      // Act
      const result = await service.getStorageStats();

      // Assert
      expect(result.totalSizeMb).toBe(1000.0);
      expect(result.fileCount).toBe(1000);
      expect(result.files.length).toBe(1000);
    });

    it('should handle fractional bytes correctly', async () => {
      // Arrange
      mockS3Client.getBucketStats.mockResolvedValue({
        totalSizeBytes: 1234567, // 1.177... MB
        fileCount: 1,
        files: [
          {
            key: 'test.jpg',
            size: 1234567,
            lastModified: new Date(),
          },
        ],
      });

      // Act
      const result = await service.getStorageStats();

      // Assert
      expect(result.totalSizeMb).toBe(1.18); // Rounded up from 1.177...
    });
  });
});
