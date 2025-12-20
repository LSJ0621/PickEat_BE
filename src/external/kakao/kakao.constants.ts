/**
 * Kakao Local API 설정
 */
export const KAKAO_LOCAL_CONFIG = {
  BASE_URL: 'https://dapi.kakao.com',
  ENDPOINTS: {
    ADDRESS_SEARCH: '/v2/local/search/address.json',
    KEYWORD_SEARCH: '/v2/local/search/keyword.json',
  },
  DEFAULTS: {
    ANALYZE_TYPE: 'similar',
    PAGE_SIZE: 10,
  },
} as const;

/**
 * Kakao OAuth 설정
 */
export const KAKAO_OAUTH_CONFIG = {
  TOKEN_URL: 'https://kauth.kakao.com/oauth/token',
  USER_INFO_URL: 'https://kapi.kakao.com/v2/user/me',
} as const;
