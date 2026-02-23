/**
 * 캐시 TTL (초 단위)
 */
export const CACHE_TTL = {
  /** 사용자 선호도 - 30분 */
  USER_PREFERENCES: 30 * 60,
  /** 사용자 주소 목록 - 30분 */
  USER_ADDRESSES: 30 * 60,
  /** 웹서치 요약 - 7일 */
  WEB_SEARCH_SUMMARY: 7 * 24 * 60 * 60,
  /** 사용자 프로필 - 30분 */
  USER_PROFILE: 30 * 60,
} as const;

/**
 * 캐시 키 빌더
 */
export const CACHE_KEY = {
  /** 사용자 선호도 키 */
  userPreferences: (userId: number) => `user:${userId}:preferences`,
  /** 사용자 주소 목록 키 */
  userAddresses: (userId: number) => `user:${userId}:addresses`,
  /** 사용자 프로필 키 */
  userProfile: (userId: number) => `user:${userId}:profile`,
  /** 웹서치 요약 키 */
  webSearchSummary: (
    region: string,
    ageGroup: string,
    gender: string,
    month: string,
  ) => `ai:websearch:${region}:${ageGroup}:${gender}:${month}`,
} as const;
