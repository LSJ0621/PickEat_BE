import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import { mapStatusGroupFromError, parseTokens } from '../../common/utils/metrics.util';
import { OPENAI_CONFIG } from '../../external/openai/openai.constants';
import { PrometheusService } from '../../prometheus/prometheus.service';
import {
  PlaceCandidate,
  PlaceRecommendationsResponse,
} from '../interface/openai-places.interface';
import {
  GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA,
  GOOGLE_PLACES_SYSTEM_PROMPT,
  buildGooglePlacesUserPrompt,
} from '../prompts/google-places-recommendation.prompts';

@Injectable()
export class OpenAiPlacesService implements OnModuleInit {
  private readonly logger = new Logger(OpenAiPlacesService.name);
  private openai: OpenAI | null = null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prometheusService: PrometheusService,
  ) {
    this.model =
      this.config.get<string>('OPENAI_PLACES_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      OPENAI_CONFIG.DEFAULT_MODEL;
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

  async recommendFromGooglePlaces(
    query: string,
    candidates: PlaceCandidate[],
  ): Promise<PlaceRecommendationsResponse> {
    if (!this.openai) {
      throw new InternalServerErrorException(
        'OpenAI API key is not configured',
      );
    }

    if (!candidates.length) {
      return { recommendations: [] };
    }

    const systemPrompt = GOOGLE_PLACES_SYSTEM_PROMPT;
    const userPrompt = buildGooglePlacesUserPrompt(query, candidates);
    const jsonSchema = GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA;

    const startedAt = Date.now();
    const extService = 'openai';

    this.logger.log(
      `📤 [OpenAI 장소 추천 요청 시작] model=${this.model}, candidates=${candidates.length}`,
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'google_places_recommendations',
            schema: jsonSchema,
            strict: true,
          },
        },
        // GPT-5.1 계열: temperature 대신 max_completion_tokens 사용
        max_completion_tokens: 800,
      });

      const duration = Date.now() - startedAt;

      // 토큰 사용량 로깅 (프롬프트/완료/전체)
      const usage: any = (response as any).usage;
      const endpoint = 'places';

      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokensRaw =
          usage.total_tokens ?? promptTokens + completionTokens;
        const totalTokens = parseTokens(totalTokensRaw);

        this.logger.log(
          `🧮 [OpenAI 토큰 사용량] prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );

        // Prometheus 메트릭 기록 (요청 수 + 토큰 사용량)
        if (this.prometheusService && Number.isFinite(totalTokens)) {
          this.prometheusService.recordAiSuccess(endpoint, totalTokens);
        }
        }

      // Prometheus 메트릭 기록 (요청 지연 + 외부 API)
      if (this.prometheusService) {
        this.prometheusService.recordAiDuration(endpoint, duration / 1000);
        this.prometheusService.recordExternalApi(extService, '2xx', duration / 1000);
      }

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new OpenAIResponseException('응답 내용이 비어있습니다', response);
      }

      const parsed = JSON.parse(content) as PlaceRecommendationsResponse;

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new OpenAIResponseException('응답 형식이 올바르지 않습니다', parsed);
      }

      return {
        recommendations: parsed.recommendations,
      };
    } catch (error) {
      const duration = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [OpenAI 장소 추천 에러] 소요 시간=${duration}ms, error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Prometheus 실패 메트릭 기록 (요청 수만 기록)
      if (this.prometheusService) {
        this.prometheusService.recordAiError('places');
        this.prometheusService.recordAiDuration('places', duration / 1000);
        const statusGroup = mapStatusGroupFromError(error);
        this.prometheusService.recordExternalApi(extService, statusGroup, duration / 1000);
      }

      throw new InternalServerErrorException(
        'Failed to fetch place recommendations',
      );
    }
  }

}
