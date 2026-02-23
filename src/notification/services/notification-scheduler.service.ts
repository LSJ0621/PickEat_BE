import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SCHEDULER_LOCKS } from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { NotificationService } from '../notification.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 매 분마다 예약된 공지사항을 발행합니다.
   * SCHEDULED 상태이고 scheduledAt이 현재 시간 이하인 공지사항을 PUBLISHED로 변경
   */
  @Cron(CronExpression.EVERY_MINUTE)
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
