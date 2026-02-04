import type {
  AnalysisParagraphs,
  StructuredAnalysis,
} from './user-taste-analysis.interface';

export interface UserPreferences {
  likes: string[]; // 좋아하는 것
  dislikes: string[]; // 싫어하는 것
  analysis?: string; // 취향 분석 텍스트 (200자 이내, 스케줄러가 자동 생성) - 기존 호환
  /**
   * @deprecated Use UserTasteAnalysis entity instead
   * Will be removed in future version
   */
  structuredAnalysis?: StructuredAnalysis; // 구조화된 취향 분석 - 신규
  analysisParagraphs?: AnalysisParagraphs; // 3문단 구조화된 분석 (각 60-130자)
  /**
   * @deprecated Use UserTasteAnalysis.lastAnalyzedAt instead
   */
  lastAnalyzedAt?: string; // 마지막 분석 시각
  /**
   * @deprecated Use UserTasteAnalysis.analysisVersion instead
   */
  analysisVersion?: number; // 분석 버전
}

export const defaultUserPreferences = (): UserPreferences => ({
  likes: [],
  dislikes: [],
  analysis: undefined,
});
