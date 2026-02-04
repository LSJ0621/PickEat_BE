/**
 * 캐시 TTL (초 단위)
 */
export const CACHE_TTL = {
  /** Google Place 상세정보 - 30일 */
  PLACE_DETAIL: 30 * 24 * 60 * 60,
  /** Google Place 사진 URL - 30일 */
  PHOTO_URL: 30 * 24 * 60 * 60,
  /** 블로그 검색 결과 - 7일 */
  BLOG_SEARCH: 7 * 24 * 60 * 60,
} as const;

/**
 * 캐시 키 빌더
 */
export const CACHE_KEY = {
  /** Google Place 상세정보 키 */
  place: (placeId: string) => `ext:google:place:${placeId}`,
  /** Google Place 사진 URL 키 */
  photo: (photoName: string) => `ext:google:photo:${photoName}`,
  /** 블로그 검색 결과 키 */
  blog: (query: string, language: string) => {
    const normalized = query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace to single spaces first
      .replace(/\s/g, '_') // Then replace with underscores
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
    return `ext:google:blog:${language}:${normalized}`;
  },
} as const;
