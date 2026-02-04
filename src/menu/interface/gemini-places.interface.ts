/**
 * Gemini place recommendation item
 * V1 compatible fields with V2 extensions
 */
export interface GeminiPlaceRecommendation {
  // V1 호환 필드
  placeId: string | null; // Google Place ID (Maps Grounding) or null
  name: string; // 가게명
  reason: string; // 추천 이유 (100-300자)
  menuName?: string; // 메뉴명 (요청 시 전달된 값)
  source: 'GEMINI'; // 데이터 소스

  // V2 확장 필드 (옵셔널)
  address?: string; // 주소
  location?: {
    // 위치 좌표
    latitude: number;
    longitude: number;
  };

  // Multilingual support
  localizedName?: string; // UI 표시용 (사용자 언어)
  localizedAddress?: string; // UI 표시용 (사용자 언어)
  searchName?: string; // 블로그 검색용 (현지 언어)
  searchAddress?: string; // 블로그 검색용 (현지 언어)
}

/**
 * Gemini place recommendations response
 */
export interface GeminiPlaceRecommendationsResponse {
  recommendations: GeminiPlaceRecommendation[];
  searchEntryPointHtml?: string; // Google ToS: Search Grounding 사용 시 필수 렌더링 (현재 미구현)
  googleMapsWidgetContextToken?: string; // Maps Grounding 위젯 렌더링용 토큰
}
