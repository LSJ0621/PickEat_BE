/**
 * OpenAI API 설정
 */
export const OPENAI_CONFIG = {
  /**
   * 기본 모델 (환경변수로 오버라이드 가능)
   */
  DEFAULT_MODEL: 'gpt-5.1',

  /**
   * 검증 모델 (Stage 1)
   */
  VALIDATION_MODEL: 'gpt-4o-mini',

  /**
   * 모델별 최대 토큰
   */
  MAX_TOKENS: {
    MENU_RECOMMENDATION: 800,
    MENU_VALIDATION: 200,
    PLACE_RECOMMENDATION: 800,
    PREFERENCE_ANALYSIS: 1500,
  },
} as const;

/**
 * 환경변수 키
 */
export const OPENAI_ENV_KEYS = {
  API_KEY: 'OPENAI_API_KEY',
  MODEL: 'OPENAI_MODEL',
  MENU_MODEL: 'OPENAI_MENU_MODEL',
  VALIDATION_MODEL: 'OPENAI_VALIDATION_MODEL',
  PREFERENCE_MODEL: 'OPENAI_PREFERENCE_MODEL',
  PLACES_MODEL: 'OPENAI_PLACES_MODEL',
} as const;

/**
 * 웹 검색 설정
 */
export const WEB_SEARCH_CONFIG = {
  /** 웹 검색용 모델 (Responses API 호환) */
  MODEL: 'gpt-5.1',
  /** 검색 컨텍스트 크기 */
  CONTEXT_SIZE: 'low' as const,
} as const;
