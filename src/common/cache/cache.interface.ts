/**
 * Redis에 캐싱되는 Google Place 상세정보 인터페이스
 */
export interface CachedPlaceDetail {
  id: string;
  name: string;
  address: string;
  location: { latitude: number; longitude: number };
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  businessStatus: string | null;
  openNow: boolean | null;
  photos: string[];
  reviews: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: string;
  }> | null;
  cachedAt: string;
}

/**
 * Redis에 캐싱되는 블로그 검색 결과 인터페이스
 */
export interface CachedBlogSearchResult {
  blogs: Array<{
    title: string | null;
    url: string | null;
    snippet: string | null;
    thumbnailUrl: string | null;
    source: string | null;
  }>;
  cachedAt: string;
}
