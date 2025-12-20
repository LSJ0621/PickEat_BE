/**
 * 네이버 로컬 검색 API 응답 아이템
 */
export interface NaverLocalSearchItem {
  title: string;
  category?: string;
  description?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  link?: string;
  mapx?: string;
  mapy?: string;
  distance?: string;
}

/**
 * 네이버 로컬 검색 API 전체 응답
 */
export interface NaverLocalSearchResponse {
  total: number;
  display: number;
  start: number;
  items: NaverLocalSearchItem[];
}

/**
 * 레스토랑 요약 정보
 */
export interface RestaurantSummary {
  name: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  mapx?: number;
  mapy?: number;
  distance?: number;
  link?: string;
}

/**
 * 레스토랑 검색 응답
 */
export interface SearchRestaurantsResponse {
  restaurants: RestaurantSummary[];
}
