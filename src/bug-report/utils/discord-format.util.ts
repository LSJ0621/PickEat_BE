import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';
import { BugReport } from '../entities/bug-report.entity';

/**
 * 텍스트를 지정된 최대 길이로 잘라내고 말줄임표를 추가합니다.
 * @param text 원본 텍스트
 * @param maxLength 최대 길이
 * @returns 잘린 텍스트 (필요시 '...' 추가)
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length === 0 || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * 주어진 날짜로부터 현재까지 경과한 시간을 사람이 읽기 쉬운 형식으로 반환합니다.
 * @param date 기준 날짜
 * @returns "방금 전", "N분 전", "N시간 전", "N일 전" 형식의 문자열
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return '방금 전';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }
  return `${diffDays}일 전`;
}

/**
 * 버그 리포트를 한 줄 요약 형식으로 포맷합니다.
 * 형식: • #ID - [카테고리] 제목 (사용자 이메일) - 경과시간
 * @param bug 버그 리포트 엔티티 (user relation 필수)
 * @returns 포맷된 요약 문자열
 */
export function formatBugReportSummary(bug: BugReport): string {
  const truncatedTitle = truncateText(
    bug.title,
    BUG_REPORT_NOTIFICATION.DESCRIPTION_PREVIEW_LENGTH,
  );
  const userEmail = bug.user?.email || '알 수 없음';
  const timeAgo = formatTimeAgo(bug.createdAt);

  return `• #${bug.id} - [${bug.category}] ${truncatedTitle} (${userEmail}) - ${timeAgo}`;
}
