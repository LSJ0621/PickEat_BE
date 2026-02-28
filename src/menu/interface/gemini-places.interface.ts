/**
 * Gemini place recommendation item
 * Multilingual fields for DB persistence
 */
export interface GeminiPlaceRecommendation {
  placeId: string | null;
  nameKo: string;
  nameEn: string;
  nameLocal?: string | null;
  reason: string;
  reasonTags: string[];
  menuName?: string;
  source: 'GEMINI';
  addressKo?: string;
  addressEn?: string;
  addressLocal?: string | null;
  location?: { latitude: number; longitude: number };
  searchName?: string; // = nameLocal ?? nameKo (블로그 검색용)
  searchAddress?: string; // = addressLocal ?? addressKo (블로그 검색용)
}

/**
 * Gemini place recommendations response
 */
export interface GeminiPlaceRecommendationsResponse {
  recommendations: GeminiPlaceRecommendation[];
  searchEntryPointHtml?: string; // Google ToS: Search Grounding 사용 시 필수 렌더링 (현재 미구현)
  googleMapsWidgetContextToken?: string; // Maps Grounding 위젯 렌더링용 토큰
}
