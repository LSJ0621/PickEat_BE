import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DiscordWebhookClient } from './clients/discord-webhook.client';

@Module({
  imports: [HttpModule],
  providers: [DiscordWebhookClient],
  exports: [DiscordWebhookClient],
})
export class DiscordModule {}
