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
  /** Google Places 검색 결과 개수 */
  GOOGLE_PLACES_MAX_RESULTS: 10,
  /** Google Custom Search 결과 개수 */
  GOOGLE_CSE_NUM_RESULTS: 5,
} as const;

/**
 * 인증 관련 상수 (밀리초 단위)
 */
export const AUTH_TIMING = {
  /** Access Token 만료 시간: 15분 */
  ACCESS_TOKEN_EXPIRES: '15m',
  /** Refresh Token 만료 시간: 7일 */
  REFRESH_TOKEN_EXPIRES: '7d',
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
  /** 설명 미리보기 최대 길이 */
  DESCRIPTION_PREVIEW_LENGTH: 100,
} as const;

/**
 * 파일 업로드 관련 상수
 */
export const FILE_UPLOAD = {
  /** 단일 파일 최대 크기: 5MB */
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  /** 최대 동시 업로드 파일 개수 */
  MAX_FILES_COUNT: 5,
  /** 전체 요청 최대 크기: 30MB (5MB * 5 files + overhead) */
  MAX_REQUEST_SIZE: 30 * 1024 * 1024,
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

/**
 * DB 커넥션 풀 설정
 */
export const DATABASE_POOL = {
  /** 최대 커넥션 수 */
  MAX: 20,
  /** 커넥션 타임아웃 (ms) */
  CONNECTION_TIMEOUT_MS: 30_000,
  /** 유휴 타임아웃 (ms) */
  IDLE_TIMEOUT_MS: 10_000,
  /** 재시도 횟수 */
  RETRY_ATTEMPTS: 3,
  /** 재시도 간격 (ms) */
  RETRY_DELAY_MS: 3_000,
} as const;

/**
 * 배치 처리 관련 상수
 */
export const BATCH_CONFIG = {
  /** 최대 재시도 횟수 */
  MAX_RETRY_COUNT: 3,
  /** Advisory Lock 타임아웃 (ms): 5분 */
  ADVISORY_LOCK_TIMEOUT_MS: 5 * 60 * 1000,
  /** 결과 처리 청크 크기 */
  RESULT_CHUNK_SIZE: 100,
  /** 과거 데이터 조회 제한 (개월) */
  HISTORY_LIMIT_MONTHS: 6,
} as const;

/**
 * SSE (Server-Sent Events) 설정
 */
export const SSE_CONFIG = {
  /** 서버 사이드 타임아웃 (ms): 3분 */
  SERVER_TIMEOUT_MS: 3 * 60 * 1000,
} as const;

/**
 * 스케줄러 분산 락 이름
 */
export const SCHEDULER_LOCKS = {
  PREFERENCES_BATCH: 'preferences_batch_submit',
  PREFERENCES_BATCH_RESULT: 'preferences_batch_result',
  PREFERENCES_RETRY: 'preferences_retry_batch',
  NOTIFICATION_PUBLISH: 'notification_publish',
  RATING_AGGREGATE_UPDATE: 'rating_aggregate_update',
} as const;
