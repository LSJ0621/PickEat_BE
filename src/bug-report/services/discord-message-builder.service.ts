import { Injectable } from '@nestjs/common';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { DISCORD_WEBHOOK_CONFIG } from '@/external/discord/discord.constants';
import { DiscordEmbed } from '@/external/discord/discord.types';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { truncateText } from '@/bug-report/utils/discord-format.util';

export interface ImmediateAlertParams {
  bugReport: BugReport;
}

@Injectable()
export class DiscordMessageBuilderService {
  buildImmediateAlertEmbed(params: ImmediateAlertParams): DiscordEmbed {
    const { bugReport } = params;
    const userEmail = bugReport.user?.email ?? '알 수 없음';
    const description = bugReport.description
      ? truncateText(
          bugReport.description,
          BUG_REPORT_NOTIFICATION.DESCRIPTION_PREVIEW_LENGTH,
        )
      : '(내용 없음)';

    return {
      title: '🐛 새 버그 제보가 접수되었습니다',
      color: DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR,
      fields: [
        { name: '카테고리', value: bugReport.category, inline: true },
        { name: '제목', value: bugReport.title, inline: true },
        { name: '제출자', value: userEmail, inline: true },
        { name: '설명', value: description, inline: false },
      ],
      timestamp: new Date().toISOString(),
    };
  }
}
