/**
 * Prometheus 메트릭 관련 상수
 */

/**
 * AI/LLM 엔드포인트 (recordAiSuccess, recordAiError, recordAiDuration에 사용)
 */
export const PROMETHEUS_ENDPOINTS = {
  /** 메뉴 추천 */
  MENU: 'menu',
  /** 메뉴 요청 검증 (Stage 1) */
  MENU_VALIDATION: 'menu_validation',
  /** 선호도 분석 */
  PREFERENCE_ANALYSIS: 'preference_analysis',
  /** 장소 추천 */
  PLACE_RECOMMENDATION: 'place_recommendation',
} as const;

/**
 * 외부 서비스 이름 (recordExternalApi에 사용)
 */
export const EXTERNAL_SERVICES = {
  /** OpenAI API */
  OPENAI: 'openai',
  /** Google Places API */
  GOOGLE_PLACES: 'google_places',
  /** Kakao API */
  KAKAO: 'kakao',
  /** Naver API */
  NAVER: 'naver',
  /** Discord Webhook */
  DISCORD: 'discord',
  /** AWS S3 */
  S3: 's3',
} as const;

export type PrometheusEndpoint =
  (typeof PROMETHEUS_ENDPOINTS)[keyof typeof PROMETHEUS_ENDPOINTS];
export type ExternalService =
  (typeof EXTERNAL_SERVICES)[keyof typeof EXTERNAL_SERVICES];
