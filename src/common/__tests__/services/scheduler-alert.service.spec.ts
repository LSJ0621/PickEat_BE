import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { SchedulerAlertService } from '../../services/scheduler-alert.service';

function makeAxiosResponse(): AxiosResponse {
  return {
    data: {},
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  };
}

describe('SchedulerAlertService', () => {
  let service: SchedulerAlertService;
  let httpService: { post: jest.Mock };
  let configService: jest.Mocked<ConfigService>;

  const SCHEDULER_WEBHOOK_URL = 'https://discord.com/api/webhooks/scheduler';
  const BUG_REPORT_WEBHOOK_URL = 'https://discord.com/api/webhooks/bug-report';

  async function createModule(
    configMap: Record<string, string | undefined>,
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        SchedulerAlertService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configMap[key]),
          },
        },
      ],
    }).compile();
  }

  describe('constructor initialization', () => {
    it('should use schedulerUrl when DISCORD_SCHEDULER_WEBHOOK_URL is set', async () => {
      const module = await createModule({
        DISCORD_SCHEDULER_WEBHOOK_URL: SCHEDULER_WEBHOOK_URL,
        DISCORD_BUG_REPORT_WEBHOOK_URL: BUG_REPORT_WEBHOOK_URL,
      });
      service = module.get<SchedulerAlertService>(SchedulerAlertService);
      httpService = module.get(HttpService);

      httpService.post.mockReturnValue(of(makeAxiosResponse()));
      const error = new Error('scheduler failure');
      await service.alertFailure('TestScheduler', error);

      expect(httpService.post).toHaveBeenCalledWith(
        SCHEDULER_WEBHOOK_URL,
        expect.any(Object),
      );
    });

    it('should fall back to bugReportUrl when DISCORD_SCHEDULER_WEBHOOK_URL is not set', async () => {
      const module = await createModule({
        DISCORD_SCHEDULER_WEBHOOK_URL: undefined,
        DISCORD_BUG_REPORT_WEBHOOK_URL: BUG_REPORT_WEBHOOK_URL,
      });
      service = module.get<SchedulerAlertService>(SchedulerAlertService);
      httpService = module.get(HttpService);

      httpService.post.mockReturnValue(of(makeAxiosResponse()));
      const error = new Error('scheduler failure');
      await service.alertFailure('TestScheduler', error);

      expect(httpService.post).toHaveBeenCalledWith(
        BUG_REPORT_WEBHOOK_URL,
        expect.any(Object),
      );
    });

    it('should not send alert when neither webhook URL is configured', async () => {
      const module = await createModule({
        DISCORD_SCHEDULER_WEBHOOK_URL: undefined,
        DISCORD_BUG_REPORT_WEBHOOK_URL: undefined,
      });
      service = module.get<SchedulerAlertService>(SchedulerAlertService);
      httpService = module.get(HttpService);

      const error = new Error('scheduler failure');
      await service.alertFailure('TestScheduler', error);

      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('alertFailure', () => {
    beforeEach(async () => {
      const module = await createModule({
        DISCORD_SCHEDULER_WEBHOOK_URL: SCHEDULER_WEBHOOK_URL,
        DISCORD_BUG_REPORT_WEBHOOK_URL: undefined,
      });
      service = module.get<SchedulerAlertService>(SchedulerAlertService);
      httpService = module.get(HttpService);
      configService = module.get(ConfigService);
    });

    it('should send discord webhook payload with scheduler name and error message', async () => {
      const error = new Error('Database connection failed');
      error.stack =
        'Error: Database connection failed\n    at SomeService.method';

      httpService.post.mockReturnValue(of(makeAxiosResponse()));

      await service.alertFailure('BatchScheduler', error);

      expect(httpService.post).toHaveBeenCalledWith(
        SCHEDULER_WEBHOOK_URL,
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: '⚠️ 스케줄러 실패: BatchScheduler',
              description: 'Database connection failed',
              color: 0xff0000,
            }),
          ]),
        }),
      );
    });

    it('should include stack trace in payload fields when error has stack', async () => {
      const error = new Error('Test error');
      error.stack =
        'Error: Test error\n    at TestScheduler.run (scheduler.ts:10:5)';

      httpService.post.mockReturnValue(of(makeAxiosResponse()));

      await service.alertFailure('TestScheduler', error);

      const callPayload = httpService.post.mock.calls[0][1] as {
        embeds: Array<{
          fields: Array<{ name: string; value: string }>;
        }>;
      };
      const stackField = callPayload.embeds[0].fields[0];
      expect(stackField.name).toBe('Stack Trace');
      expect(stackField.value).toContain('TestScheduler.run');
    });

    it('should use N/A as stack trace value when error stack is undefined', async () => {
      const error = new Error('No stack error');
      error.stack = undefined;

      httpService.post.mockReturnValue(of(makeAxiosResponse()));

      await service.alertFailure('TestScheduler', error);

      const callPayload = httpService.post.mock.calls[0][1] as {
        embeds: Array<{
          fields: Array<{ name: string; value: string }>;
        }>;
      };
      const stackField = callPayload.embeds[0].fields[0];
      expect(stackField.value).toBe('N/A');
    });

    it('should not throw and silently log when discord webhook request fails', async () => {
      const error = new Error('Scheduler error');
      const httpError = new Error('Network error');

      httpService.post.mockReturnValue(throwError(() => httpError));

      await expect(
        service.alertFailure('TestScheduler', error),
      ).resolves.toBeUndefined();
    });

    it('should include timestamp in embed payload', async () => {
      const error = new Error('Timestamp test');
      httpService.post.mockReturnValue(of(makeAxiosResponse()));

      const beforeCall = new Date().toISOString();
      await service.alertFailure('TestScheduler', error);
      const afterCall = new Date().toISOString();

      const callPayload = httpService.post.mock.calls[0][1] as {
        embeds: Array<{ timestamp: string }>;
      };
      const timestamp = callPayload.embeds[0].timestamp;
      expect(timestamp >= beforeCall || timestamp <= afterCall).toBe(true);
    });
  });
});
