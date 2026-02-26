import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DiscordWebhookPayload } from '@/external/discord/discord.types';

@Injectable()
export class SchedulerAlertService {
  private readonly logger = new Logger(SchedulerAlertService.name);
  private readonly webhookUrl: string | null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const schedulerUrl = this.configService.get<string>(
      'DISCORD_SCHEDULER_WEBHOOK_URL',
    );
    const bugReportUrl = this.configService.get<string>(
      'DISCORD_BUG_REPORT_WEBHOOK_URL',
    );

    if (!schedulerUrl && bugReportUrl) {
      this.logger.warn(
        'DISCORD_SCHEDULER_WEBHOOK_URL 미설정. DISCORD_BUG_REPORT_WEBHOOK_URL로 대체합니다.',
      );
    }

    this.webhookUrl = schedulerUrl ?? bugReportUrl ?? null;
  }

  async alertFailure(schedulerName: string, error: Error): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    const payload: DiscordWebhookPayload = {
      embeds: [
        {
          title: `⚠️ 스케줄러 실패: ${schedulerName}`,
          description: error.message,
          color: 0xff0000,
          fields: [
            {
              name: 'Stack Trace',
              value: (error.stack ?? '').slice(0, 1000) || 'N/A',
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await firstValueFrom(this.httpService.post(this.webhookUrl, payload));
    } catch (sendError) {
      this.logger.error(
        `스케줄러 실패 알림 전송 실패 (무시됨): ${sendError instanceof Error ? sendError.message : 'Unknown'}`,
      );
    }
  }
}
