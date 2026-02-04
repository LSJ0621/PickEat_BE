export interface StablePatterns {
  categories: string[];
  flavors: string[];
  cookingMethods: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface RecentSignals {
  trending: string[];
  declining: string[];
}

export interface DiversityHints {
  explorationAreas: string[];
  rotationSuggestions: string[];
}

/**
 * Structured preference analysis data
 * Canonical source - all fields are optional/nullable for flexibility
 */
export interface StructuredAnalysis {
  stablePatterns?: StablePatterns | null;
  recentSignals?: RecentSignals | null;
  diversityHints?: DiversityHints | null;
}

export interface AnalysisParagraphs {
  paragraph1: string;
  paragraph2: string;
  paragraph3: string;
}

export interface UserTasteAnalysisData {
  stablePatterns?: StablePatterns | null;
  recentSignals?: RecentSignals | null;
  diversityHints?: DiversityHints | null;
  /**
   * 메뉴 추천 API용 간결한 요약 (100자 이내)
   * 배치 작업에서 LLM이 생성
   * 예: "한식 선호, 국물류 좋아함, 매운맛 OK, 최근 중식에 관심, 일식 탐색 가능"
   */
  compactSummary?: string | null;
  analysisParagraphs?: AnalysisParagraphs | null;
  analysisVersion?: number;
  lastAnalyzedAt?: Date;
}
