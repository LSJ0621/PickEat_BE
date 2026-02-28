import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DiscordWebhookPayload } from '../discord.types';

@Injectable()
export class DiscordWebhookClient {
  private readonly logger = new Logger(DiscordWebhookClient.name);
  private readonly webhookUrl: string | null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.webhookUrl =
      this.configService.get<string>('DISCORD_BUG_REPORT_WEBHOOK_URL') ?? null;

    if (!this.webhookUrl) {
      this.logger.warn(
        'DISCORD_BUG_REPORT_WEBHOOK_URL 환경변수가 설정되지 않았습니다. Discord 알림이 비활성화됩니다.',
      );
    }
  }

  /**
   * Discord Webhook으로 메시지 전송
   * Discord는 부가 기능이므로 실패 시 에러를 throw하지 않고 로깅만 수행
   */
  async sendMessage(payload: DiscordWebhookPayload): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug(
        'Discord webhook URL이 설정되지 않아 메시지 전송을 건너뜁니다.',
      );
      return;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.webhookUrl, payload),
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.debug('Discord webhook 메시지 전송 성공');
      } else {
        this.logger.warn(`Discord webhook 응답 상태 코드: ${response.status}`);
      }
    } catch (error) {
      // Discord 전송 실패는 조용히 처리 (silent fail)
      // 부가 기능이므로 메인 작업(버그 리포트 등록)에 영향을 주지 않도록 함
      this.logger.error(
        `Discord webhook 전송 실패 (무시됨): ${error.message}`,
        error.stack,
      );
      // throw 제거 - 에러를 상위로 전파하지 않음
    }
  }
}
