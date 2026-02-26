import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { DataSource } from 'typeorm';
import { SCHEDULER_LOCKS } from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';
import { PreferenceBatchService } from '../services/preference-batch.service';

@Injectable()
export class PreferencesBatchScheduler implements OnModuleInit {
  private readonly logger = new Logger(PreferencesBatchScheduler.name);

  constructor(
    private readonly preferenceBatchService: PreferenceBatchService,
    private readonly dataSource: DataSource,
    private readonly schedulerAlertService: SchedulerAlertService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const cronExpression = this.configService.get<string>(
      'CRON_PREFERENCES_BATCH_SUBMIT',
      '03 17 * * *',
    );

    const job = new CronJob(
      cronExpression,
      () => void this.submitDailyBatch(),
      null,
      false,
      'Asia/Seoul',
    );

    this.schedulerRegistry.addCronJob('preferences-batch-submit', job);
    job.start();

    this.logger.log(`[배치 제출 스케줄러] 등록 완료 - cron: ${cronExpression}`);
  }

  /**
   * Daily batch submission at 14:35 KST
   * Collects all PENDING selections and submits them to OpenAI Batch API
   */
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
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`[배치 제출 실패] ${err.message}`);
          await this.schedulerAlertService.alertFailure(
            '취향 배치 제출 스케줄러',
            err,
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
