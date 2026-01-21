import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { ValidationContext } from '../interfaces/menu-validation.interface';
import {
  buildUserPrompt,
  buildUserPromptWithValidation,
  getMenuRecommendationsJsonSchema,
  getSystemPrompt,
} from '@/external/openai/prompts';
import {
  OpenAIChatCompletionParams,
  OpenAIResponse,
} from '@/external/openai/openai.types';

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
    validationContext?: ValidationContext,
    language: 'ko' | 'en' = 'ko',
  ): Promise<MenuRecommendationsResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is not configured',
      );
    }

    const systemPrompt = getSystemPrompt(language);
    const userPrompt = validationContext
      ? buildUserPromptWithValidation(
          prompt,
          likes,
          dislikes,
          analysis,
          validationContext,
          language,
        )
      : buildUserPrompt(prompt, likes, dislikes, analysis, language);
    const jsonSchema = getMenuRecommendationsJsonSchema(language);

    try {
      const requestParams = this.buildRequestParams(
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      const response = await this.openai.chat.completions.create(requestParams);

      const openAIResponse = response as unknown as OpenAIResponse;
      const usage = openAIResponse.usage;

      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokensRaw =
          usage.total_tokens ?? promptTokens + completionTokens;
        this.logger.log(
          `[Menu recommendation LLM token usage] model=${this.getModel()}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new OpenAIResponseException(
          'No recommendations found.',
          response,
        );
      }

      const content = choice.message?.content;
      const finishReason = choice.finish_reason;

      if (!content) {
        throw new OpenAIResponseException('Response content is empty.', {
          finishReason,
        });
      }

      const parsed = JSON.parse(content) as MenuRecommendationsResponse;
      const recommendations = parsed.recommendations || [];
      const reason = parsed.reason?.trim() ?? '';

      if (!recommendations.length) {
        throw new OpenAIResponseException('No recommendations found.', parsed);
      }

      if (!reason) {
        throw new OpenAIResponseException(
          'Recommendation reason is missing.',
          parsed,
        );
      }

      const normalized = this.normalizeMenuNames(recommendations, language);

      this.logger.log(`[Menu recommendation] Count: ${normalized.length}`);

      return { recommendations: normalized, reason };
    } catch (error) {
      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to generate menu recommendations.',
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
    jsonSchema: ReturnType<typeof getMenuRecommendationsJsonSchema>,
  ): OpenAIChatCompletionParams;

  /**
   * 메뉴명 정규화: 괄호, 불필요한 문자 제거, 한글/영어 메뉴명 지원
   *
   * Note: Normalization is character-based (detects Korean/English from menu names)
   * rather than language parameter-based for more robust handling of mixed contexts.
   */
  protected normalizeMenuNames(
    menuNames: string[],
    _language: 'ko' | 'en' = 'ko',
  ): string[] {
    return menuNames
      .map((name) => {
        // Remove content in parentheses
        let normalized = name.replace(/\([^)]*\)/g, '').trim();
        // Remove extra whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Accept Korean-only or English-only menu names
        const koreanMatch = normalized.match(/^[가-힣\s]+$/);
        const englishMatch = normalized.match(/^[a-zA-Z\s]+$/);

        if (koreanMatch) {
          // Korean: remove all whitespace
          return normalized.replace(/\s+/g, '');
        } else if (englishMatch) {
          // English: lowercase with spaces preserved
          return normalized.toLowerCase();
        }

        return null; // Reject mixed or invalid names
      })
      .filter((name): name is string => name !== null && name.length > 0)
      .filter((name, index, array) => array.indexOf(name) === index);
  }
}
