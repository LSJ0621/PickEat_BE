import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PreferenceBatchService } from '../services/preference-batch.service';

@Injectable()
export class PreferencesBatchScheduler {
  private readonly logger = new Logger(PreferencesBatchScheduler.name);

  constructor(
    private readonly preferenceBatchService: PreferenceBatchService,
  ) {}

  /**
   * Daily batch submission at 14:35 KST
   * Collects all PENDING selections and submits them to OpenAI Batch API
   */
  @Cron('03 17 * * *', { timeZone: 'Asia/Seoul' })
  async submitDailyBatch(): Promise<void> {
    this.logger.log('🕐 [배치 제출 스케줄러] 시작 - 매일 14시 35분 일괄 처리');

    try {
      const batchJob = await this.preferenceBatchService.submitBatch();

      if (batchJob) {
        this.logger.log(
          `✅ [배치 제출 완료] BatchJob ID: ${batchJob.id}, ` +
            `총 요청: ${batchJob.totalRequests}건, ` +
            `OpenAI Batch ID: ${batchJob.openAiBatchId}`,
        );
      } else {
        this.logger.log('ℹ️ [배치 제출] 처리할 PENDING 건이 없습니다.');
      }
    } catch (error) {
      this.logger.error(
        `❌ [배치 제출 실패] ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
