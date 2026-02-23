import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import {
  buildPreferenceUserPrompt,
  getPreferenceSystemPrompt,
  getPreferenceResponseSchema,
} from '@/external/openai/prompts';
import { OPENAI_SETTINGS } from '../common/constants/business.constants';
import { OpenAIResponseException } from '../common/exceptions/openai-response.exception';
import { OPENAI_CONFIG } from '../external/openai/openai.constants';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import { PreferenceAnalysisResponse } from './interfaces/preference-analysis.interface';
import { UserPreferences } from './interfaces/user-preferences.interface';

@Injectable()
export class PreferenceUpdateAiService implements OnModuleInit {
  private readonly logger = new Logger(PreferenceUpdateAiService.name);
  private openai: OpenAI | null = null;
  /**
   * 취향 분석 전용 모델
   * 우선순위:
   * 1) OPENAI_PREFERENCE_MODEL (취향 분석 전용)
   * 2) OPENAI_MODEL (글로벌 기본 모델)
   * 3) 기본값: OPENAI_CONFIG.DEFAULT_MODEL
   */
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.model =
      this.config.get<string>('OPENAI_PREFERENCE_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      OPENAI_CONFIG.DEFAULT_MODEL;
  }

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }
    this.openai = new OpenAI({ apiKey });
    this.logger.log(`Preference LLM 초기화 완료. model=${this.model}`);
  }

  async generatePreferenceAnalysis(
    current: UserPreferences,
    slotMenus: {
      breakfast: string[];
      lunch: string[];
      dinner: string[];
      etc: string[];
    },
    preferredLanguage?: string,
  ): Promise<PreferenceAnalysisResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is missing.',
      );
    }

    const language = this.mapPreferredLanguage(preferredLanguage);
    const system = getPreferenceSystemPrompt(language);
    const user = buildPreferenceUserPrompt({
      currentLikes: current.likes ?? [],
      currentDislikes: current.dislikes ?? [],
      currentAnalysis: current.analysis,
      slotMenus,
      language,
    });

    try {
      const response = await retryWithExponentialBackoff(
        () =>
          this.openai!.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'preference_analysis',
                schema: getPreferenceResponseSchema(language).json_schema
                  .schema as Record<string, unknown>,
                strict: true,
              },
            },
            // GPT-5.1 계열: temperature 미사용, completion 토큰만 지정
            max_completion_tokens: OPENAI_SETTINGS.PREFERENCE_MAX_TOKENS,
          }),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
        },
        this.logger,
      );
      const usage = (
        response as {
          usage?: {
            prompt_tokens?: number;
            input_tokens?: number;
            completion_tokens?: number;
            output_tokens?: number;
            total_tokens?: number;
          };
        }
      ).usage;

      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokensRaw =
          usage.total_tokens ?? promptTokens + completionTokens;
        this.logger.log(
          `📊 [Preference LLM 토큰 사용량] model=${this.model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIResponseException('Response is empty.', response);
      }

      this.logger.debug(`[LLM 응답] ${content}`);

      let parsed: PreferenceAnalysisResponse;
      try {
        parsed = JSON.parse(content) as PreferenceAnalysisResponse;
      } catch {
        this.logger.error(`[JSON 파싱 실패] ${content}`);
        throw new OpenAIResponseException('Failed to parse JSON.', content);
      }

      this.validateSchema(parsed);
      return {
        analysis: parsed.analysis.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`[Preference LLM 실패] ${message}`);

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to generate preference analysis.',
      );
    }
  }

  private validateSchema(data: PreferenceAnalysisResponse) {
    if (!data) {
      this.logger.error(`[스키마 검증 실패] data is null or undefined`);
      throw new OpenAIResponseException('Invalid response format.', data);
    }
    if (typeof data.analysis !== 'string') {
      this.logger.error(
        `[스키마 검증 실패] analysis type is ${typeof data.analysis}, value: ${JSON.stringify(data.analysis)}`,
      );
      throw new OpenAIResponseException('Invalid response format.', data);
    }
    if (!data.analysis.trim()) {
      this.logger.error(`[스키마 검증 실패] analysis is empty string`);
      throw new OpenAIResponseException('Analysis result is empty.', data);
    }
  }

  private mapPreferredLanguage(
    preferredLanguage?: string,
  ): 'ko' | 'en' | undefined {
    if (!preferredLanguage) return undefined;
    return preferredLanguage === 'en' ? 'en' : 'ko';
  }
}
