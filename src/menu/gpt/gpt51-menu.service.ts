import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MENU_RECOMMENDATIONS_JSON_SCHEMA } from '@/external/openai/prompts';
import { OPENAI_CONFIG } from '../../external/openai/openai.constants';
import { PrometheusService } from '../../prometheus/prometheus.service';
import { BaseMenuService } from './base-menu.service';

/**
 * 메뉴 추천 서비스 (모델: GPT-5.1 계열)
 */
@Injectable()
export class Gpt51MenuService extends BaseMenuService {
  /**
   * 메뉴 추천용 LLM 모델
   * 우선순위:
   * 1) OPENAI_MENU_MODEL
   * 2) OPENAI_MODEL
   * 3) 기본값: OPENAI_CONFIG.DEFAULT_MODEL
   *
   * 실제 계정에서 사용 가능한 모델명은 OpenAI 대시보드/문서를 참고해
   * 환경변수(특히 OPENAI_MENU_MODEL)에 설정하는 것을 권장.
   */
  private readonly model: string;

  constructor(
    config: ConfigService,
    prometheusService: PrometheusService,
  ) {
    super('Gpt51MenuService', config, prometheusService);
    this.model =
      this.config.get<string>('OPENAI_MENU_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      OPENAI_CONFIG.DEFAULT_MODEL;
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
      // 필요 시 환경변수 또는 상위 레벨에서 토큰/옵션 제어
    };
  }
}
