import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscordWebhookClient } from '../../external/discord/clients/discord-webhook.client';
import { DISCORD_WEBHOOK_CONFIG } from '../../external/discord/discord.constants';
import { BugReport } from '../entities/bug-report.entity';
import { BugReportStatus } from '../enum/bug-report-status.enum';

@Injectable()
export class BugReportSchedulerService {
  private readonly logger = new Logger(BugReportSchedulerService.name);

  constructor(
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
    private readonly discordWebhookClient: DiscordWebhookClient,
  ) {}

  /**
   * 5분마다 미확인 버그 제보 개수를 체크하고, 10개 이상이면 Discord 알림 전송
   */
  @Interval(300000) // 5분 = 300000ms
  async checkAndNotifyUnconfirmedCount(): Promise<void> {
    try {
      const unconfirmedCount = await this.bugReportRepository.count({
        where: { status: BugReportStatus.UNCONFIRMED },
      });

      // 10개 이상이면 알림 전송
      if (unconfirmedCount >= 10) {
        await this.discordWebhookClient.sendMessage({
          embeds: [
            {
              title: '🚨 미확인 버그 제보 알림',
              description: `미확인 버그 제보가 **${unconfirmedCount}개**에 도달했습니다.`,
              color: DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR,
              fields: [
                {
                  name: '현재 미확인 개수',
                  value: `${unconfirmedCount}개`,
                  inline: true,
                },
                {
                  name: '권장 조치',
                  value: '관리자 페이지에서 확인해주세요.',
                  inline: false,
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        });

        this.logger.log(
          `미확인 버그 제보 알림 전송 완료 (개수: ${unconfirmedCount})`,
        );
      }
    } catch (error) {
      // Discord 알림 실패는 로깅만 하고 스케줄러는 계속 실행되도록 함
      this.logger.error(
        `미확인 버그 제보 알림 전송 실패: ${error.message}`,
        error.stack,
      );
    }
  }
}

