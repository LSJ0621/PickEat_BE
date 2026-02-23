/**
 * Web Search Summary Interface
 * Call A에서 생성되는 웹 검색 트렌드 요약
 */
export interface WebSearchSummary {
  /** 지역 인기 메뉴 (최대 3개) */
  localTrends: string[];

  /** 연령/성별 인기 메뉴 (최대 3개) */
  demographicFavorites: string[];

  /** 계절 메뉴 (최대 2개) */
  seasonalItems: string[];

  /** 검색 결과 신뢰도 */
  confidence: 'high' | 'medium' | 'low';

  /** 핵심 요약 (100자 이내) */
  summary: string;
}

/**
 * Cached Web Search Summary
 * Redis에 캐싱되는 웹 검색 요약
 */
export interface CachedWebSearchSummary extends WebSearchSummary {
  /** 웹 검색 수행 시간 (ISO timestamp) */
  searchedAt: string;

  /** 캐시 저장 시간 (ISO timestamp) */
  cachedAt: string;
}
