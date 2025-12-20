/**
 * Google Places 검색 결과 아이템
 */
export interface GooglePlaceSearchResult {
  id: string;
  displayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  reviews?: GooglePlaceReview[];
}

/**
 * Google Places 리뷰
 */
export interface GooglePlaceReview {
  rating?: number;
  originalText?: { text: string };
  text?: { text: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName: string };
  publishTime?: string;
}

/**
 * Google Places 상세 정보
 */
export interface GooglePlaceDetails {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow: boolean };
  photos?: GooglePlacePhoto[];
  reviews?: GooglePlaceReview[];
}

/**
 * Google Places 사진
 */
export interface GooglePlacePhoto {
  name: string;
}

/**
 * Google Places 검색 응답
 */
export interface GooglePlacesSearchResponse {
  places?: GooglePlaceSearchResult[];
}

/**
 * Google Places 사진 URI 응답
 */
export interface GooglePlacePhotoUriResponse {
  photoUri?: string;
}

/**
 * Google Custom Search 결과 아이템
 */
export interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: {
    cse_thumbnail?: Array<{ src: string }>;
    metatags?: Array<{ 'og:image'?: string; 'og:site_name'?: string }>;
  };
}

/**
 * Google Custom Search 응답
 */
export interface GoogleCseResponse {
  items?: GoogleCseItem[];
}
