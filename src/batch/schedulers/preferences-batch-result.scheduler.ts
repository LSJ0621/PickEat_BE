import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  SCHEDULER_LOCKS,
  BATCH_CONFIG,
} from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { BatchJobService } from '../services/batch-job.service';
import { PreferenceBatchService } from '../services/preference-batch.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import {
  BatchJobStatus,
  OpenAiBatchStatus,
} from '../types/preference-batch.types';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { BatchJob } from '../entities/batch-job.entity';

@Injectable()
export class PreferencesBatchResultScheduler {
  private readonly logger = new Logger(PreferencesBatchResultScheduler.name);

  constructor(
    private readonly batchJobService: BatchJobService,
    private readonly preferenceBatchService: PreferenceBatchService,
    private readonly openAiBatchClient: OpenAiBatchClient,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Poll for batch results daily at 14:40 KST
   * This window covers the batch submission time (14:35) and typical 4-12 hour processing time
   */
  @Cron('5 17 * * *', { timeZone: 'Asia/Seoul' })
  async pollAndProcessResults(): Promise<void> {
    this.logger.log('[결과 폴링 스케줄러] 시작 - 매일 14시 40분');

    const { acquired, timedOut } = await withAdvisoryLock(
      this.dataSource,
      SCHEDULER_LOCKS.PREFERENCES_BATCH_RESULT,
      async () => {
        if (!this.openAiBatchClient.isReady()) {
          this.logger.warn('OpenAI Batch Client is not ready');
          return { success: false };
        }

        try {
          // Find incomplete batch jobs
          const incompleteBatches = await this.batchJobService.findIncomplete();

          if (incompleteBatches.length === 0) {
            this.logger.log('[폴링] 처리 대기 중인 배치가 없습니다.');
            return { success: true };
          }

          this.logger.log(
            `📋 [폴링] ${incompleteBatches.length}개의 배치 상태 확인 중...`,
          );

          for (const batchJob of incompleteBatches) {
            if (!batchJob.openAiBatchId) {
              this.logger.warn(
                `⚠️ BatchJob ${batchJob.id}에 OpenAI batch ID가 없습니다.`,
              );
              continue;
            }

            await this.processSingleBatch(batchJob.id, batchJob.openAiBatchId);
          }

          return { success: true };
        } catch (error) {
          this.logger.error(
            `❌ [폴링 실패] ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          return { success: false };
        }
      },
      { timeoutMs: BATCH_CONFIG.ADVISORY_LOCK_TIMEOUT_MS },
    );

    if (timedOut) {
      this.logger.error('Batch result polling timed out');
    }

    if (!acquired) {
      this.logger.warn(
        '⚠️ [결과 폴링 스케줄러] 다른 인스턴스에서 이미 실행 중입니다.',
      );
    }
  }

  /**
   * Process a single batch: check status, download results if complete
   */
  private async processSingleBatch(
    batchJobId: number,
    openAiBatchId: string,
  ): Promise<void> {
    try {
      const status = await this.openAiBatchClient.getBatchStatus(openAiBatchId);

      this.logger.log(
        `📊 [Batch ${batchJobId}] Status: ${status.status}, ` +
          `Progress: ${status.progress.completed}/${status.progress.total} ` +
          `(${status.progress.failed} failed)`,
      );

      // Update progress in our database
      await this.batchJobService.updateStatus(
        batchJobId,
        this.mapStatus(status.status),
        {
          completedRequests: status.progress.completed,
          failedRequests: status.progress.failed,
        },
      );

      // Handle completed batch
      if (status.status === 'completed') {
        await this.handleCompletedBatch(
          batchJobId,
          status.outputFileId,
          status.errorFileId,
        );
      }
      // Handle failed/expired batch
      else if (status.status === 'failed' || status.status === 'expired') {
        await this.handleFailedBatch(batchJobId, status.status);
      }
    } catch (error) {
      this.logger.error(
        `❌ [Batch ${batchJobId}] 상태 확인 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handle a completed batch: download and process results
   */
  private async handleCompletedBatch(
    batchJobId: number,
    outputFileId?: string,
    errorFileId?: string,
  ): Promise<void> {
    const batchJob = await this.batchJobService.findById(batchJobId);
    if (!batchJob) {
      this.logger.error(`BatchJob ${batchJobId} not found`);
      return;
    }

    // Download and process results
    if (outputFileId) {
      try {
        const { results, errors } =
          await this.openAiBatchClient.downloadResults(outputFileId);

        // Process download errors (null content, invalid status code, etc.)
        if (errors.length > 0) {
          this.logger.warn(
            `⚠️ [Batch ${batchJobId}] ${errors.length}건의 다운로드 에러 발견`,
          );
          await this.handleDownloadErrors(errors, batchJob);
        }

        // Process successful results
        await this.preferenceBatchService.processResults(results, batchJob);

        await this.batchJobService.updateStatus(
          batchJobId,
          BatchJobStatus.COMPLETED,
          {
            outputFileId,
            completedAt: new Date(),
          },
        );

        this.logger.log(
          `✅ [Batch ${batchJobId}] 결과 처리 완료 (성공: ${results.size}건, 에러: ${errors.length}건)`,
        );
      } catch (error) {
        this.logger.error(
          `❌ [Batch ${batchJobId}] 결과 처리 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );

        // Mark BatchJob as FAILED and reset associated Selections
        await this.handleBatchProcessingFailure(batchJobId, error);
      }
    }

    // Process errors if any
    if (errorFileId) {
      try {
        const errors = await this.openAiBatchClient.downloadErrors(errorFileId);
        await this.preferenceBatchService.processErrors(errors, batchJob);

        await this.batchJobService.updateStatus(
          batchJobId,
          BatchJobStatus.COMPLETED,
          {
            errorFileId,
          },
        );

        this.logger.log(
          `⚠️ [Batch ${batchJobId}] 에러 처리 완료 (${errors.length}건)`,
        );
      } catch (error) {
        this.logger.error(
          `❌ [Batch ${batchJobId}] 에러 처리 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );

        // Mark BatchJob as FAILED and reset associated Selections
        await this.handleBatchProcessingFailure(batchJobId, error);
      }
    }
  }

  /**
   * Handle download errors by marking associated Selections as FAILED
   */
  private async handleDownloadErrors(
    errors: Array<{ customId: string; reason: string }>,
    batchJob: BatchJob,
  ): Promise<void> {
    for (const error of errors) {
      // Convert BatchResultError to BatchError format for processErrors
      await this.preferenceBatchService.processErrors(
        [
          {
            customId: error.customId,
            code: error.reason,
            message: `Download error: ${error.reason}`,
          },
        ],
        batchJob,
      );
    }
  }

  /**
   * Handle batch processing failure by marking BatchJob as FAILED
   * and resetting associated Selections to FAILED state
   */
  private async handleBatchProcessingFailure(
    batchJobId: number,
    error: unknown,
  ): Promise<void> {
    try {
      // Update BatchJob to FAILED
      await this.batchJobService.updateStatus(
        batchJobId,
        BatchJobStatus.FAILED,
        {
          completedAt: new Date(),
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );

      // Reset associated Selections to FAILED
      await this.resetSelectionsByBatchJob(batchJobId);

      this.logger.log(
        `✅ [Batch ${batchJobId}] BatchJob 및 연관된 Selection들을 FAILED로 변경`,
      );
    } catch (resetError) {
      this.logger.error(
        `❌ [Batch ${batchJobId}] 실패 상태 업데이트 중 에러 발생: ${resetError instanceof Error ? resetError.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handle a failed or expired batch
   */
  private async handleFailedBatch(
    batchJobId: number,
    status: 'failed' | 'expired',
  ): Promise<void> {
    const newStatus =
      status === 'expired' ? BatchJobStatus.EXPIRED : BatchJobStatus.FAILED;

    await this.batchJobService.updateStatus(batchJobId, newStatus, {
      completedAt: new Date(),
      errorMessage: `OpenAI batch ${status}`,
    });

    this.logger.warn(
      `⚠️ [Batch ${batchJobId}] ${status.toUpperCase()} - 재시도 배치에서 처리됩니다.`,
    );
  }

  /**
   * Map OpenAI status to our BatchJobStatus
   */
  private mapStatus(openAiStatus: OpenAiBatchStatus): BatchJobStatus {
    switch (openAiStatus) {
      case 'validating':
      case 'in_progress':
      case 'finalizing':
        return BatchJobStatus.PROCESSING;
      case 'completed':
        return BatchJobStatus.COMPLETED;
      case 'failed':
        return BatchJobStatus.FAILED;
      case 'expired':
        return BatchJobStatus.EXPIRED;
      case 'cancelling':
      case 'cancelled':
        return BatchJobStatus.FAILED;
      default:
        return BatchJobStatus.PROCESSING;
    }
  }

  /**
   * Reset Selections associated with a BatchJob to FAILED state
   */
  private async resetSelectionsByBatchJob(batchJobId: number): Promise<void> {
    const selections = await this.menuSelectionRepository.find({
      where: {
        batchJobId,
        status: MenuSelectionStatus.BATCH_PROCESSING,
      },
    });

    if (selections.length === 0) {
      return;
    }

    const ids = selections.map((s) => s.id);
    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.FAILED,
      batchJobId: null,
    });

    this.logger.log(
      `✅ [BatchJob ${batchJobId}] ${selections.length}개의 Selection을 FAILED로 리셋`,
    );
  }
}
