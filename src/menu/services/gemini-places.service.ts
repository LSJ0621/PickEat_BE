import { Injectable, Logger } from '@nestjs/common';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';
import { buildUnifiedGroundingPrompt } from '@/external/gemini/prompts/place-recommendation.prompts';
import {
  GeminiPlaceRecommendation,
  GeminiPlaceRecommendationsResponse,
} from '../interfaces/gemini-places.interface';

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
        nameKo: restaurant.nameKo,
        nameEn: restaurant.nameEn,
        nameLocal: restaurant.nameLocal ?? null,
        reason: restaurant.reason,
        reasonTags: Array.isArray(restaurant.reasonTags)
          ? restaurant.reasonTags
          : [],
        menuName,
        source: 'GEMINI',
        addressKo: restaurant.addressKo,
        addressEn: restaurant.addressEn,
        addressLocal: restaurant.addressLocal ?? null,
        location:
          restaurant.latitude !== undefined &&
          restaurant.longitude !== undefined
            ? {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
              }
            : undefined,
        searchName: restaurant.nameLocal || restaurant.nameKo,
        searchAddress: restaurant.addressLocal || restaurant.addressKo,
      };

      return recommendation;
    });

    this.logger.log(
      `✅ [GeminiPlacesService] 추천 완료: ${recommendations.length}개 가게`,
    );

    return {
      recommendations,
      searchEntryPointHtml: undefined,
      googleMapsWidgetContextToken,
    };
  }
}
