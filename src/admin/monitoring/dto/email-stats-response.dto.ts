/**
 * 이메일 목적별 통계
 */
export interface EmailPurposeStats {
  purpose: string;
  totalSent: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

/**
 * 이메일 일별 통계
 */
export interface EmailDailyStats {
  date: string;
  totalSent: number;
  successCount: number;
  failureCount: number;
}

/**
 * 이메일 통계 응답 DTO
 */
export class EmailStatsResponseDto {
  period: string;
  summary: {
    totalSent: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  };
  byPurpose: EmailPurposeStats[];
  dailyBreakdown: EmailDailyStats[];
}
