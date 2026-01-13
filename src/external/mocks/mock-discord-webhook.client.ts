import { Injectable, Logger } from '@nestjs/common';
import { DiscordWebhookPayload } from '../discord/discord.types';

/**
 * Discord Webhook Mock 클라이언트
 * E2E 테스트 시 실제 Discord 알림 대신 사용
 */
@Injectable()
export class MockDiscordWebhookClient {
  private readonly logger = new Logger(MockDiscordWebhookClient.name);

  async sendMessage(payload: DiscordWebhookPayload): Promise<void> {
    this.logger.log(
      `[MOCK] Discord sendMessage: content="${payload.content?.substring(0, 50) ?? 'embed only'}..."`,
    );
    // 아무것도 하지 않음 (void)
  }
}
