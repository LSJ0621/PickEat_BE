/**
 * Discord Embed 필드
 */
export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * Discord Embed
 */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

/**
 * Discord Webhook Payload
 */
export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

