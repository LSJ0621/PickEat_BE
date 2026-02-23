/**
 * 커뮤니티 등록 장소 후보
 */
export interface CommunityPlaceCandidate {
  id: number;
  name: string;
  address: string;
  menuTypes: string[];
  category: string;
  description: string | null;
  distance: number;
}

/**
 * 커뮤니티 장소 추천 결과
 */
export interface CommunityPlaceRecommendationResult {
  userPlaceId: number;
  name: string;
  address: string;
  matchReason: string;
  matchReasonTags: string[];
  matchScore: number;
}

/**
 * OpenAI 커뮤니티 장소 추천 응답
 */
export interface CommunityPlacesRecommendationResponse {
  recommendations: CommunityPlaceRecommendationResult[];
}
