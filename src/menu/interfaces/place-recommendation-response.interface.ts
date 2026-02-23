import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';

/**
 * Single place recommendation item returned to frontend
 */
export interface PlaceRecommendationItem {
  /** Google Place ID or null (Maps Grounding 실패 시) */
  placeId: string | null;
  name: string;
  reason: string;
  reasonTags: string[];
  menuName?: string;
  source?: PlaceRecommendationSource;
  userPlaceId?: number;

  // V2 확장 필드 (Gemini 통합 Grounding에서 제공)
  /** 주소 - Gemini Maps Grounding에서 제공 */
  address?: string;
  /** 위치 좌표 - Gemini Maps Grounding에서 제공 */
  location?: {
    latitude: number;
    longitude: number;
  };

  /** Multilingual support - UI 표시용 (사용자 언어) */
  localizedName?: string;
  localizedAddress?: string;
  /** 블로그 검색용 (현지 언어) */
  searchName?: string;
  searchAddress?: string;
}

/**
 * Place recommendation response wrapper
 */
export interface PlaceRecommendationResponse {
  recommendations: PlaceRecommendationItem[];
}
