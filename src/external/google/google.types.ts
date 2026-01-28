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

/**
 * Google Places API (New) locationBias - Circle
 * @see https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export interface GooglePlacesLocationBiasCircle {
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number; // 0.0 ~ 50000.0 meters
}

export interface GooglePlacesLocationBias {
  circle: GooglePlacesLocationBiasCircle;
}

/**
 * searchByText 메서드 옵션
 */
export interface GooglePlacesSearchByTextOptions {
  /** 최대 결과 수 (pageSize로 변환됨, 1-20) */
  maxResults?: number;
  /** 응답 언어 코드 (ko, en 등) */
  languageCode?: string;
  /** 위치 기반 검색 바이어스 */
  locationBias?: GooglePlacesLocationBias;
}

/**
 * Google Places Text Search 요청 Body (API 문서 기준)
 */
export interface GooglePlacesTextSearchRequestBody {
  textQuery: string;
  languageCode?: string;
  pageSize?: number; // maxResultCount deprecated → pageSize
  locationBias?: GooglePlacesLocationBias;
}

/**
 * Google Places Autocomplete 요청 옵션
 */
export interface GooglePlacesAutocompleteOptions {
  sessionToken?: string;
  languageCode?: string;
  includedRegionCodes?: string[];
  locationBias?: GooglePlacesLocationBias;
}

/**
 * Google Places Autocomplete 응답
 */
export interface GooglePlacesAutocompleteResponse {
  suggestions?: GooglePlacesAutocompleteSuggestion[];
}

/**
 * Google Places Autocomplete 제안 항목
 */
export interface GooglePlacesAutocompleteSuggestion {
  placePrediction?: GooglePlacesPlacePrediction;
}

/**
 * Google Places 장소 예측
 */
export interface GooglePlacesPlacePrediction {
  placeId: string;
  text: { text: string };
  structuredFormat?: {
    mainText: { text: string };
    secondaryText?: { text: string };
  };
}
