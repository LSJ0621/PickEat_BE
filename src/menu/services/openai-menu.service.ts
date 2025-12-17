import { Injectable, Logger } from '@nestjs/common';
import { Gpt51MenuService } from '../gpt/gpt51-menu.service';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';

/**
 * OpenAI 메뉴 추천 서비스
 * 현재는 GPT-5.1 기반 메뉴 서비스만 사용 (Gpt51MenuService)
 */
@Injectable()
export class OpenAiMenuService {
  private readonly logger = new Logger(OpenAiMenuService.name);
  private readonly menuService: Gpt51MenuService;

  constructor(private readonly gpt51MenuService: Gpt51MenuService) {
    this.menuService = this.gpt51MenuService;
    this.logger.log('✅ GPT-5.1 메뉴 추천 서비스 사용 (Gpt51MenuService)');
  }

  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
  ): Promise<MenuRecommendationsResponse> {
    return this.menuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
    );
  }
}
