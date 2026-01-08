import { Test, TestingModule } from '@nestjs/testing';
import { DiscordMessageBuilderService } from '../../services/discord-message-builder.service';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { DISCORD_WEBHOOK_CONFIG } from '@/external/discord/discord.constants';
import {
  BugReportFactory,
  UserFactory,
} from '../../../../test/factories/entity.factory';
import { ThresholdAlertParams } from '../../interfaces/threshold-alert.interface';
import * as discordFormatUtil from '../../utils/discord-format.util';

describe('DiscordMessageBuilderService', () => {
  let service: DiscordMessageBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscordMessageBuilderService],
    }).compile();

    service = module.get<DiscordMessageBuilderService>(
      DiscordMessageBuilderService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildThresholdAlertEmbed', () => {
    const createParams = (
      overrides?: Partial<ThresholdAlertParams>,
    ): ThresholdAlertParams => ({
      currentCount: 15,
      lastThreshold: 10,
      threshold: 20,
      recentBugs: [],
      ...overrides,
    });

    it('should build a basic threshold alert embed without recent bugs', () => {
      const params = createParams({ recentBugs: [] });

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.title).toBe('🚨 미확인 버그 제보 임계값 도달');
      expect(result.description).toBe(
        '미확인 버그가 **15개**에 도달했습니다. (이전: 10개, +5개 증가)',
      );
      expect(result.color).toBe(DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp!)).toBeInstanceOf(Date);
      expect(result.fields).toHaveLength(3);
      expect(result.fields![0]).toEqual({
        name: '현재 미확인 개수',
        value: '15개',
        inline: true,
      });
      expect(result.fields![1]).toEqual({
        name: '임계값',
        value: '20개',
        inline: true,
      });
      expect(result.fields![2]).toEqual({
        name: '증가량',
        value: '+5개',
        inline: true,
      });
    });

    it('should build alert embed for first notification with null lastThreshold', () => {
      const params = createParams({
        currentCount: 10,
        lastThreshold: null,
        threshold: 10,
      });

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.description).toBe('미확인 버그가 **10개**에 도달했습니다.');
      expect(result.fields).toHaveLength(2);
      expect(result.fields![0]).toEqual({
        name: '현재 미확인 개수',
        value: '10개',
        inline: true,
      });
      expect(result.fields![1]).toEqual({
        name: '임계값',
        value: '10개',
        inline: true,
      });
      // Should not have increase field for first notification
      expect(result.fields!.find((f) => f.name === '증가량')).toBeUndefined();
    });

    it('should include recent bugs field when bugs are provided', () => {
      const user = UserFactory.create({ email: 'user1@example.com' });
      const recentBugs = [
        BugReportFactory.create({
          id: 1,
          user,
          category: 'UI/UX',
          title: '버튼 클릭 안됨',
          createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        }),
        BugReportFactory.create({
          id: 2,
          user,
          category: 'Performance',
          title: '로딩이 너무 느림',
          createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        }),
      ];

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockReturnValueOnce(
        '• #1 - [UI/UX] 버튼 클릭 안됨 (user1@example.com) - 5분 전',
      );
      formatSpy.mockReturnValueOnce(
        '• #2 - [Performance] 로딩이 너무 느림 (user1@example.com) - 30분 전',
      );

      const params = createParams({ recentBugs });

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.fields).toHaveLength(4);
      const bugListField = result.fields!.find((f) =>
        f.name.includes('최근 제보'),
      );
      expect(bugListField).toBeDefined();
      expect(bugListField!.name).toBe('최근 제보 (최근 2개)');
      expect(bugListField!.value).toBe(
        '• #1 - [UI/UX] 버튼 클릭 안됨 (user1@example.com) - 5분 전\n' +
          '• #2 - [Performance] 로딩이 너무 느림 (user1@example.com) - 30분 전',
      );
      expect(bugListField!.inline).toBe(false);
      expect(formatSpy).toHaveBeenCalledTimes(2);
      expect(formatSpy).toHaveBeenNthCalledWith(1, recentBugs[0]);
      expect(formatSpy).toHaveBeenNthCalledWith(2, recentBugs[1]);

      formatSpy.mockRestore();
    });

    it('should limit recent bugs to RECENT_BUGS_COUNT', () => {
      const user = UserFactory.create({ email: 'test@example.com' });
      const recentBugs = Array.from({ length: 10 }, (_, i) =>
        BugReportFactory.create({
          id: i + 1,
          user,
          title: `Bug ${i + 1}`,
          createdAt: new Date(Date.now() - i * 60 * 1000),
        }),
      );

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockImplementation((bug) => `• #${bug.id} - Bug summary`);

      const params = createParams({ recentBugs });

      service.buildThresholdAlertEmbed(params);

      // Should only call formatBugReportSummary for first RECENT_BUGS_COUNT items
      expect(formatSpy).toHaveBeenCalledTimes(
        BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT,
      );
      expect(formatSpy).toHaveBeenNthCalledWith(1, recentBugs[0]);
      expect(formatSpy).toHaveBeenNthCalledWith(
        BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT,
        recentBugs[BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT - 1],
      );

      formatSpy.mockRestore();
    });

    it('should handle different count values', () => {
      const testCases = [
        {
          currentCount: 10,
          lastThreshold: null,
          threshold: 10,
          expectedIncrease: null,
        },
        {
          currentCount: 20,
          lastThreshold: 10,
          threshold: 20,
          expectedIncrease: 10,
        },
        {
          currentCount: 50,
          lastThreshold: 30,
          threshold: 50,
          expectedIncrease: 20,
        },
        {
          currentCount: 100,
          lastThreshold: 50,
          threshold: 100,
          expectedIncrease: 50,
        },
      ];

      testCases.forEach(
        ({ currentCount, lastThreshold, threshold, expectedIncrease }) => {
          const params = createParams({
            currentCount,
            lastThreshold,
            threshold,
            recentBugs: [],
          });
          const result = service.buildThresholdAlertEmbed(params);

          expect(result.fields![0].value).toBe(`${currentCount}개`);
          expect(result.fields![1].value).toBe(`${threshold}개`);

          if (expectedIncrease !== null) {
            expect(result.fields![2]).toEqual({
              name: '증가량',
              value: `+${expectedIncrease}개`,
              inline: true,
            });
          } else {
            expect(
              result.fields!.find((f) => f.name === '증가량'),
            ).toBeUndefined();
          }
        },
      );
    });

    it('should generate valid ISO timestamp', () => {
      const beforeCall = new Date();
      const params = createParams();
      const result = service.buildThresholdAlertEmbed(params);
      const afterCall = new Date();

      const timestamp = new Date(result.timestamp!);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      expect(result.timestamp!).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('should handle zero increase correctly', () => {
      const params = createParams({
        currentCount: 10,
        lastThreshold: 10,
        threshold: 20,
      });

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.description).toContain('+0개 증가');
      expect(result.fields![2]).toEqual({
        name: '증가량',
        value: '+0개',
        inline: true,
      });
    });

    it('should build complete embed with all fields', () => {
      const user = UserFactory.create({ email: 'reporter@example.com' });
      const recentBugs = [
        BugReportFactory.create({
          id: 1,
          user,
          category: 'Bug',
          title: 'Critical issue',
          createdAt: new Date(),
        }),
      ];

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockReturnValue(
        '• #1 - [Bug] Critical issue (reporter@example.com) - 방금 전',
      );

      const params = createParams({
        currentCount: 25,
        lastThreshold: 20,
        threshold: 30,
        recentBugs,
      });

      const result = service.buildThresholdAlertEmbed(params);

      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('timestamp');
      expect(result.title).toBe('🚨 미확인 버그 제보 임계값 도달');
      expect(result.description).toContain('25개');
      expect(result.color).toBe(0xff0000);
      expect(result.fields).toHaveLength(4);

      formatSpy.mockRestore();
    });

    it('should handle single recent bug', () => {
      const user = UserFactory.create();
      const recentBugs = [
        BugReportFactory.create({ id: 1, user, createdAt: new Date() }),
      ];

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockReturnValue('• #1 - Bug summary');

      const params = createParams({ recentBugs });

      const result = service.buildThresholdAlertEmbed(params);

      const bugListField = result.fields!.find((f) =>
        f.name.includes('최근 제보'),
      );
      expect(bugListField!.name).toBe('최근 제보 (최근 1개)');
      expect(bugListField!.value).toBe('• #1 - Bug summary');

      formatSpy.mockRestore();
    });

    it('should have consistent field structure across different inputs', () => {
      const testCases = [
        createParams({
          currentCount: 10,
          lastThreshold: null,
          threshold: 10,
          recentBugs: [],
        }),
        createParams({
          currentCount: 20,
          lastThreshold: 10,
          threshold: 20,
          recentBugs: [],
        }),
        createParams({
          currentCount: 50,
          lastThreshold: 30,
          threshold: 50,
          recentBugs: [BugReportFactory.create({ createdAt: new Date() })],
        }),
      ];

      testCases.forEach((params) => {
        const result = service.buildThresholdAlertEmbed(params);

        expect(result.fields![0].name).toBe('현재 미확인 개수');
        expect(result.fields![0].inline).toBe(true);
        expect(result.fields![1].name).toBe('임계값');
        expect(result.fields![1].inline).toBe(true);
      });
    });
  });

  describe('private methods behavior (via buildThresholdAlertEmbed)', () => {
    it('should format description correctly for first notification', () => {
      const params: ThresholdAlertParams = {
        currentCount: 10,
        lastThreshold: null,
        threshold: 10,
        recentBugs: [],
      };

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.description).toBe('미확인 버그가 **10개**에 도달했습니다.');
      expect(result.description).not.toContain('이전');
      expect(result.description).not.toContain('증가');
    });

    it('should format description correctly for subsequent notifications', () => {
      const params: ThresholdAlertParams = {
        currentCount: 25,
        lastThreshold: 20,
        threshold: 30,
        recentBugs: [],
      };

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.description).toBe(
        '미확인 버그가 **25개**에 도달했습니다. (이전: 20개, +5개 증가)',
      );
      expect(result.description).toContain('이전');
      expect(result.description).toContain('증가');
    });

    it('should format empty bug list correctly', () => {
      const params: ThresholdAlertParams = {
        currentCount: 10,
        lastThreshold: null,
        threshold: 10,
        recentBugs: [],
      };

      const result = service.buildThresholdAlertEmbed(params);

      const bugListField = result.fields!.find((f) =>
        f.name.includes('최근 제보'),
      );
      expect(bugListField).toBeUndefined();
    });

    it('should call formatBugReportSummary for each bug in list', () => {
      const user = UserFactory.create();
      const recentBugs = [
        BugReportFactory.create({ id: 1, user, createdAt: new Date() }),
        BugReportFactory.create({ id: 2, user, createdAt: new Date() }),
        BugReportFactory.create({ id: 3, user, createdAt: new Date() }),
      ];

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockImplementation((bug) => `Mock summary for bug ${bug.id}`);

      const params: ThresholdAlertParams = {
        currentCount: 15,
        lastThreshold: 10,
        threshold: 20,
        recentBugs,
      };

      service.buildThresholdAlertEmbed(params);

      expect(formatSpy).toHaveBeenCalledTimes(3);
      recentBugs.forEach((bug, index) => {
        expect(formatSpy).toHaveBeenNthCalledWith(index + 1, bug);
      });

      formatSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle lastThreshold === 0 (not null)', () => {
      const params: ThresholdAlertParams = {
        currentCount: 10,
        lastThreshold: 0,
        threshold: 10,
        recentBugs: [],
      };

      const result = service.buildThresholdAlertEmbed(params);

      // Should calculate increase from 0
      expect(result.description).toBe(
        '미확인 버그가 **10개**에 도달했습니다. (이전: 0개, +10개 증가)',
      );
      expect(result.fields).toHaveLength(3);
      expect(result.fields![2]).toEqual({
        name: '증가량',
        value: '+10개',
        inline: true,
      });
    });

    it('should handle very large count values', () => {
      const params: ThresholdAlertParams = {
        currentCount: 999999,
        lastThreshold: 500000,
        threshold: 1000000,
        recentBugs: [],
      };

      const result = service.buildThresholdAlertEmbed(params);

      expect(result.fields![0].value).toBe('999999개');
      expect(result.fields![1].value).toBe('1000000개');
      expect(result.fields![2].value).toBe('+499999개');
    });

    it('should handle exactly RECENT_BUGS_COUNT bugs', () => {
      const user = UserFactory.create();
      const recentBugs = Array.from(
        { length: BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT },
        (_, i) =>
          BugReportFactory.create({ id: i + 1, user, createdAt: new Date() }),
      );

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockImplementation((bug) => `• #${bug.id}`);

      const params: ThresholdAlertParams = {
        currentCount: 15,
        lastThreshold: 10,
        threshold: 20,
        recentBugs,
      };

      const result = service.buildThresholdAlertEmbed(params);

      const bugListField = result.fields!.find((f) =>
        f.name.includes('최근 제보'),
      );
      expect(bugListField!.name).toBe(
        `최근 제보 (최근 ${BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT}개)`,
      );
      // Verify all 5 bugs were formatted
      expect(formatSpy).toHaveBeenCalledTimes(
        BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT,
      );

      formatSpy.mockRestore();
    });

    it('should handle more than RECENT_BUGS_COUNT bugs and only display first 5', () => {
      const user = UserFactory.create();
      const totalBugs = BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT + 3;
      const recentBugs = Array.from({ length: totalBugs }, (_, i) =>
        BugReportFactory.create({ id: i + 1, user, createdAt: new Date() }),
      );

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockImplementation((bug) => `• #${bug.id}`);

      const params: ThresholdAlertParams = {
        currentCount: 20,
        lastThreshold: 15,
        threshold: 25,
        recentBugs,
      };

      const result = service.buildThresholdAlertEmbed(params);

      const bugListField = result.fields!.find((f) =>
        f.name.includes('최근 제보'),
      );
      // Field name should show the total count in recentBugs, not the sliced count
      expect(bugListField!.name).toBe(`최근 제보 (최근 ${totalBugs}개)`);
      // But only RECENT_BUGS_COUNT should be formatted and displayed
      expect(formatSpy).toHaveBeenCalledTimes(
        BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT,
      );
      // Verify only first 5 bugs were formatted (not all 8)
      for (let i = 0; i < BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT; i++) {
        expect(formatSpy).toHaveBeenCalledWith(recentBugs[i]);
      }

      formatSpy.mockRestore();
    });

    it('should handle bugs with different categories and long titles', () => {
      const user = UserFactory.create({ email: 'test@example.com' });
      const recentBugs = [
        BugReportFactory.create({
          id: 1,
          user,
          category: 'Performance',
          title: 'A'.repeat(200),
          createdAt: new Date(),
        }),
      ];

      const formatSpy = jest.spyOn(discordFormatUtil, 'formatBugReportSummary');
      formatSpy.mockReturnValue(
        '• #1 - [Performance] A very long title... (test@example.com) - 방금 전',
      );

      const params: ThresholdAlertParams = {
        currentCount: 10,
        lastThreshold: null,
        threshold: 10,
        recentBugs,
      };

      const result = service.buildThresholdAlertEmbed(params);

      expect(formatSpy).toHaveBeenCalledWith(recentBugs[0]);
      expect(
        result.fields!.find((f) => f.name.includes('최근 제보')),
      ).toBeDefined();

      formatSpy.mockRestore();
    });
  });
});
