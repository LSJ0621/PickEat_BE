import { Injectable } from '@nestjs/common';
import { BaseMenuService } from './base-menu.service';
import { MENU_RECOMMENDATIONS_JSON_SCHEMA } from '../prompts/menu-recommendation.prompts';

/**
 * GPT-4o 모델용 메뉴 추천 서비스
 */
@Injectable()
export class Gpt4MenuService extends BaseMenuService {
  private readonly model = 'gpt-4o';

  constructor() {
    super('Gpt4MenuService');
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
      temperature: 0.9,
      max_tokens: 500,
    };
  }
}

