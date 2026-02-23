import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { ValidationContext } from '../interfaces/menu-validation.interface';
import {
  buildUserPrompt,
  buildUserPromptWithValidation,
  getMenuRecommendationsJsonSchema,
  getSystemPrompt,
  type StructuredAnalysis,
} from '@/external/openai/prompts';
import {
  OpenAIChatCompletionParams,
  OpenAIResponse,
} from '@/external/openai/openai.types';
import { normalizeMenuNames } from '@/common/utils/ai-response.util';
import { logOpenAiTokenUsage } from '@/common/utils/openai-token-logger.util';

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
    compactSummary?: string,
    structuredAnalysis?: StructuredAnalysis,
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
          compactSummary,
          structuredAnalysis,
        )
      : buildUserPrompt(
          prompt,
          likes,
          dislikes,
          analysis,
          language,
          compactSummary,
          structuredAnalysis,
        );
    const jsonSchema = getMenuRecommendationsJsonSchema(language);

    try {
      const requestParams = this.buildRequestParams(
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      // Retry OpenAI API call with exponential backoff (max 3 retries)
      const response = await retryWithExponentialBackoff(
        () => this.openai.chat.completions.create(requestParams),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
        },
        this.logger,
      );

      const openAIResponse = response as unknown as OpenAIResponse;
      logOpenAiTokenUsage(this.logger, this.getModel(), openAIResponse.usage);

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
      const intro = parsed.intro?.trim() ?? '';
      const recommendationItems = parsed.recommendations || [];
      const closing = parsed.closing?.trim() ?? '';

      if (!recommendationItems.length) {
        throw new OpenAIResponseException('No recommendations found.', parsed);
      }

      if (!intro) {
        throw new OpenAIResponseException('Intro text is missing.', parsed);
      }

      if (!closing) {
        throw new OpenAIResponseException('Closing text is missing.', parsed);
      }

      // Normalize menu names in recommendations
      const normalizedRecommendations = recommendationItems.map((item) => ({
        condition: item.condition,
        menu: normalizeMenuNames([item.menu])[0],
      }));

      this.logger.log(
        `[Menu recommendation] Count: ${normalizedRecommendations.length}`,
      );

      return {
        intro,
        recommendations: normalizedRecommendations,
        closing,
      };
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
}
