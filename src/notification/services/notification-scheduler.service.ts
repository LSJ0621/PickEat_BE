import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { DataSource } from 'typeorm';
import { SCHEDULER_LOCKS } from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';
import { NotificationService } from '../notification.service';

@Injectable()
export class NotificationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
    private readonly schedulerAlertService: SchedulerAlertService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const cronExpression = this.configService.get<string>(
      'CRON_NOTIFICATION_PUBLISH',
      '* * * * *',
    );

    const job = new CronJob(
      cronExpression,
      () => void this.publishScheduledNotifications(),
      null,
      false,
      'Asia/Seoul',
    );

    this.schedulerRegistry.addCronJob('notification-publish', job);
    job.start();

    this.logger.log(`[알림 발행 스케줄러] 등록 완료 - cron: ${cronExpression}`);
  }

  /**
   * 매 분마다 예약된 공지사항을 발행합니다.
   * SCHEDULED 상태이고 scheduledAt이 현재 시간 이하인 공지사항을 PUBLISHED로 변경
   */
  async publishScheduledNotifications(): Promise<void> {
    const { acquired } = await withAdvisoryLock(
      this.dataSource,
      SCHEDULER_LOCKS.NOTIFICATION_PUBLISH,
      async () => {
        try {
          const publishedCount =
            await this.notificationService.publishScheduledNotifications();

          if (publishedCount > 0) {
            this.logger.log(`예약 공지사항 발행 완료: ${publishedCount}개`);
          }

          return { success: true };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `예약 공지사항 발행 실패: ${err.message}`,
            err.stack,
          );
          await this.schedulerAlertService.alertFailure(
            '공지사항 발행 스케줄러',
            err,
          );
          return { success: false };
        }
      },
    );

    if (!acquired) {
      this.logger.warn(
        '⚠️ [공지사항 발행 스케줄러] 다른 인스턴스에서 이미 실행 중입니다.',
      );
    }
  }
}
