import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import {
  buildUserPrompt,
  MENU_RECOMMENDATIONS_JSON_SCHEMA,
  SYSTEM_PROMPT,
} from '../prompts/menu-recommendation.prompts';

/**
 * 공통 메뉴 추천 서비스 베이스 클래스
 */
@Injectable()
export abstract class BaseMenuService implements OnModuleInit {
  protected readonly logger: Logger;
  protected openai: OpenAI;

  constructor(
    loggerName: string,
    protected readonly config: ConfigService,
  ) {
    this.logger = new Logger(loggerName);
  }

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
  ): Promise<string[]> {
    if (!this.openai) {
      throw new InternalServerErrorException(
        'OpenAI API key is not configured',
      );
    }

    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(prompt, likes, dislikes, analysis);
    const jsonSchema = MENU_RECOMMENDATIONS_JSON_SCHEMA;

    const startedAt = Date.now();

    this.logger.log(`📤 [OpenAI 요청 시작] model=${this.getModel()}`);
    this.logger.log(`📋 [System Prompt]\n${systemPrompt}`);
    this.logger.log(`📋 [User Prompt]\n${userPrompt}`);
    this.logger.log(`📋 [JSON Schema]\n${JSON.stringify(jsonSchema, null, 2)}`);
    this.logger.log(
      `📤 [OpenAI 요청] 사용자 요청: "${prompt.substring(0, 50)}..."`,
    );

    try {
      const requestParams = this.buildRequestParams(
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      const response = await this.openai.chat.completions.create(requestParams);

      const duration = Date.now() - startedAt;

      const usage: any = (response as any).usage;
      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        this.logger.log(
          `📊 [메뉴 추천 LLM 토큰 사용량] model=${this.getModel()}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`,
        );
      }

      this.logger.log(
        `📥 [OpenAI 응답 원본] ${JSON.stringify(response, null, 2)}`,
      );

      const choice = response.choices[0];
      if (!choice) {
        throw new OpenAIResponseException('추천 결과가 없습니다', response);
      }

      const content = choice.message?.content;
      const finishReason = choice.finish_reason;

      this.logger.log(
        `📥 [OpenAI 응답 상세] finish_reason=${finishReason}, has_content=${!!content}`,
      );

      if (!content) {
        throw new OpenAIResponseException('응답 내용이 비어있습니다', { finishReason });
      }

      const parsed = JSON.parse(content) as MenuRecommendationsResponse;
      const recommendations = parsed.recommendations || [];

      if (!recommendations.length) {
        throw new OpenAIResponseException('추천 결과가 없습니다', parsed);
      }

      const normalized = this.normalizeMenuNames(recommendations);

      this.logger.log(
        `✅ [OpenAI 응답] 소요 시간: ${duration}ms, 추천 개수: ${normalized.length}`,
      );

      return normalized;
    } catch (error) {
      const duration = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `❌ [OpenAI 에러] 소요 시간: ${duration}ms, 에러: ${errorMessage}`,
        errorStack,
      );

      throw new InternalServerErrorException(
        'Failed to fetch menu recommendations',
      );
    }
  }

  /**
   * 모델명 반환 (하위 클래스에서 구현)
   */
  protected abstract getModel(): string;

  /**
   * 요청 파라미터 구성 (하위 클래스에서 구현)
   */
  protected abstract buildRequestParams(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: typeof MENU_RECOMMENDATIONS_JSON_SCHEMA,
  ): any;

  /**
   * 메뉴명 정규화: 영어 주석, 괄호, 불필요한 문자 제거
   */
  protected normalizeMenuNames(menuNames: string[]): string[] {
    return menuNames
      .map((name) => {
        let normalized = name.replace(/\([^)]*\)/g, '').trim();
        normalized = normalized.replace(/[a-zA-Z]/g, '').trim();
        normalized = normalized.replace(/\s+/g, '');

        const match = normalized.match(/^[가-힣]+$/);
        return match ? match[0] : null;
      })
      .filter((name): name is string => name !== null && name.length > 0)
      .filter((name, index, array) => array.indexOf(name) === index);
  }
}
