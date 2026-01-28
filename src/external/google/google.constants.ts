/**
 * Google API 버전
 */
export const GOOGLE_API_VERSION = 'v1';

/**
 * Google Places API 설정
 */
export const GOOGLE_PLACES_CONFIG = {
  BASE_URL: `https://places.googleapis.com/${GOOGLE_API_VERSION}`,
  ENDPOINTS: {
    SEARCH_TEXT: '/places:searchText',
    DETAILS: (placeId: string) => `/places/${placeId}`,
    PHOTO: (photoName: string) => `/${photoName}/media`,
    AUTOCOMPLETE: '/places:autocomplete',
  },
  FIELD_MASKS: {
    SEARCH:
      'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.reviews',
    DETAILS:
      'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,photos,reviews,currentOpeningHours.openNow',
    DETAILS_WITH_BUSINESS_STATUS:
      'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,businessStatus,photos,reviews,currentOpeningHours.openNow',
    ADDRESS_DETAILS: 'formattedAddress,location',
    AUTOCOMPLETE: 'suggestions.placePrediction',
  },
  DEFAULTS: {
    LANGUAGE_CODE: 'ko',
  },
} as const;

/**
 * Google Custom Search Engine API 설정
 */
export const GOOGLE_CSE_CONFIG = {
  BASE_URL: 'https://www.googleapis.com/customsearch/v1',
  DEFAULTS: {
    LANGUAGE: 'ko',
  },
} as const;

/**
 * Google OAuth 설정
 */
export const GOOGLE_OAUTH_CONFIG = {
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  USERINFO_URL: 'https://openidconnect.googleapis.com/v1/userinfo',
} as const;
