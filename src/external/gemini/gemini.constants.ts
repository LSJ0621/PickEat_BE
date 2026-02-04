/**
 * Gemini API 설정
 * @note gemini-2.5-flash 사용 이유: Maps Grounding 지원 (gemini-3.0은 미지원)
 * @note maxOutputTokens 미설정: 기본값 65,535 사용 (Search/Maps Grounding 메타데이터 공간 확보)
 */
export const GEMINI_CONFIG = {
  MODEL: 'gemini-2.5-flash', // Maps Grounding 지원 필수
} as const;

/**
 * Gemini 로깅 설정
 */
export const GEMINI_LOGGING = {
  /** Raw 응답 미리보기 길이 - 로그 가독성과 크기 균형 */
  RAW_RESPONSE_PREVIEW_LENGTH: 1000,
  /** 로그에 포함할 최대 grounding supports 수 - 로그 과부하 방지 */
  MAX_SUPPORTS_TO_LOG: 20,
  /** 기본 로깅 상세도 */
  DEFAULT_VERBOSITY: 'normal' as const,
} as const;

export type GeminiLogVerbosity = 'minimal' | 'normal' | 'debug';
