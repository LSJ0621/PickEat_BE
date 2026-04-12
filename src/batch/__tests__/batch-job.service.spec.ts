import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BatchJobService } from '../services/batch-job.service';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobStatus, BatchJobType } from '../types/preference-batch.types';
import { createMockRepository } from '../../../test/mocks/repository.mock';

describe('BatchJobService', () => {
  let service: BatchJobService;
  let mockRepository: ReturnType<typeof createMockRepository<BatchJob>>;

  beforeEach(async () => {
    mockRepository = createMockRepository<BatchJob>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchJobService,
        { provide: getRepositoryToken(BatchJob), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<BatchJobService>(BatchJobService);
  });

  describe('create', () => {
    it('PENDING 상태의 새 배치 작업을 생성한다', async () => {
      const mockJob = {
        id: 1,
        type: BatchJobType.PREFERENCE_ANALYSIS,
        status: BatchJobStatus.PENDING,
        totalRequests: 5,
      } as BatchJob;

      mockRepository.create.mockReturnValue(mockJob);
      mockRepository.save.mockResolvedValue(mockJob);

      const result = await service.create(BatchJobType.PREFERENCE_ANALYSIS, 5);

      expect(result.id).toBe(1);
      expect(result.status).toBe(BatchJobStatus.PENDING);
      expect(result.totalRequests).toBe(5);
    });
  });

  describe('updateStatus', () => {
    it('배치 작업 상태를 업데이트한다', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.updateStatus(1, BatchJobStatus.SUBMITTED, {
        openAiBatchId: 'batch_123',
      });

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        status: BatchJobStatus.SUBMITTED,
        openAiBatchId: 'batch_123',
      });
    });
  });

  describe('findIncomplete', () => {
    it('SUBMITTED 또는 PROCESSING 상태의 작업만 반환한다', async () => {
      const jobs = [
        { id: 1, status: BatchJobStatus.SUBMITTED },
        { id: 2, status: BatchJobStatus.PROCESSING },
      ] as BatchJob[];
      mockRepository.find.mockResolvedValue(jobs);

      const result = await service.findIncomplete();

      expect(result).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('ID로 배치 작업을 조회한다', async () => {
      const job = { id: 1, status: BatchJobStatus.COMPLETED } as BatchJob;
      mockRepository.findOne.mockResolvedValue(job);

      const result = await service.findById(1);

      expect(result?.id).toBe(1);
    });

    it('존재하지 않는 ID이면 null을 반환한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByOpenAiBatchId', () => {
    it('OpenAI Batch ID로 작업을 조회한다', async () => {
      const job = { id: 1, openAiBatchId: 'batch_123' } as BatchJob;
      mockRepository.findOne.mockResolvedValue(job);

      const result = await service.findByOpenAiBatchId('batch_123');

      expect(result?.openAiBatchId).toBe('batch_123');
    });
  });

  describe('findRecent', () => {
    it('최근 배치 작업 목록을 반환한다', async () => {
      const jobs = [{ id: 2 }, { id: 1 }] as BatchJob[];
      mockRepository.find.mockResolvedValue(jobs);

      const result = await service.findRecent(2);

      expect(result).toHaveLength(2);
    });
  });
});
