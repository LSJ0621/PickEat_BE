import { Test, TestingModule } from '@nestjs/testing';
import { DiscordMessageBuilderService } from '../../services/discord-message-builder.service';
import { DISCORD_WEBHOOK_CONFIG } from '@/external/discord/discord.constants';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { BugReport } from '../../entities/bug-report.entity';
import {
  BugReportFactory,
  UserFactory,
} from '../../../../test/factories/entity.factory';

function createMockBugReport(overrides?: Partial<BugReport>): BugReport {
  const user = UserFactory.create({ email: 'tester@example.com' });
  return BugReportFactory.create({
    category: 'UI/UX',
    title: '버튼이 작동하지 않습니다',
    description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
    user,
    ...overrides,
  });
}

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

  describe('buildImmediateAlertEmbed', () => {
    it('기본 Embed 구조를 반환해야 한다', () => {
      const bugReport = createMockBugReport();

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.title).toBe('🐛 새 버그 제보가 접수되었습니다');
      expect(result.color).toBe(DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR);
      expect(result.fields).toHaveLength(4);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp!)).toBeInstanceOf(Date);
    });

    it('카테고리 필드를 포함해야 한다', () => {
      const bugReport = createMockBugReport({ category: 'Performance' });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![0]).toEqual({
        name: '카테고리',
        value: bugReport.category,
        inline: true,
      });
    });

    it('제목 필드를 포함해야 한다', () => {
      const bugReport = createMockBugReport({ title: '로그인이 안 됩니다' });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![1]).toEqual({
        name: '제목',
        value: bugReport.title,
        inline: true,
      });
    });

    it('제출자 이메일 필드를 포함해야 한다', () => {
      const user = UserFactory.create({ email: 'reporter@example.com' });
      const bugReport = createMockBugReport({ user });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![2]).toEqual({
        name: '제출자',
        value: bugReport.user.email,
        inline: true,
      });
    });

    it('설명 필드를 포함해야 한다', () => {
      const bugReport = createMockBugReport({
        description: '상세한 버그 설명입니다.',
      });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![3]).toEqual({
        name: '설명',
        value: bugReport.description,
        inline: false,
      });
    });

    it('긴 설명은 100자로 잘라야 한다', () => {
      const longDescription = 'A'.repeat(150);
      const bugReport = createMockBugReport({ description: longDescription });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      const descriptionField = result.fields![3];
      expect(descriptionField.value).toBe(
        'A'.repeat(BUG_REPORT_NOTIFICATION.DESCRIPTION_PREVIEW_LENGTH) + '...',
      );
      expect(descriptionField.value).toContain('...');
    });

    it('user가 없을 때 "알 수 없음"을 표시해야 한다', () => {
      const bugReport = createMockBugReport();
      bugReport.user = null as unknown as typeof bugReport.user;

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![2]).toEqual({
        name: '제출자',
        value: '알 수 없음',
        inline: true,
      });
    });

    it('빈 설명일 때 "(내용 없음)"을 표시해야 한다', () => {
      const bugReport = createMockBugReport({ description: '' });

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![3]).toEqual({
        name: '설명',
        value: '(내용 없음)',
        inline: false,
      });
    });

    it('null 설명일 때 "(내용 없음)"을 표시해야 한다', () => {
      const bugReport = createMockBugReport();
      bugReport.description = null as unknown as string;

      const result = service.buildImmediateAlertEmbed({ bugReport });

      expect(result.fields![3]).toEqual({
        name: '설명',
        value: '(내용 없음)',
        inline: false,
      });
    });

    it('유효한 ISO timestamp를 생성해야 한다', () => {
      const beforeCall = new Date();
      const bugReport = createMockBugReport();

      const result = service.buildImmediateAlertEmbed({ bugReport });

      const afterCall = new Date();
      const timestamp = new Date(result.timestamp!);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      expect(result.timestamp!).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });
});
