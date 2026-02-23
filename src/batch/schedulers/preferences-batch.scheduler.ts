import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SCHEDULER_LOCKS } from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { PreferenceBatchService } from '../services/preference-batch.service';

@Injectable()
export class PreferencesBatchScheduler {
  private readonly logger = new Logger(PreferencesBatchScheduler.name);

  constructor(
    private readonly preferenceBatchService: PreferenceBatchService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Daily batch submission at 14:35 KST
   * Collects all PENDING selections and submits them to OpenAI Batch API
   */
  @Cron('03 17 * * *', { timeZone: 'Asia/Seoul' })
  async submitDailyBatch(): Promise<void> {
    this.logger.log('[배치 제출 스케줄러] 시작 - 매일 14시 35분 일괄 처리');

    const { acquired } = await withAdvisoryLock(
      this.dataSource,
      SCHEDULER_LOCKS.PREFERENCES_BATCH,
      async () => {
        try {
          const batchJob = await this.preferenceBatchService.submitBatch();

          if (batchJob) {
            this.logger.log(
              `[배치 제출 완료] BatchJob ID: ${batchJob.id}, ` +
                `총 요청: ${batchJob.totalRequests}건, ` +
                `OpenAI Batch ID: ${batchJob.openAiBatchId}`,
            );
          } else {
            this.logger.log('[배치 제출] 처리할 PENDING 건이 없습니다.');
          }

          return { success: true };
        } catch (error) {
          this.logger.error(
            `[배치 제출 실패] ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          return { success: false };
        }
      },
    );

    if (!acquired) {
      this.logger.warn(
        '⚠️ [배치 제출 스케줄러] 다른 인스턴스에서 이미 실행 중입니다.',
      );
    }
  }
}
