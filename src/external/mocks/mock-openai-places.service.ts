import { Injectable, Logger } from '@nestjs/common';
import {
  PlaceCandidate,
  PlaceRecommendationsResponse,
} from '@/menu/interface/openai-places.interface';
import { mockGooglePlacesResponses } from './fixtures';

/**
 * OpenAiPlacesService Mock 구현
 * E2E 테스트 시 실제 OpenAI API 호출 대신 사용
 */
@Injectable()
export class MockOpenAiPlacesService {
  private readonly logger = new Logger(MockOpenAiPlacesService.name);

  async recommendFromGooglePlaces(
    query: string,
    candidates: PlaceCandidate[],
  ): Promise<PlaceRecommendationsResponse> {
    this.logger.log(
      `[MOCK] OpenAiPlacesService.recommendFromGooglePlaces: query="${query}", candidates=${candidates.length}`,
    );

    if (!candidates.length) {
      return { recommendations: [] };
    }

    // fixtures의 Google Places 데이터를 기반으로 추천 응답 생성
    const mockPlace = mockGooglePlacesResponses.searchSuccess.places[0];

    return {
      recommendations: [
        {
          placeId: mockPlace.id,
          name: mockPlace.displayName.text,
          reason: '리뷰가 좋고 위치가 편리합니다.',
        },
      ],
    };
  }

  // OnModuleInit 인터페이스 구현 (실제 서비스와 호환성 유지)
  onModuleInit(): void {
    this.logger.log('[MOCK] OpenAiPlacesService initialized');
  }
}
