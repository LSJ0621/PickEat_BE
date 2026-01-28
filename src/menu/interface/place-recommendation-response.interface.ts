import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';

/**
 * Single place recommendation item returned to frontend
 */
export interface PlaceRecommendationItem {
  placeId: string;
  name: string;
  reason: string;
  menuName?: string;
  source?: PlaceRecommendationSource;
  userPlaceId?: number;
}

/**
 * Place recommendation response wrapper
 */
export interface PlaceRecommendationResponse {
  recommendations: PlaceRecommendationItem[];
}
