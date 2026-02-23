/**
 * Google Places API에서 가져온 장소 후보
 */
export interface PlaceCandidate {
  id: string;
  name: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: string | null;
  reviews?: Array<{
    rating: number | null;
    originalText: string | null;
    relativePublishTimeDescription: string | null;
  }> | null;
}

/**
 * OpenAI 장소 추천 응답
 */
export interface PlaceRecommendationsResponse {
  recommendations: Array<{
    placeId: string;
    name: string;
    reason: string;
    reasonTags: string[];
  }>;
}
