/**
 * 테스트용 좌표 상수
 */
export const TEST_COORDINATES = {
  GANGNAM: {
    LATITUDE: '37.5012345',
    LONGITUDE: '127.0398765',
    LATITUDE_NUM: 37.5012345,
    LONGITUDE_NUM: 127.0398765,
    POSTAL_CODE: '06234',
    ROAD_ADDRESS: '서울특별시 강남구 테헤란로 123',
  },
  GANGNAM_ALT: {
    LATITUDE: '37.5112345',
    LONGITUDE: '127.0498765',
    LATITUDE_NUM: 37.5112345,
    LONGITUDE_NUM: 127.0498765,
    POSTAL_CODE: '06235',
    ROAD_ADDRESS: '서울특별시 강남구 강남대로 456',
  },
  OTHER: {
    LATITUDE: '37.5999',
    LONGITUDE: '127.0999',
    LATITUDE_NUM: 37.5999,
    LONGITUDE_NUM: 127.0999,
    POSTAL_CODE: '06999',
    ROAD_ADDRESS: '서울특별시 강남구 기타 999',
  },
} as const;

/**
 * 테스트용 타임아웃 상수
 */
export const TEST_TIMEOUTS = {
  E2E_DEFAULT_MS: 30000,
  E2E_BUG_REPORT_MS: 60000,
  UNIT_DEFAULT_MS: 10000,
  TOKEN_IAT_DELAY_MS: 1000,
} as const;

/**
 * 테스트용 ID 상수
 */
export const TEST_IDS = {
  NON_EXISTENT: 99999,
  SOCIAL_ID_KAKAO: '987654321',
  SOCIAL_ID_GOOGLE: '123456789',
} as const;

/**
 * 테스트용 인증 상수
 */
export const TEST_VERIFICATION = {
  CODE: '123456',
  EXPIRES_IN_MS: 5 * 60 * 1000,
} as const;

/**
 * 테스트용 JWT 시크릿 상수
 */
export const TEST_JWT_SECRETS = {
  ACCESS: 'test-jwt-access-token-key-for-e2e-tests',
  REFRESH: 'test-jwt-refresh-token-key-for-e2e-tests',
} as const;
