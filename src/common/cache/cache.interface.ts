/**
 * Redis에 캐싱되는 사용자 선호도 인터페이스
 */
export interface CachedUserPreferences {
  likes: string[];
  dislikes: string[];
  analysis?: string;
  structuredAnalysis?: {
    stablePatterns?: {
      categories: string[];
      flavors: string[];
      cookingMethods: string[];
      confidence: 'low' | 'medium' | 'high';
    } | null;
    recentSignals?: {
      trending: string[];
      declining: string[];
    } | null;
    diversityHints?: {
      explorationAreas: string[];
      rotationSuggestions: string[];
    } | null;
  };
  analysisParagraphs?: {
    paragraph1: string;
    paragraph2: string;
    paragraph3: string;
  };
  lastAnalyzedAt?: string;
  analysisVersion?: number;
  cachedAt: string;
}

/**
 * Redis에 캐싱되는 사용자 주소 인터페이스
 */
export interface CachedUserAddresses {
  addresses: Array<{
    id: number;
    roadAddress: string;
    postalCode: string | null;
    latitude: number;
    longitude: number;
    isDefault: boolean;
    isSearchAddress: boolean;
    alias: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  cachedAt: string;
}

/**
 * Redis에 캐싱되는 사용자 프로필 인터페이스
 */
export interface CachedUserProfile {
  email: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  birthDate: string | null;
  gender: string | null;
  preferredLanguage: 'ko' | 'en';
  cachedAt: string;
}

/**
 * Redis에 캐싱되는 웹서치 요약 인터페이스
 */
export interface CachedWebSearchSummary {
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
  /** 웹 검색 수행 시간 */
  searchedAt: string;
  /** 캐시 저장 시간 */
  cachedAt: string;
}
