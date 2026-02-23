import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BatchJobService } from '../batch-job.service';
import { BatchJob } from '../../entities/batch-job.entity';
import {
  BatchJobStatus,
  BatchJobType,
} from '../../types/preference-batch.types';
import { createMockRepository } from '../../../../test/mocks/repository.mock';

describe('BatchJobService', () => {
  let service: BatchJobService;
  let batchJobRepository: ReturnType<typeof createMockRepository<BatchJob>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    batchJobRepository = createMockRepository<BatchJob>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchJobService,
        {
          provide: getRepositoryToken(BatchJob),
          useValue: batchJobRepository,
        },
      ],
    }).compile();

    service = module.get<BatchJobService>(BatchJobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new batch job with PENDING status', async () => {
      const mockBatchJob: Partial<BatchJob> = {
        id: 1,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 100,
        completedRequests: 0,
        failedRequests: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      batchJobRepository.create.mockReturnValue(mockBatchJob as BatchJob);
      batchJobRepository.save.mockResolvedValue(mockBatchJob as BatchJob);

      const result = await service.create(
        BatchJobType.PREFERENCE_ANALYSIS,
        100,
      );

      expect(batchJobRepository.create).toHaveBeenCalledWith({
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 100,
      });
      expect(batchJobRepository.save).toHaveBeenCalledWith(mockBatchJob);
      expect(result).toEqual(mockBatchJob);
    });

    it('should log batch job creation', async () => {
      const mockBatchJob: Partial<BatchJob> = {
        id: 1,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 50,
      };

      batchJobRepository.create.mockReturnValue(mockBatchJob as BatchJob);
      batchJobRepository.save.mockResolvedValue(mockBatchJob as BatchJob);

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.create(BatchJobType.PREFERENCE_ANALYSIS, 50);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Created batch job: 1 (type=PREFERENCE_ANALYSIS, total=50)',
      );

      loggerLogSpy.mockRestore();
    });

    it('should handle repository errors during create', async () => {
      batchJobRepository.create.mockReturnValue({} as BatchJob);
      batchJobRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        service.create(BatchJobType.PREFERENCE_ANALYSIS, 100),
      ).rejects.toThrow('Database error');
    });

    it('should create batch job with totalRequests set to zero', async () => {
      const mockBatchJob: Partial<BatchJob> = {
        id: 2,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 0,
      };

      batchJobRepository.create.mockReturnValue(mockBatchJob as BatchJob);
      batchJobRepository.save.mockResolvedValue(mockBatchJob as BatchJob);

      const result = await service.create(BatchJobType.PREFERENCE_ANALYSIS, 0);

      expect(result.totalRequests).toBe(0);
    });

    it('should create batch job with large totalRequests', async () => {
      const mockBatchJob: Partial<BatchJob> = {
        id: 3,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 10000,
      };

      batchJobRepository.create.mockReturnValue(mockBatchJob as BatchJob);
      batchJobRepository.save.mockResolvedValue(mockBatchJob as BatchJob);

      const result = await service.create(
        BatchJobType.PREFERENCE_ANALYSIS,
        10000,
      );

      expect(result.totalRequests).toBe(10000);
    });
  });

  describe('updateStatus', () => {
    it('should update batch job status only', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await service.updateStatus(1, BatchJobStatus.SUBMITTED);

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.SUBMITTED,
      });
    });

    it('should update status with extra fields', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      const submittedAt = new Date();
      await service.updateStatus(1, BatchJobStatus.SUBMITTED, {
        openAiBatchId: 'batch_123',
        inputFileId: 'file_456',
        submittedAt,
      });

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.SUBMITTED,
        openAiBatchId: 'batch_123',
        inputFileId: 'file_456',
        submittedAt,
      });
    });

    it('should log status update', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateStatus(1, BatchJobStatus.PROCESSING);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Updated batch job 1 to status: PROCESSING',
      );

      loggerLogSpy.mockRestore();
    });

    it('should update to COMPLETED status with completedAt', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      const completedAt = new Date();
      await service.updateStatus(1, BatchJobStatus.COMPLETED, {
        completedAt,
        outputFileId: 'file_output_123',
        completedRequests: 100,
      });

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.COMPLETED,
        completedAt,
        outputFileId: 'file_output_123',
        completedRequests: 100,
      });
    });

    it('should update to FAILED status with errorMessage', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await service.updateStatus(1, BatchJobStatus.FAILED, {
        errorMessage: 'OpenAI batch processing failed',
      });

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.FAILED,
        errorMessage: 'OpenAI batch processing failed',
      });
    });

    it('should update completedRequests and failedRequests', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await service.updateStatus(1, BatchJobStatus.PROCESSING, {
        completedRequests: 50,
        failedRequests: 5,
      });

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.PROCESSING,
        completedRequests: 50,
        failedRequests: 5,
      });
    });

    it('should update errorFileId when provided', async () => {
      batchJobRepository.update.mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await service.updateStatus(1, BatchJobStatus.FAILED, {
        errorFileId: 'file_error_789',
      });

      expect(batchJobRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.FAILED,
        errorFileId: 'file_error_789',
      });
    });

    it('should handle repository errors during update', async () => {
      batchJobRepository.update.mockRejectedValue(new Error('Update failed'));

      await expect(
        service.updateStatus(1, BatchJobStatus.PROCESSING),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('findIncomplete', () => {
    it('should find batch jobs with SUBMITTED status', async () => {
      const mockJobs: Partial<BatchJob>[] = [
        {
          id: 1,
          status: BatchJobStatus.SUBMITTED,
          type: BatchJobType.PREFERENCE_ANALYSIS,
          createdAt: new Date('2026-02-15T10:00:00Z'),
        },
      ];

      batchJobRepository.find.mockResolvedValue(mockJobs as BatchJob[]);

      const result = await service.findIncomplete();

      expect(batchJobRepository.find).toHaveBeenCalledWith({
        where: {
          status: expect.anything(),
        },
        order: { createdAt: 'ASC' },
      });
      expect(result).toEqual(mockJobs);
    });

    it('should find batch jobs with PROCESSING status', async () => {
      const mockJobs: Partial<BatchJob>[] = [
        {
          id: 2,
          status: BatchJobStatus.PROCESSING,
          type: BatchJobType.PREFERENCE_ANALYSIS,
          createdAt: new Date('2026-02-15T11:00:00Z'),
        },
      ];

      batchJobRepository.find.mockResolvedValue(mockJobs as BatchJob[]);

      const result = await service.findIncomplete();

      expect(result).toEqual(mockJobs);
    });

    it('should return empty array when no incomplete jobs exist', async () => {
      batchJobRepository.find.mockResolvedValue([]);

      const result = await service.findIncomplete();

      expect(result).toEqual([]);
    });

    it('should order results by createdAt ASC', async () => {
      batchJobRepository.find.mockResolvedValue([]);

      await service.findIncomplete();

      expect(batchJobRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('should return multiple incomplete jobs', async () => {
      const mockJobs: Partial<BatchJob>[] = [
        {
          id: 1,
          status: BatchJobStatus.SUBMITTED,
          createdAt: new Date('2026-02-15T10:00:00Z'),
        },
        {
          id: 2,
          status: BatchJobStatus.PROCESSING,
          createdAt: new Date('2026-02-15T11:00:00Z'),
        },
        {
          id: 3,
          status: BatchJobStatus.SUBMITTED,
          createdAt: new Date('2026-02-15T12:00:00Z'),
        },
      ];

      batchJobRepository.find.mockResolvedValue(mockJobs as BatchJob[]);

      const result = await service.findIncomplete();

      expect(result).toHaveLength(3);
    });

    it('should handle repository errors gracefully', async () => {
      batchJobRepository.find.mockRejectedValue(new Error('Database error'));

      await expect(service.findIncomplete()).rejects.toThrow('Database error');
    });
  });

  describe('findById', () => {
    it('should find batch job by ID when it exists', async () => {
      const mockJob: Partial<BatchJob> = {
        id: 1,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.COMPLETED,
        totalRequests: 100,
      };

      batchJobRepository.findOne.mockResolvedValue(mockJob as BatchJob);

      const result = await service.findById(1);

      expect(batchJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockJob);
    });

    it('should return null when batch job does not exist', async () => {
      batchJobRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });

    it('should handle repository errors during findById', async () => {
      batchJobRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findById(1)).rejects.toThrow('Database error');
    });
  });

  describe('findByOpenAiBatchId', () => {
    it('should find batch job by OpenAI batch ID when it exists', async () => {
      const mockJob: Partial<BatchJob> = {
        id: 1,
        openAiBatchId: 'batch_abc123',
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.SUBMITTED,
      };

      batchJobRepository.findOne.mockResolvedValue(mockJob as BatchJob);

      const result = await service.findByOpenAiBatchId('batch_abc123');

      expect(batchJobRepository.findOne).toHaveBeenCalledWith({
        where: { openAiBatchId: 'batch_abc123' },
      });
      expect(result).toEqual(mockJob);
    });

    it('should return null when OpenAI batch ID does not exist', async () => {
      batchJobRepository.findOne.mockResolvedValue(null);

      const result = await service.findByOpenAiBatchId('batch_nonexistent');

      expect(result).toBeNull();
    });

    it('should handle repository errors during findByOpenAiBatchId', async () => {
      batchJobRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findByOpenAiBatchId('batch_abc123')).rejects.toThrow(
        'Database error',
      );
    });

    it('should find job with different batch ID formats', async () => {
      const mockJob: Partial<BatchJob> = {
        id: 2,
        openAiBatchId: 'batch_xyz789_v2',
        status: BatchJobStatus.PROCESSING,
      };

      batchJobRepository.findOne.mockResolvedValue(mockJob as BatchJob);

      const result = await service.findByOpenAiBatchId('batch_xyz789_v2');

      expect(result).toEqual(mockJob);
    });
  });

  describe('findRecent', () => {
    it('should find recent 10 batch jobs by default', async () => {
      const mockJobs: Partial<BatchJob>[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: i + 1,
          type: BatchJobType.PREFERENCE_ANALYSIS,
          status: BatchJobStatus.COMPLETED,
          createdAt: new Date(`2026-02-${15 - i}T10:00:00Z`),
        }),
      );

      batchJobRepository.find.mockResolvedValue(mockJobs as BatchJob[]);

      const result = await service.findRecent();

      expect(batchJobRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 10,
      });
      expect(result).toEqual(mockJobs);
    });

    it('should find recent batch jobs with custom limit', async () => {
      const mockJobs: Partial<BatchJob>[] = Array.from(
        { length: 5 },
        (_, i) => ({
          id: i + 1,
          status: BatchJobStatus.COMPLETED,
        }),
      );

      batchJobRepository.find.mockResolvedValue(mockJobs as BatchJob[]);

      const result = await service.findRecent(5);

      expect(batchJobRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 5,
      });
      expect(result).toHaveLength(5);
    });

    it('should return empty array when no batch jobs exist', async () => {
      batchJobRepository.find.mockResolvedValue([]);

      const result = await service.findRecent();

      expect(result).toEqual([]);
    });

    it('should order results by createdAt DESC', async () => {
      batchJobRepository.find.mockResolvedValue([]);

      await service.findRecent(20);

      expect(batchJobRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('should handle limit of 1', async () => {
      const mockJob: Partial<BatchJob> = {
        id: 1,
        status: BatchJobStatus.COMPLETED,
      };

      batchJobRepository.find.mockResolvedValue([mockJob] as BatchJob[]);

      const result = await service.findRecent(1);

      expect(batchJobRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 1,
      });
      expect(result).toHaveLength(1);
    });

    it('should handle large limit values', async () => {
      batchJobRepository.find.mockResolvedValue([]);

      await service.findRecent(1000);

      expect(batchJobRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 1000,
      });
    });

    it('should handle repository errors during findRecent', async () => {
      batchJobRepository.find.mockRejectedValue(new Error('Database error'));

      await expect(service.findRecent()).rejects.toThrow('Database error');
    });
  });
});
