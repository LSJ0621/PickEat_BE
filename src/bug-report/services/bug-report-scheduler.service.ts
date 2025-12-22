import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';
import { BugReport } from '../entities/bug-report.entity';
import { BugReportStatus } from '../enum/bug-report-status.enum';
import { determineThreshold } from '../utils/threshold.util';
import { BugReportNotificationService } from './bug-report-notification.service';
import { DiscordMessageBuilderService } from './discord-message-builder.service';

@Injectable()
export class BugReportSchedulerService {
  private readonly logger = new Logger(BugReportSchedulerService.name);

  constructor(
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
    private readonly discordWebhookClient: DiscordWebhookClient,
    private readonly notificationService: BugReportNotificationService,
    private readonly messageBuilder: DiscordMessageBuilderService,
  ) {}

  /**
   * 5분마다 미확인 버그 제보 개수를 체크하고, 임계값 도달 시 Discord 알림 전송
   * - 중복 알림 방지: 임계값(10, 20, 30, 50, 100)이 상승할 때만 전송
   * - 향상된 메시지: 증가량, 최근 버그 리스트 포함
   */
  @Interval(300000) // 5분 = 300000ms
  async checkAndNotifyUnconfirmedCount(): Promise<void> {
    try {
      // 1. 현재 미확인 개수 조회
      const currentCount = await this.bugReportRepository.count({
        where: { status: BugReportStatus.UNCONFIRMED },
      });

      // 2. 알림 전송 여부 판단
      const { should, lastThreshold } =
        await this.notificationService.shouldSendNotification(currentCount);

      if (!should) {
        return; // 알림 불필요
      }

      // 3. 최근 버그 조회 (최대 5개)
      const recentBugs = await this.bugReportRepository.find({
        where: { status: BugReportStatus.UNCONFIRMED },
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT,
      });

      // 4. Discord 메시지 생성 및 전송
      const currentThreshold = determineThreshold(currentCount);

      // should가 true이면 currentThreshold는 null이 아님 (10개 이상 보장)
      if (currentThreshold === null) {
        this.logger.warn('알림 전송 조건을 만족했지만 임계값을 계산할 수 없음');
        return;
      }

      const embed = this.messageBuilder.buildThresholdAlertEmbed({
        currentCount,
        lastThreshold,
        threshold: currentThreshold,
        recentBugs,
      });

      await this.discordWebhookClient.sendMessage({ embeds: [embed] });

      // 5. 알림 기록 저장
      await this.notificationService.recordNotification(
        currentCount,
        currentThreshold,
      );

      this.logger.log(
        `버그 제보 알림 전송 완료 (임계값: ${currentThreshold}, 개수: ${currentCount})`,
      );
    } catch (error) {
      // Discord 알림 실패는 로깅만 하고 스케줄러는 계속 실행되도록 함
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`버그 제보 알림 전송 실패: ${err.message}`, err.stack);
    }
  }
}
