import { Injectable, Logger } from '@nestjs/common';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobService } from './batch-job.service';
import { SelectionGroupingService } from './selection-grouping.service';
import { BatchRequestBuilderService } from './batch-request-builder.service';
import { PreferenceBatchResultProcessorService } from './preference-batch-result-processor.service';
import {
  BatchJobStatus,
  BatchJobType,
  BatchError,
} from '../types/preference-batch.types';
import { UserSelectionGroup } from '../interfaces/preference-batch.interface';

@Injectable()
export class PreferenceBatchService {
  private readonly logger = new Logger(PreferenceBatchService.name);

  constructor(
    private readonly selectionGroupingService: SelectionGroupingService,
    private readonly batchRequestBuilderService: BatchRequestBuilderService,
    private readonly resultProcessorService: PreferenceBatchResultProcessorService,
    private readonly batchJobService: BatchJobService,
    private readonly openAiBatchClient: OpenAiBatchClient,
  ) {}

  /**
   * Submit a batch job for preference analysis.
   * Returns the BatchJob if successful, null if no pending selections.
   */
  async submitBatch(model?: string): Promise<BatchJob | null> {
    return this.submitBatchInternal(
      {
        collectGroups: () =>
          this.selectionGroupingService.collectPendingSelections(),
        jobType: 'preference_analysis',
      },
      model,
    );
  }

  /**
   * Submit a retry batch for failed selections.
   */
  async submitRetryBatch(model?: string): Promise<BatchJob | null> {
    return this.submitBatchInternal(
      {
        collectGroups: () =>
          this.selectionGroupingService.collectFailedSelectionsForRetry(),
        jobType: 'preference_analysis_retry',
        beforeBuild: async (groups) => {
          await this.resultProcessorService.incrementRetryCount(
            groups.flatMap((g) => g.selections),
          );
        },
      },
      model,
    );
  }

  /**
   * Core batch submission logic shared by submitBatch and submitRetryBatch.
   */
  private async submitBatchInternal(
    options: {
      collectGroups: () => Promise<UserSelectionGroup[]>;
      jobType: 'preference_analysis' | 'preference_analysis_retry';
      beforeBuild?: (groups: UserSelectionGroup[]) => Promise<void>;
    },
    model?: string,
  ): Promise<BatchJob | null> {
    if (!this.openAiBatchClient.isReady()) {
      this.logger.error('OpenAI Batch Client is not ready');
      return null;
    }

    const groups = await options.collectGroups();
    if (groups.length === 0) {
      this.logger.log(
        options.jobType === 'preference_analysis'
          ? 'No pending selections to process'
          : 'No failed selections to retry',
      );
      return null;
    }

    if (options.beforeBuild) {
      await options.beforeBuild(groups);
    }

    const allSelections = groups.flatMap((g) => g.selections);

    const prefRequests =
      await this.batchRequestBuilderService.buildBatchRequests(groups);
    if (prefRequests.length === 0) {
      this.logger.log(
        'No valid batch requests (all selections have empty menus)',
      );
      await this.resultProcessorService.markSelectionsSucceeded(allSelections);
      return null;
    }

    const batchJob = await this.batchJobService.create(
      BatchJobType.PREFERENCE_ANALYSIS,
      prefRequests.length,
    );

    try {
      const openAiModel = model || OPENAI_CONFIG.DEFAULT_MODEL;
      const batchRequests =
        this.batchRequestBuilderService.buildOpenAiBatchRequests(
          prefRequests,
          openAiModel,
        );
      const jsonlContent =
        this.openAiBatchClient.createBatchContent(batchRequests);
      const inputFileId =
        await this.openAiBatchClient.uploadBatchContent(jsonlContent);
      const openAiBatchId = await this.openAiBatchClient.createBatch(
        inputFileId,
        {
          job_type: options.jobType,
          batch_job_id: batchJob.id.toString(),
        },
      );

      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.SUBMITTED,
        {
          openAiBatchId,
          inputFileId,
          submittedAt: new Date(),
        },
      );

      await this.resultProcessorService.markSelectionsBatchProcessing(
        allSelections,
        batchJob.id,
      );

      this.logger.log(
        `Submitted batch job ${batchJob.id} with ${prefRequests.length} requests (OpenAI batch: ${openAiBatchId})`,
      );

      return batchJob;
    } catch (error) {
      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.FAILED,
        {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );
      this.logger.error(
        `Failed to submit batch job ${batchJob.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Process results from a completed batch.
   * Delegates to PreferenceBatchResultProcessorService.
   */
  async processResults(
    results: Map<string, string>,
    batchJob: BatchJob,
  ): Promise<void> {
    return this.resultProcessorService.processResults(results, batchJob);
  }

  /**
   * Process errors from a batch.
   * Delegates to PreferenceBatchResultProcessorService.
   */
  async processErrors(errors: BatchError[], batchJob: BatchJob): Promise<void> {
    return this.resultProcessorService.processErrors(errors, batchJob);
  }
}
