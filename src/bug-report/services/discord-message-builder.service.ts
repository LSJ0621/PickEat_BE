import { Injectable } from '@nestjs/common';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { DISCORD_WEBHOOK_CONFIG } from '@/external/discord/discord.constants';
import { DiscordEmbed } from '@/external/discord/discord.types';
import { BugReport } from '../entities/bug-report.entity';
import { formatBugReportSummary } from '../utils/discord-format.util';

/**
 * 임계값 도달 알림을 위한 파라미터
 */
export interface ThresholdAlertParams {
  /** 현재 미확인 버그 개수 */
  currentCount: number;
  /** 이전 임계값 (첫 알림이면 null) */
  lastThreshold: number | null;
  /** 현재 임계값 */
  threshold: number;
  /** 최근 버그 리스트 (최대 5개) */
  recentBugs: BugReport[];
}

/**
 * Discord 메시지 빌더 서비스
 * - 버그 리포트 알림용 Discord Embed 페이로드 생성
 * - 메시지 포맷팅 및 가독성 개선
 */
@Injectable()
export class DiscordMessageBuilderService {
  /**
   * 임계값 도달 알림용 Embed를 생성합니다.
   * @param params 알림 파라미터
   * @returns Discord Embed 객체
   */
  buildThresholdAlertEmbed(params: ThresholdAlertParams): DiscordEmbed {
    const { currentCount, lastThreshold, threshold, recentBugs } = params;

    // 증가량 계산 (첫 알림이면 null)
    const increaseCount =
      lastThreshold !== null ? currentCount - lastThreshold : null;

    // Description 생성
    const description = this.buildDescription(
      currentCount,
      lastThreshold,
      increaseCount,
    );

    // Fields 생성
    const fields = [
      {
        name: '현재 미확인 개수',
        value: `${currentCount}개`,
        inline: true,
      },
      {
        name: '임계값',
        value: `${threshold}개`,
        inline: true,
      },
    ];

    // 증가량 필드 추가 (첫 알림이 아닌 경우)
    if (increaseCount !== null) {
      fields.push({
        name: '증가량',
        value: `+${increaseCount}개`,
        inline: true,
      });
    }

    // 최근 버그 리스트 필드 추가
    if (recentBugs.length > 0) {
      const bugList = this.formatBugList(recentBugs);
      fields.push({
        name: `최근 제보 (최근 ${recentBugs.length}개)`,
        value: bugList,
        inline: false,
      });
    }

    return {
      title: '🚨 미확인 버그 제보 임계값 도달',
      description,
      color: DISCORD_WEBHOOK_CONFIG.BUG_REPORT_COLOR,
      fields,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 알림 메시지 설명을 생성합니다.
   * @param currentCount 현재 개수
   * @param lastThreshold 이전 임계값 (첫 알림이면 null)
   * @param increaseCount 증가량 (첫 알림이면 null)
   * @returns 포맷된 설명 문자열
   */
  private buildDescription(
    currentCount: number,
    lastThreshold: number | null,
    increaseCount: number | null,
  ): string {
    if (lastThreshold === null) {
      // 첫 알림
      return `미확인 버그가 **${currentCount}개**에 도달했습니다.`;
    }

    // 임계값 상승 알림
    return `미확인 버그가 **${currentCount}개**에 도달했습니다. (이전: ${lastThreshold}개, +${increaseCount}개 증가)`;
  }

  /**
   * 버그 리스트를 Discord 메시지 형식으로 포맷합니다.
   * 형식: • #ID - [카테고리] 제목 (사용자) - 경과시간
   * @param bugs 버그 리포트 배열 (최대 RECENT_BUGS_COUNT개)
   * @returns 포맷된 버그 리스트 문자열
   */
  private formatBugList(bugs: BugReport[]): string {
    const maxCount = BUG_REPORT_NOTIFICATION.RECENT_BUGS_COUNT;
    const displayBugs = bugs.slice(0, maxCount);

    if (displayBugs.length === 0) {
      return '최근 버그가 없습니다.';
    }

    return displayBugs.map((bug) => formatBugReportSummary(bug)).join('\n');
  }
}
