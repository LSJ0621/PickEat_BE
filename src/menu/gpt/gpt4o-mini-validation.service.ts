import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import {
  elapsedSeconds,
  mapStatusGroupFromError,
  parseTokens,
} from '@/common/utils/metrics.util';
import { PrometheusService } from '@/prometheus/prometheus.service';
import {
  buildValidationUserPrompt,
  VALIDATION_JSON_SCHEMA,
  VALIDATION_SYSTEM_PROMPT,
} from '@/external/openai/prompts/menu-validation.prompts';
import { ValidationResponse } from '../interfaces/menu-validation.interface';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { OpenAIResponse } from '@/external/openai/openai.types';
import {
  EXTERNAL_SERVICES,
  PROMETHEUS_ENDPOINTS,
} from '@/common/constants/prometheus.constants';
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

  constructor(
    private readonly config: ConfigService,
    private readonly prometheusService: PrometheusService,
  ) {
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

    const startedAt = Date.now();

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
        const totalTokens = parseTokens(totalTokensRaw);

        this.logger.log(
          `[Stage 1 validation token usage] model=${this.model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );

        if (this.prometheusService && Number.isFinite(totalTokens)) {
          this.prometheusService.recordAiSuccess(
            PROMETHEUS_ENDPOINTS.MENU_VALIDATION,
            totalTokens,
          );
        }
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

      // Prometheus 메트릭 기록 (요청 지연 + 외부 API)
      if (this.prometheusService) {
        const durationSeconds = elapsedSeconds(startedAt);
        this.prometheusService.recordAiDuration(
          PROMETHEUS_ENDPOINTS.MENU_VALIDATION,
          durationSeconds,
        );
        this.prometheusService.recordExternalApi(
          EXTERNAL_SERVICES.OPENAI,
          '2xx',
          durationSeconds,
        );
      }

      return parsed;
    } catch (error) {
      // Prometheus 실패 메트릭 기록
      if (this.prometheusService) {
        this.prometheusService.recordAiError(
          PROMETHEUS_ENDPOINTS.MENU_VALIDATION,
        );
        const durationSeconds = elapsedSeconds(startedAt);
        this.prometheusService.recordAiDuration(
          PROMETHEUS_ENDPOINTS.MENU_VALIDATION,
          durationSeconds,
        );
        const statusGroup = mapStatusGroupFromError(error);
        this.prometheusService.recordExternalApi(
          EXTERNAL_SERVICES.OPENAI,
          statusGroup,
          durationSeconds,
        );
      }

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
