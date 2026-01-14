/**
 * OpenAI API 사용 통계
 */
export interface OpenAiStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgResponseTimeMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byModel: Array<{
    model: string;
    calls: number;
    tokens: number;
    estimatedCostUsd: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    calls: number;
    tokens: number;
  }>;
}

/**
 * Google Places API 사용 통계
 */
export interface GooglePlacesStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgResponseTimeMs: number;
  dailyBreakdown: Array<{
    date: string;
    calls: number;
  }>;
}

/**
 * Google CSE API 사용 통계
 */
export interface GoogleCseStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgResponseTimeMs: number;
  dailyQuota: number;
  todayUsage: number;
  remainingQuota: number;
  dailyBreakdown: Array<{
    date: string;
    calls: number;
  }>;
}

/**
 * Kakao API 사용 통계 (Local + OAuth 통합)
 */
export interface KakaoStats {
  local: {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseTimeMs: number;
  };
  oauth: {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseTimeMs: number;
  };
  dailyBreakdown: Array<{
    date: string;
    localCalls: number;
    oauthCalls: number;
  }>;
}

/**
 * API 사용 통계 응답 DTO
 */
export class ApiUsageResponseDto {
  period: string;
  openai: OpenAiStats;
  googlePlaces: GooglePlacesStats;
  googleCse: GoogleCseStats;
  kakao: KakaoStats;
}
