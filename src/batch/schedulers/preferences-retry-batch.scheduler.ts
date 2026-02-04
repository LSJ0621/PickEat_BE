import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreferenceBatchService } from '../services/preference-batch.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { BatchJobStatus } from '../types/preference-batch.types';

@Injectable()
export class PreferencesRetryBatchScheduler {
  private readonly logger = new Logger(PreferencesRetryBatchScheduler.name);

  constructor(
    private readonly preferenceBatchService: PreferenceBatchService,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
  ) {}

  /**
   * Weekly retry batch submission every Wednesday at 18:00 KST
   * Collects failed selections and expired batch items for reprocessing
   */
  @Cron('0 18 * * 3', { timeZone: 'Asia/Seoul' })
  async submitRetryBatch(): Promise<void> {
    this.logger.log(
      '🔄 [재시도 배치 스케줄러] 시작 - 매주 수요일 18시 실패 건 재처리',
    );

    try {
      // First, handle expired BATCH_PROCESSING items
      await this.handleExpiredBatchProcessingItems();

      // Then submit retry batch for failed items
      const batchJob = await this.preferenceBatchService.submitRetryBatch();

      if (batchJob) {
        this.logger.log(
          `✅ [재시도 배치 제출 완료] BatchJob ID: ${batchJob.id}, ` +
            `총 요청: ${batchJob.totalRequests}건`,
        );
      } else {
        this.logger.log('ℹ️ [재시도 배치] 처리할 실패 건이 없습니다.');
      }
    } catch (error) {
      this.logger.error(
        `❌ [재시도 배치 실패] ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handle BATCH_PROCESSING items that are stuck (expired batches)
   * These items need to be moved back to FAILED status for retry
   */
  private async handleExpiredBatchProcessingItems(): Promise<void> {
    // Find items that have been in BATCH_PROCESSING for more than 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const expiredItems = await this.menuSelectionRepository
      .createQueryBuilder('selection')
      .leftJoinAndSelect('selection.batchJob', 'batchJob')
      .where('selection.status = :status', {
        status: MenuSelectionStatus.BATCH_PROCESSING,
      })
      .andWhere('selection.updatedAt < :expiredTime', {
        expiredTime: twentyFourHoursAgo,
      })
      .getMany();

    if (expiredItems.length === 0) {
      return;
    }

    this.logger.log(
      `📋 [만료된 BATCH_PROCESSING 처리] ${expiredItems.length}건 발견`,
    );

    // Check if their batch jobs are failed/expired/completed
    const itemsToReset: number[] = [];

    for (const item of expiredItems) {
      // Reset selections if:
      // - No batch job reference (orphaned)
      // - Batch failed/expired (obvious retry candidates)
      // - Batch completed but selection still in BATCH_PROCESSING (processing failure)
      const shouldReset =
        !item.batchJob ||
        item.batchJob.status === BatchJobStatus.FAILED ||
        item.batchJob.status === BatchJobStatus.EXPIRED ||
        item.batchJob.status === BatchJobStatus.COMPLETED;

      if (shouldReset) {
        itemsToReset.push(item.id);
      }
    }

    if (itemsToReset.length > 0) {
      await this.menuSelectionRepository.update(itemsToReset, {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });

      this.logger.log(
        `✅ [만료된 BATCH_PROCESSING 처리] ${itemsToReset.length}건을 FAILED로 변경`,
      );
    }
  }
}
