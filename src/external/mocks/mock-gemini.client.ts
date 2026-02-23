import { Injectable, Logger } from '@nestjs/common';
import { GeminiSearchResponse } from '../gemini/gemini.types';

/**
 * Gemini API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockGeminiClient {
  private readonly logger = new Logger(MockGeminiClient.name);

  async searchRestaurantsUnified(
    prompt: string,
    latitude: number,
    longitude: number,
    language: 'ko' | 'en' = 'ko',
  ): Promise<GeminiSearchResponse> {
    this.logger.log(
      `[MOCK] Gemini searchRestaurantsUnified: prompt="${prompt.substring(0, 50)}...", location=(${latitude}, ${longitude}), language="${language}"`,
    );

    // Fixed test data with blog links and placeIds (real Google Place ID format)
    return {
      success: true,
      restaurants: [
        {
          nameKo: '테스트 맛집 1',
          nameEn: 'Test Restaurant 1',
          nameLocal: null,
          reason:
            '신선한 재료와 정성스러운 조리로 많은 손님들에게 사랑받는 곳입니다. 특히 점심 시간대에 인기가 많으며 가성비가 좋습니다.',
          reasonTags: ['신선한 재료', '가성비', '점심 추천'],
          placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', // Real Google Place ID format
          addressKo: '서울특별시 강남구 테헤란로 123',
          addressEn: '123 Teheran-ro, Gangnam-gu, Seoul',
          addressLocal: null,
          latitude: 37.5012,
          longitude: 127.0396,
        },
        {
          nameKo: '테스트 맛집 2',
          nameEn: 'Test Restaurant 2',
          nameLocal: null,
          reason:
            '분위기 좋고 서비스가 친절한 곳으로 유명합니다. 메뉴가 다양하고 맛도 훌륭하여 재방문율이 높습니다.',
          reasonTags: ['친절한 서비스', '다양한 메뉴', '재방문 높음'],
          placeId: 'ChIJLwPMoJymQTURkgM1Y27Tk9Y', // Real Google Place ID format
          addressKo: '서울특별시 강남구 역삼동 456',
          addressEn: '456 Yeoksam-dong, Gangnam-gu, Seoul',
          addressLocal: null,
          latitude: 37.5005,
          longitude: 127.0365,
        },
        {
          nameKo: '테스트 맛집 3',
          nameEn: 'Test Restaurant 3',
          nameLocal: null,
          reason:
            '오랜 전통을 자랑하는 맛집으로 현지인들에게 특히 인기가 많습니다. 가격도 합리적이며 양도 푸짐합니다.',
          reasonTags: ['오랜 전통', '현지인 맛집', '푸짐한 양'],
          placeId: null, // Maps Grounding에서 placeId를 찾지 못한 경우
          addressKo: '서울특별시 강남구 삼성동 789',
          addressEn: '789 Samsung-dong, Gangnam-gu, Seoul',
          addressLocal: null,
          latitude: 37.5088,
          longitude: 127.0632,
        },
      ],
      googleMapsWidgetContextToken: 'mock_widget_token_123',
    };
  }
}
