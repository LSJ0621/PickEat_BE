import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import {
  buildPreferenceUserPrompt,
  PREFERENCE_RESPONSE_SCHEMA,
  PREFERENCE_SYSTEM_PROMPT,
} from '@/external/openai/prompts';
import { OPENAI_SETTINGS } from '../common/constants/business.constants';
import { OpenAIResponseException } from '../common/exceptions/openai-response.exception';
import {
  elapsedSeconds,
  mapStatusGroupFromError,
  parseTokens,
} from '../common/utils/metrics.util';
import { OPENAI_CONFIG } from '../external/openai/openai.constants';
import { PrometheusService } from '../prometheus/prometheus.service';
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

  constructor(
    private readonly config: ConfigService,
    private readonly prometheusService: PrometheusService,
  ) {
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
    this.logger.log(`✅ Preference LLM 초기화 완료. model=${this.model}`);
  }

  async generatePreferenceAnalysis(
    current: UserPreferences,
    slotMenus: {
      breakfast: string[];
      lunch: string[];
      dinner: string[];
      etc: string[];
    },
  ): Promise<PreferenceAnalysisResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key가 없습니다.',
      );
    }

    const system = PREFERENCE_SYSTEM_PROMPT;
    const user = buildPreferenceUserPrompt({
      currentLikes: current.likes ?? [],
      currentDislikes: current.dislikes ?? [],
      currentAnalysis: current.analysis,
      slotMenus,
    });

    const startedAt = Date.now();
    const extService = 'openai';

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'preference_analysis',
            schema: PREFERENCE_RESPONSE_SCHEMA,
            strict: true,
          },
        },
        // GPT-5.1 계열: temperature 미사용, completion 토큰만 지정
        max_completion_tokens: OPENAI_SETTINGS.PREFERENCE_MAX_TOKENS,
      });
      const usage: any = (response as any).usage;
      const endpoint = 'preference';

      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokensRaw =
          usage.total_tokens ?? promptTokens + completionTokens;
        const totalTokens = parseTokens(totalTokensRaw);
        this.logger.log(
          `📊 [Preference LLM 토큰 사용량] model=${this.model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );

        // Prometheus 메트릭 기록 (토큰 사용량만 기록, 요청 수는 제외)
        if (this.prometheusService && Number.isFinite(totalTokens)) {
          this.prometheusService.recordAiTokensOnly(endpoint, totalTokens);
        }
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIResponseException('응답이 비어있습니다', response);
      }

      this.logger.debug(`[LLM 응답] ${content}`);

      let parsed: PreferenceAnalysisResponse;
      try {
        parsed = JSON.parse(content) as PreferenceAnalysisResponse;
      } catch (parseError) {
        this.logger.error(`[JSON 파싱 실패] ${content}`);
        throw new OpenAIResponseException('JSON 파싱에 실패했습니다', content);
      }

      this.validateSchema(parsed);
      // Prometheus 메트릭 기록 (요청 지연 + 외부 API)
      if (this.prometheusService) {
        const durationSeconds = elapsedSeconds(startedAt);
        this.prometheusService.recordAiDuration(endpoint, durationSeconds);
        this.prometheusService.recordExternalApi(
          extService,
          '2xx',
          durationSeconds,
        );
      }
      return {
        analysis: parsed.analysis.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`❌ [Preference LLM 실패] ${message}`);

      // Prometheus 실패 메트릭 기록 (요청 수는 기록하지 않음, 지연 시간만 기록)
      if (this.prometheusService) {
        const durationSeconds = elapsedSeconds(startedAt);
        this.prometheusService.recordAiDuration('preference', durationSeconds);
        const statusGroup = mapStatusGroupFromError(error);
        this.prometheusService.recordExternalApi(
          extService,
          statusGroup,
          durationSeconds,
        );
      }

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        '취향 분석 생성에 실패했습니다.',
      );
    }
  }

  private validateSchema(data: PreferenceAnalysisResponse) {
    if (!data) {
      this.logger.error(`[스키마 검증 실패] data is null or undefined`);
      throw new OpenAIResponseException('응답 형식이 올바르지 않습니다', data);
    }
    if (typeof data.analysis !== 'string') {
      this.logger.error(
        `[스키마 검증 실패] analysis type is ${typeof data.analysis}, value: ${JSON.stringify(data.analysis)}`,
      );
      throw new OpenAIResponseException('응답 형식이 올바르지 않습니다', data);
    }
    if (!data.analysis.trim()) {
      this.logger.error(`[스키마 검증 실패] analysis is empty string`);
      throw new OpenAIResponseException('분석 결과가 비어있습니다', data);
    }
  }
}
