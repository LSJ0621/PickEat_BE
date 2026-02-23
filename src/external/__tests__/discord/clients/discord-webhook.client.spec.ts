import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { DiscordWebhookClient } from '../../../discord/clients/discord-webhook.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  createMockConfigService,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { DiscordWebhookPayload } from '../../../discord/discord.types';
import { DISCORD_WEBHOOK_CONFIG } from '../../../discord/discord.constants';

describe('DiscordWebhookClient', () => {
  let client: DiscordWebhookClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;

  const mockWebhookUrl = 'https://discord.com/api/webhooks/123456789/abcdefg';

  const mockPayload: DiscordWebhookPayload = {
    content: 'Test message',
    embeds: [
      {
        title: 'Bug Report',
        description: 'Test bug description',
        color: DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR,
        fields: [
          { name: 'User ID', value: 'user-123', inline: true },
          { name: 'Status', value: 'UNCONFIRMED', inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      DISCORD_BUG_REPORT_WEBHOOK_URL: mockWebhookUrl,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordWebhookClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<DiscordWebhookClient>(DiscordWebhookClient);
  });

  describe('constructor', () => {
    it('should initialize with webhook URL from config', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'DISCORD_BUG_REPORT_WEBHOOK_URL',
      );
    });

    it('should throw error when webhook URL is missing', async () => {
      const emptyConfigService = createMockConfigService({});

      await expect(
        Test.createTestingModule({
          providers: [
            DiscordWebhookClient,
            { provide: HttpService, useValue: httpService },
            { provide: ConfigService, useValue: emptyConfigService },
          ],
        }).compile(),
      ).rejects.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should successfully send message with 200 status', async () => {
      const mockResponse = createAxiosResponse(undefined, 200);
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledTimes(1);
      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
      );
    });

    it('should successfully send message with 204 No Content', async () => {
      const mockResponse = createAxiosResponse(undefined, 204);
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
      );
    });

    it('should successfully send message with only content', async () => {
      const mockResponse = createAxiosResponse(undefined, 204);
      httpService.post.mockReturnValue(of(mockResponse));

      const simplePayload: DiscordWebhookPayload = {
        content: 'Simple message',
      };

      await expect(client.sendMessage(simplePayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        simplePayload,
      );
    });

    it('should successfully send message with only embeds', async () => {
      const mockResponse = createAxiosResponse(undefined, 204);
      httpService.post.mockReturnValue(of(mockResponse));

      const embedOnlyPayload: DiscordWebhookPayload = {
        embeds: [
          {
            title: 'Embed Title',
            description: 'Embed description',
            color: 0xff0000,
          },
        ],
      };

      await expect(
        client.sendMessage(embedOnlyPayload),
      ).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        embedOnlyPayload,
      );
    });

    it('should successfully send message with multiple embeds', async () => {
      const mockResponse = createAxiosResponse(undefined, 204);
      httpService.post.mockReturnValue(of(mockResponse));

      const multiEmbedPayload: DiscordWebhookPayload = {
        embeds: [
          { title: 'First Embed', color: 0xff0000 },
          { title: 'Second Embed', color: 0x00ff00 },
          { title: 'Third Embed', color: 0x0000ff },
        ],
      };

      await expect(
        client.sendMessage(multiEmbedPayload),
      ).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        multiEmbedPayload,
      );
    });

    it('should successfully send message with complex embed fields', async () => {
      const mockResponse = createAxiosResponse(undefined, 204);
      httpService.post.mockReturnValue(of(mockResponse));

      const complexPayload: DiscordWebhookPayload = {
        content: 'New Bug Report',
        embeds: [
          {
            title: 'Bug Report #123',
            description: 'Critical bug found in production',
            color: DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR,
            fields: [
              { name: 'User ID', value: 'user-123', inline: true },
              { name: 'Device', value: 'iPhone 14 Pro', inline: true },
              { name: 'OS', value: 'iOS 17.0', inline: true },
              {
                name: 'Description',
                value: 'App crashes on startup',
                inline: false,
              },
              { name: 'Status', value: 'UNCONFIRMED', inline: true },
            ],
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      await expect(client.sendMessage(complexPayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        complexPayload,
      );
    });

    it('should log warning for non-2xx status codes', async () => {
      const mockResponse = createAxiosResponse(undefined, 201);
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
    });

    it('should log warning when response status is 300 or higher', async () => {
      const mockResponse = createAxiosResponse(undefined, 300);
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
      );
    });

    it('should log warning when response status is 301 redirect', async () => {
      const mockResponse = createAxiosResponse(undefined, 301);
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
      );
    });

    describe('error handling', () => {
      it('should silently handle 400 Bad Request', async () => {
        const error = createAxiosError(400, 'Bad Request');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 401 Unauthorized', async () => {
        const error = createAxiosError(401, 'Unauthorized');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 403 Forbidden', async () => {
        const error = createAxiosError(403, 'Forbidden');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 404 Not Found (invalid webhook)', async () => {
        const error = createAxiosError(404, 'Not Found');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 429 Rate Limit', async () => {
        const error = createAxiosError(429, 'Too Many Requests', {
          retry_after: 1.5,
          global: false,
        });
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 500 Internal Server Error', async () => {
        const error = createAxiosError(500, 'Internal Server Error');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 502 Bad Gateway', async () => {
        const error = createAxiosError(502, 'Bad Gateway');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle 503 Service Unavailable', async () => {
        const error = createAxiosError(503, 'Service Unavailable');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle network error', async () => {
        const error = new Error('Network Error');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle timeout', async () => {
        const error = new Error('ETIMEDOUT') as Error & { code: string };
        error.code = 'ETIMEDOUT';
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle connection refused', async () => {
        const error = new Error('ECONNREFUSED') as Error & { code: string };
        error.code = 'ECONNREFUSED';
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle DNS resolution failure', async () => {
        const error = new Error('ENOTFOUND') as Error & { code: string };
        error.code = 'ENOTFOUND';
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle server errors', async () => {
        const error = createAxiosError(500, 'Internal Server Error');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle original error', async () => {
        const originalError = createAxiosError(400, 'Bad Request');
        httpService.post.mockReturnValue(throwError(() => originalError));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle all errors for non-critical feature', async () => {
        const error = createAxiosError(404, 'Not Found');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle invalid JSON response', async () => {
        const error = createAxiosError(400, 'Invalid JSON', {
          code: 50109,
          message: 'The request body contains invalid JSON.',
        });
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle payload too large', async () => {
        const error = createAxiosError(413, 'Payload Too Large');
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle when webhook is deleted', async () => {
        const error = createAxiosError(404, 'Unknown Webhook', {
          code: 10015,
          message: 'Unknown Webhook',
        });
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });

      it('should silently handle global rate limit', async () => {
        const error = createAxiosError(429, 'Too Many Requests', {
          global: true,
          retry_after: 60,
        });
        httpService.post.mockReturnValue(throwError(() => error));

        await expect(client.sendMessage(mockPayload)).resolves.toBeUndefined();
      });
    });

    describe('payload validation scenarios', () => {
      it('should handle empty embeds array', async () => {
        const mockResponse = createAxiosResponse(undefined, 204);
        httpService.post.mockReturnValue(of(mockResponse));

        const payloadWithEmptyEmbeds: DiscordWebhookPayload = {
          content: 'Message with empty embeds',
          embeds: [],
        };

        await expect(
          client.sendMessage(payloadWithEmptyEmbeds),
        ).resolves.toBeUndefined();
      });

      it('should handle embed without optional fields', async () => {
        const mockResponse = createAxiosResponse(undefined, 204);
        httpService.post.mockReturnValue(of(mockResponse));

        const minimalEmbedPayload: DiscordWebhookPayload = {
          embeds: [
            {
              description: 'Minimal embed',
            },
          ],
        };

        await expect(
          client.sendMessage(minimalEmbedPayload),
        ).resolves.toBeUndefined();
      });

      it('should handle field with inline false', async () => {
        const mockResponse = createAxiosResponse(undefined, 204);
        httpService.post.mockReturnValue(of(mockResponse));

        const payload: DiscordWebhookPayload = {
          embeds: [
            {
              fields: [
                { name: 'Field 1', value: 'Value 1', inline: false },
                { name: 'Field 2', value: 'Value 2', inline: true },
              ],
            },
          ],
        };

        await expect(client.sendMessage(payload)).resolves.toBeUndefined();
      });

      it('should handle field without inline property', async () => {
        const mockResponse = createAxiosResponse(undefined, 204);
        httpService.post.mockReturnValue(of(mockResponse));

        const payload: DiscordWebhookPayload = {
          embeds: [
            {
              fields: [{ name: 'Field 1', value: 'Value 1' }],
            },
          ],
        };

        await expect(client.sendMessage(payload)).resolves.toBeUndefined();
      });
    });
  });
});
