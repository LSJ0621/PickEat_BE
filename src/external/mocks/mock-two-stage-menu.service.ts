import { Injectable, Logger } from '@nestjs/common';
import { MenuRecommendationsResponse } from '@/menu/interfaces/menu-recommendation.interface';

/**
 * TwoStageMenuService Mock 구현
 * E2E 테스트 시 실제 OpenAI API 호출 대신 사용
 */
@Injectable()
export class MockTwoStageMenuService {
  private readonly logger = new Logger(MockTwoStageMenuService.name);

  generateMenuRecommendations(
    prompt: string,
    _likes: string[],
    _dislikes: string[],
    _analysis?: string,
  ): Promise<MenuRecommendationsResponse> {
    this.logger.log(
      `[MOCK] TwoStageMenuService.generateMenuRecommendations: prompt="${prompt}"`,
    );

    return Promise.resolve({
      intro:
        '추운 날씨에는 따뜻한 국물 요리가 몸을 녹이고 속을 편안하게 해줍니다. 오늘은 든든하면서도 소화가 잘 되는 찌개류를 추천드립니다.',
      recommendations: [
        { condition: '얼큰하게 속을 풀고 싶다면', menu: '김치찌개' },
        { condition: '구수한 맛을 원한다면', menu: '된장찌개' },
        { condition: '부드럽고 가벼운 걸 원한다면', menu: '순두부찌개' },
      ],
      closing: '따뜻하게 드시고 좋은 하루 보내세요.',
    });
  }
}
