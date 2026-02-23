/**
 * Naver Search API 설정
 */
export const NAVER_SEARCH_CONFIG = {
  BASE_URL: 'https://openapi.naver.com',
  ENDPOINTS: {
    LOCAL_SEARCH: '/v1/search/local.json',
  },
} as const;

/**
 * Naver Map API 설정
 */
export const NAVER_MAP_CONFIG = {
  BASE_URL: 'https://maps.apigw.ntruss.com',
  ENDPOINTS: {
    REVERSE_GEOCODE: '/map-reversegeocode/v2/gc',
  },
} as const;
