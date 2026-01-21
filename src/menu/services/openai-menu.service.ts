import { Injectable, Logger } from '@nestjs/common';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { TwoStageMenuService } from './two-stage-menu.service';

/**
 * OpenAI 메뉴 추천 서비스
 * 2단계 추천 시스템 사용 (TwoStageMenuService)
 * Stage 1: GPT-4o-mini 검증, Stage 2: GPT-5.1 심층 추천
 */
@Injectable()
export class OpenAiMenuService {
  private readonly logger = new Logger(OpenAiMenuService.name);

  constructor(private readonly twoStageMenuService: TwoStageMenuService) {
    this.logger.log(
      'Two-stage menu recommendation service active (Stage 1: GPT-4o-mini, Stage 2: GPT-5.1)',
    );
  }

  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
    language: 'ko' | 'en' = 'ko',
  ): Promise<MenuRecommendationsResponse> {
    return this.twoStageMenuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
      language,
    );
  }
}
