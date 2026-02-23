import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import {
  buildValidationUserPrompt,
  getValidationJsonSchema,
  getValidationSystemPrompt,
} from '@/external/openai/prompts/menu-validation.prompts';
import {
  ValidationConstraints,
  ValidationIntent,
  ValidationResponse,
} from '../interfaces/menu-validation.interface';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { OpenAIResponse } from '@/external/openai/openai.types';
import OpenAI from 'openai';

/**
 * Stage 1: GPT-4o-mini 기반 메뉴 요청 검증 서비스
 * 음식 관련 요청인지 빠르게 검증하고 의도를 분류합니다.
 */
@Injectable()
export class Gpt4oMiniValidationService implements OnModuleInit {
  private readonly logger = new Logger(Gpt4oMiniValidationService.name);
  private openai: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.model =
      this.config.get<string>('OPENAI_VALIDATION_MODEL') || 'gpt-4o-mini';
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

    this.logger.log(
      `Stage 1 validation service initialized (model=${this.model})`,
    );
  }

  /**
   * 메뉴 요청 검증 수행
   */
  async validateMenuRequest(
    userPrompt: string,
    likes: string[],
    dislikes: string[],
    language: 'ko' | 'en' = 'ko',
  ): Promise<ValidationResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is not configured',
      );
    }

    const systemPrompt = getValidationSystemPrompt(language);
    const validationPrompt = buildValidationUserPrompt(
      userPrompt,
      likes,
      dislikes,
      language,
    );

    try {
      // Retry OpenAI API call with exponential backoff (max 3 retries)
      const response = await retryWithExponentialBackoff(
        () =>
          this.openai.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: validationPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'menu_validation',
                schema: getValidationJsonSchema(language),
                strict: true,
              },
            },
            max_tokens: OPENAI_CONFIG.MAX_TOKENS.MENU_VALIDATION,
          }),
        {
          maxRetries: 1,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
        },
        this.logger,
      );

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
          `[Stage 1 validation token usage] model=${this.model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new OpenAIResponseException(
          'Validation result not found.',
          response,
        );
      }

      const content = choice.message?.content;
      if (!content) {
        throw new OpenAIResponseException('Response content is empty.', {
          finishReason: choice.finish_reason,
        });
      }

      const parsed = JSON.parse(content);
      const validated = this.validateResponse(parsed);

      this.logger.log(
        `[Stage 1 validation complete] isValid=${validated.isValid}, intent=${validated.intent}`,
      );

      return validated;
    } catch (error) {
      this.logger.error(
        `[Stage 1 validation failed] error=${error instanceof Error ? error.message : String(error)}`,
      );

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to validate menu request.',
      );
    }
  }

  /**
   * ValidationResponse 필수 필드 검증
   */
  private validateResponse(parsed: unknown): ValidationResponse {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new OpenAIResponseException(
        'Invalid validation response format.',
        parsed,
      );
    }

    const response = parsed as Record<string, unknown>;

    // 필수 필드 검증
    if (typeof response.isValid !== 'boolean') {
      throw new OpenAIResponseException(
        'isValid field is missing or invalid.',
        parsed,
      );
    }

    if (typeof response.intent !== 'string') {
      throw new OpenAIResponseException(
        'intent field is missing or invalid.',
        parsed,
      );
    }

    // constraints 검증 (선택적 - 기본값 처리 가능)
    const constraints = response.constraints as
      | ValidationConstraints
      | undefined;
    const validatedConstraints: ValidationConstraints = {
      budget: constraints?.budget || 'medium',
      dietary: Array.isArray(constraints?.dietary) ? constraints.dietary : [],
      urgency: constraints?.urgency || 'normal',
    };

    return {
      isValid: response.isValid,
      invalidReason:
        typeof response.invalidReason === 'string'
          ? response.invalidReason
          : '',
      intent: response.intent as ValidationIntent,
      constraints: validatedConstraints,
      suggestedCategories: Array.isArray(response.suggestedCategories)
        ? response.suggestedCategories
        : [],
    };
  }
}
