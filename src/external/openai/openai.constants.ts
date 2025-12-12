/**
 * OpenAI API 설정
 */
export const OPENAI_CONFIG = {
  /**
   * 기본 모델 (환경변수로 오버라이드 가능)
   */
  DEFAULT_MODEL: 'gpt-5.1',

  /**
   * 모델별 최대 토큰
   */
  MAX_TOKENS: {
    MENU_RECOMMENDATION: 500,
    PLACE_RECOMMENDATION: 800,
    PREFERENCE_ANALYSIS: 500,
  },
} as const;

/**
 * 환경변수 키
 */
export const OPENAI_ENV_KEYS = {
  API_KEY: 'OPENAI_API_KEY',
  MODEL: 'OPENAI_MODEL',
  MENU_MODEL: 'OPENAI_MENU_MODEL',
  PREFERENCE_MODEL: 'OPENAI_PREFERENCE_MODEL',
} as const;

