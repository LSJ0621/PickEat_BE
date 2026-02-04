import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobStatus, BatchJobType } from '../types/preference-batch.types';

@Injectable()
export class BatchJobService {
  private readonly logger = new Logger(BatchJobService.name);

  constructor(
    @InjectRepository(BatchJob)
    private readonly batchJobRepository: Repository<BatchJob>,
  ) {}

  /**
   * Create a new batch job
   */
  async create(type: BatchJobType, totalRequests: number): Promise<BatchJob> {
    const batchJob = this.batchJobRepository.create({
      type,
      status: BatchJobStatus.PENDING,
      totalRequests,
    });

    const saved = await this.batchJobRepository.save(batchJob);
    this.logger.log(
      `Created batch job: ${saved.id} (type=${type}, total=${totalRequests})`,
    );
    return saved;
  }

  /**
   * Update batch job status and additional fields
   */
  async updateStatus(
    id: number,
    status: BatchJobStatus,
    extra?: Partial<
      Pick<
        BatchJob,
        | 'openAiBatchId'
        | 'inputFileId'
        | 'outputFileId'
        | 'errorFileId'
        | 'completedRequests'
        | 'failedRequests'
        | 'submittedAt'
        | 'completedAt'
        | 'errorMessage'
      >
    >,
  ): Promise<void> {
    await this.batchJobRepository.update(id, {
      status,
      ...extra,
    });
    this.logger.log(`Updated batch job ${id} to status: ${status}`);
  }

  /**
   * Find incomplete batch jobs for polling
   * Returns jobs that are SUBMITTED or PROCESSING (waiting for OpenAI results)
   */
  async findIncomplete(): Promise<BatchJob[]> {
    return this.batchJobRepository.find({
      where: {
        status: In([BatchJobStatus.SUBMITTED, BatchJobStatus.PROCESSING]),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Find a batch job by ID
   */
  async findById(id: number): Promise<BatchJob | null> {
    return this.batchJobRepository.findOne({ where: { id } });
  }

  /**
   * Find a batch job by OpenAI batch ID
   */
  async findByOpenAiBatchId(openAiBatchId: string): Promise<BatchJob | null> {
    return this.batchJobRepository.findOne({ where: { openAiBatchId } });
  }

  /**
   * Get recent batch jobs for monitoring
   */
  async findRecent(limit: number = 10): Promise<BatchJob[]> {
    return this.batchJobRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
