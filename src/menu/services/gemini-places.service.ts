import { Injectable, Logger } from '@nestjs/common';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';
import { buildUnifiedGroundingPrompt } from '@/external/gemini/prompts/place-recommendation.prompts';
import {
  GeminiPlaceRecommendation,
  GeminiPlaceRecommendationsResponse,
} from '../interface/gemini-places.interface';

@Injectable()
export class GeminiPlacesService {
  private readonly logger = new Logger(GeminiPlacesService.name);

  constructor(private readonly geminiClient: GeminiClient) {}

  /**
   * Gemini로 맛집 추천 (통합 Grounding: Search + Maps, 1회 API 호출)
   * @param menuName 메뉴명
   * @param address 주소
   * @param latitude 위도
   * @param longitude 경도
   * @param language 언어 (ko | en)
   * @returns Gemini 맛집 추천 응답
   */
  async recommendRestaurants(
    menuName: string,
    address: string,
    latitude: number,
    longitude: number,
    language: 'ko' | 'en' = 'ko',
  ): Promise<GeminiPlaceRecommendationsResponse> {
    this.logger.log(`🍴 [GeminiPlacesService] 레스토랑 추천 시작`);
    this.logger.log(`  메뉴: ${menuName}, 주소: ${address}`);
    this.logger.log(`  좌표: (${latitude}, ${longitude}), 언어: ${language}`);

    // 통합 프롬프트 빌드
    const unifiedPrompt = buildUnifiedGroundingPrompt({
      menuName,
      address,
      latitude,
      longitude,
      language,
      maxCount: 5,
    });

    // 통합 호출 실행 (1회 API 호출)
    const response = await this.geminiClient.searchRestaurantsUnified(
      unifiedPrompt,
      latitude,
      longitude,
      language,
    );

    const { restaurants, googleMapsWidgetContextToken } = response;

    // Transform to GeminiPlaceRecommendation[]
    const recommendations = restaurants.map((restaurant) => {
      const recommendation: GeminiPlaceRecommendation = {
        placeId: restaurant.placeId,
        name: restaurant.name,
        reason: restaurant.reason,
        menuName,
        source: 'GEMINI',
        address: restaurant.address,
        location:
          restaurant.latitude !== undefined &&
          restaurant.longitude !== undefined
            ? {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
              }
            : undefined,
        // Multilingual support
        searchName: restaurant.localizedName || restaurant.name, // 블로그 검색용 (현지 언어 우선)
        searchAddress: restaurant.localizedAddress || restaurant.address, // 블로그 검색용 (현지 언어 우선)
        localizedName: restaurant.localizedName, // 사용자 언어 (UI용)
        localizedAddress: restaurant.localizedAddress, // 사용자 언어 (UI용)
      };

      return recommendation;
    });

    this.logger.log(
      `✅ [GeminiPlacesService] 추천 완료: ${recommendations.length}개 가게`,
    );

    return {
      recommendations,
      searchEntryPointHtml: undefined, // Google ToS: 현재는 undefined, 향후 필요시 구현
      googleMapsWidgetContextToken,
    };
  }
}
