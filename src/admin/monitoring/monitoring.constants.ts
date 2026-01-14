/**
 * API 제공자 상수
 */
export const API_PROVIDERS = {
  OPENAI: 'OPENAI',
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  GOOGLE_CSE: 'GOOGLE_CSE',
  KAKAO_LOCAL: 'KAKAO_LOCAL',
  KAKAO_OAUTH: 'KAKAO_OAUTH',
} as const;

export type ApiProvider = (typeof API_PROVIDERS)[keyof typeof API_PROVIDERS];

/**
 * 이메일 발송 목적 상수
 */
export const EMAIL_PURPOSES = {
  SIGNUP: 'SIGNUP',
  PASSWORD_RESET: 'PASSWORD_RESET',
  RE_REGISTER: 'RE_REGISTER',
} as const;

export type EmailPurpose = (typeof EMAIL_PURPOSES)[keyof typeof EMAIL_PURPOSES];

/**
 * OpenAI 모델별 가격 (USD per 1M tokens)
 * @see https://openai.com/pricing
 */
export const OPENAI_PRICING = {
  'gpt-4o': {
    input: 2.5,
    output: 10.0,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4': {
    input: 30.0,
    output: 60.0,
  },
  'gpt-3.5-turbo': {
    input: 0.5,
    output: 1.5,
  },
} as const;

/**
 * Google Custom Search Engine 일일 무료 쿼터
 */
export const GOOGLE_CSE_DAILY_QUOTA = 100;

/**
 * 모니터링 쿼리 기간 옵션
 */
export const MONITORING_PERIODS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} as const;

export type MonitoringPeriod = keyof typeof MONITORING_PERIODS;
