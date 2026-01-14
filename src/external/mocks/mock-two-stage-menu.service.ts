import { Injectable, Logger } from '@nestjs/common';
import { MenuRecommendationsResponse } from '@/menu/interface/menu-recommendation.interface';

/**
 * TwoStageMenuService Mock 구현
 * E2E 테스트 시 실제 OpenAI API 호출 대신 사용
 */
@Injectable()
export class MockTwoStageMenuService {
  private readonly logger = new Logger(MockTwoStageMenuService.name);

  async generateMenuRecommendations(
    prompt: string,
    _likes: string[],
    _dislikes: string[],
    _analysis?: string,
  ): Promise<MenuRecommendationsResponse> {
    this.logger.log(
      `[MOCK] TwoStageMenuService.generateMenuRecommendations: prompt="${prompt}"`,
    );

    return {
      recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
      reason: '추운 날씨에 딱 맞는 따뜻한 국물 요리입니다.',
    };
  }
}
