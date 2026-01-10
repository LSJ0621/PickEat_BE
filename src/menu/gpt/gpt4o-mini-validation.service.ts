import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import {
  buildValidationUserPrompt,
  VALIDATION_JSON_SCHEMA,
  VALIDATION_SYSTEM_PROMPT,
} from '@/external/openai/prompts/menu-validation.prompts';
import { ValidationResponse } from '../interfaces/menu-validation.interface';
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
  ): Promise<ValidationResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is not configured',
      );
    }

    const systemPrompt = VALIDATION_SYSTEM_PROMPT;
    const validationPrompt = buildValidationUserPrompt(
      userPrompt,
      likes,
      dislikes,
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: validationPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'menu_validation',
            schema: VALIDATION_JSON_SCHEMA,
            strict: true,
          },
        },
        max_tokens: OPENAI_CONFIG.MAX_TOKENS.MENU_VALIDATION,
      });

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
        throw new OpenAIResponseException('검증 결과가 없습니다', response);
      }

      const content = choice.message?.content;
      if (!content) {
        throw new OpenAIResponseException('응답 내용이 비어있습니다', {
          finishReason: choice.finish_reason,
        });
      }

      const parsed = JSON.parse(content) as ValidationResponse;

      this.logger.log(
        `[Stage 1 validation complete] isValid=${parsed.isValid}, intent=${parsed.intent}`,
      );

      return parsed;
    } catch (error) {
      this.logger.error(
        `[Stage 1 validation failed] error=${error instanceof Error ? error.message : String(error)}`,
      );

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        '메뉴 요청 검증에 실패했습니다.',
      );
    }
  }
}
