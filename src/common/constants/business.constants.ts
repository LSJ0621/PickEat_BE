/**
 * 사용자 관련 제한 상수
 */
export const USER_LIMITS = {
  /** 최대 저장 가능한 주소 개수 */
  MAX_ADDRESSES: 4,
  /** 최대 취향 태그 개수 */
  MAX_PREFERENCE_TAGS: 20,
} as const;

/**
 * 검색 관련 기본값 상수
 */
export const SEARCH_DEFAULTS = {
  /** 네이버 로컬 검색 결과 개수 */
  NAVER_LOCAL_DISPLAY: 5,
  /** Google Places 검색 결과 개수 */
  GOOGLE_PLACES_MAX_RESULTS: 10,
  /** Google Custom Search 결과 개수 */
  GOOGLE_CSE_NUM_RESULTS: 5,
} as const;

/**
 * 메뉴 추천 관련 상수
 */
export const MENU_RECOMMENDATION = {
  /** 최소 추천 개수 */
  MIN_COUNT: 3,
  /** 최대 추천 개수 */
  MAX_COUNT: 10,
} as const;

/**
 * 인증 관련 상수 (밀리초 단위)
 */
export const AUTH_TIMING = {
  /** 쿠키 만료 시간: 7일 */
  COOKIE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  /** 하루: 24시간 */
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * 이메일 인증 관련 상수 (밀리초 단위)
 */
export const EMAIL_VERIFICATION = {
  /** 인증 코드 만료 시간: 3분 */
  CODE_EXPIRES_MS: 3 * 60 * 1000,
  /** 재전송 제한 시간: 30초 */
  RESEND_LIMIT_MS: 30 * 1000,
} as const;

/**
 * OpenAI API 관련 상수
 */
export const OPENAI_SETTINGS = {
  /** 취향 분석 max_completion_tokens */
  PREFERENCE_MAX_TOKENS: 500,
} as const;

/**
 * 버그 리포트 알림 관련 상수
 */
export const BUG_REPORT_NOTIFICATION = {
  /** 알림 임계값 배열 */
  THRESHOLDS: [10, 20, 30, 50, 100] as const,
  /** 스케줄러 알림에 포함할 최근 버그 개수 */
  RECENT_BUGS_COUNT: 5,
  /** 설명 미리보기 최대 길이 */
  DESCRIPTION_PREVIEW_LENGTH: 100,
} as const;

/**
 * 유저 등록 장소 관련 상수
 */
export const USER_PLACE = {
  /** 일일 등록 제한 (UTC 0시 기준) */
  DAILY_REGISTRATION_LIMIT: 5,
  /** 요청 제한 */
  RATE_LIMITS: {
    CREATE_PER_MINUTE: 5,
    UPDATE_DELETE_PER_MINUTE: 10,
    READ_PER_MINUTE: 100,
  },
  /** 유사 장소 검색 반경 (미터) */
  NEARBY_SEARCH_RADIUS_METERS: 100,
  /** 이름 최대 길이 */
  NAME_MAX_LENGTH: 100,
  /** 주소 최대 길이 */
  ADDRESS_MAX_LENGTH: 500,
  /** 전화번호 최대 길이 */
  PHONE_MAX_LENGTH: 20,
  /** 카테고리 최대 길이 */
  CATEGORY_MAX_LENGTH: 50,
  /** 메뉴 종류 최소 개수 */
  MENU_TYPES_MIN: 1,
  /** 메뉴 종류 최대 개수 */
  MENU_TYPES_MAX: 10,
  /** 사진 최대 개수 */
  PHOTOS_MAX: 5,
  /** 영업시간 최대 길이 */
  OPENING_HOURS_MAX_LENGTH: 200,
} as const;

/**
 * 유저 등록 장소 카테고리 목록
 */
export const USER_PLACE_CATEGORIES = [
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '카페',
  '베이커리',
  '디저트',
  '술집',
  '기타',
] as const;

/**
 * Google Places 검색 관련 상수
 */
export const GOOGLE_PLACES_SEARCH = {
  /** Location bias radius in meters (float required by Google Places API) */
  LOCATION_BIAS_RADIUS_METERS: 500.0,
} as const;
