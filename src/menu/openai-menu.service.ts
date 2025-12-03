import { Injectable, Logger } from '@nestjs/common';
import { Gpt4MenuService } from './gptversion/gpt4-menu.service';
import { Gpt5MenuService } from './gptversion/gpt5-menu.service';

/**
 * OpenAI 메뉴 추천 서비스 팩토리
 * 환경변수 OPENAI_MODEL 또는 OPENAI_GPT_VERSION에 따라 GPT-4 또는 GPT-5를 선택
 */
@Injectable()
export class OpenAiMenuService {
  private readonly logger = new Logger(OpenAiMenuService.name);
  private readonly menuService: Gpt4MenuService | Gpt5MenuService;

  constructor(
    private readonly gpt4MenuService: Gpt4MenuService,
    private readonly gpt5MenuService: Gpt5MenuService,
  ) {
    // 환경변수로 모델 선택 (기본값: gpt-4o)
    const gptVersion = process.env.OPENAI_GPT_VERSION || '4';
    const model = process.env.OPENAI_MODEL;

    // OPENAI_MODEL이 명시되어 있으면 모델명으로 판단
    if (model) {
      if (model.startsWith('gpt-5')) {
        this.menuService = this.gpt5MenuService;
        this.logger.log(`✅ GPT-5 모델 선택: ${model}`);
      } else {
        this.menuService = this.gpt4MenuService;
        this.logger.log(`✅ GPT-4 모델 선택: ${model}`);
      }
    } else {
      // OPENAI_GPT_VERSION으로 판단
      if (gptVersion === '5') {
        this.menuService = this.gpt5MenuService;
        this.logger.log('✅ GPT-5 모델 선택 (OPENAI_GPT_VERSION=5)');
      } else {
        this.menuService = this.gpt4MenuService;
        this.logger.log('✅ GPT-4 모델 선택 (기본값)');
      }
    }
  }

  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
  ): Promise<string[]> {
    return this.menuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
    );
  }
}
