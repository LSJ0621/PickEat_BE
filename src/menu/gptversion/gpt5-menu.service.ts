import { Injectable } from '@nestjs/common';
import { BaseMenuService } from './base-menu.service';
import { MENU_RECOMMENDATIONS_JSON_SCHEMA } from '../prompts/menu-recommendation.prompts';

/**
 * GPT-5 모델용 메뉴 추천 서비스
 */
@Injectable()
export class Gpt5MenuService extends BaseMenuService {
  private readonly model = 'gpt-5';

  constructor() {
    super('Gpt5MenuService');
  }

  protected getModel(): string {
    return this.model;
  }

  protected buildRequestParams(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: typeof MENU_RECOMMENDATIONS_JSON_SCHEMA,
  ): any {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'menu_recommendations',
          schema: jsonSchema,
          strict: true,
        },
      },
      // GPT-5는 temperature를 지원하지 않음
      // GPT-5는 reasoning tokens를 사용하므로 더 많은 토큰이 필요
      max_completion_tokens: 2000,
    };
  }
}

