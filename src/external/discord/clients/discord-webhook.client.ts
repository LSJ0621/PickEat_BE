import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { DiscordWebhookPayload } from '../discord.types';

@Injectable()
export class DiscordWebhookClient {
  private readonly logger = new Logger(DiscordWebhookClient.name);
  private readonly webhookUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.webhookUrl = this.configService.getOrThrow<string>(
      'DISCORD_BUG_REPORT_WEBHOOK_URL',
    );
  }

  /**
   * Discord Webhook으로 메시지 전송
   */
  async sendMessage(payload: DiscordWebhookPayload): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.webhookUrl, payload),
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.debug('Discord webhook 메시지 전송 성공');
      } else {
        this.logger.warn(
          `Discord webhook 응답 상태 코드: ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Discord webhook 전송 실패: ${error.message}`,
        error.stack,
      );
      throw new ExternalApiException(
        'Discord',
        error as Error,
        'Discord webhook 전송 실패',
      );
    }
  }
}

