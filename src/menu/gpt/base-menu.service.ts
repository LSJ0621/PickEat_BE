import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import {
  elapsedSeconds,
  mapStatusGroupFromError,
  parseTokens,
} from '../../common/utils/metrics.util';
import { PrometheusService } from '../../prometheus/prometheus.service';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import {
  buildUserPrompt,
  MENU_RECOMMENDATIONS_JSON_SCHEMA,
  SYSTEM_PROMPT,
} from '@/external/openai/prompts';

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
    protected readonly prometheusService: PrometheusService,
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
  ): Promise<MenuRecommendationsResponse> {
    if (!this.openai) {
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is not configured',
      );
    }

    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(prompt, likes, dislikes, analysis);
    const jsonSchema = MENU_RECOMMENDATIONS_JSON_SCHEMA;

    const startedAt = Date.now();
    const extService = 'openai';

    try {
      const requestParams = this.buildRequestParams(
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      const response = await this.openai.chat.completions.create(requestParams);

      const usage: any = (response as any).usage;
      const endpoint = 'menu';

      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokensRaw =
          usage.total_tokens ?? promptTokens + completionTokens;
        const totalTokens = parseTokens(totalTokensRaw);
        this.logger.log(
          `📊 [메뉴 추천 LLM 토큰 사용량] model=${this.getModel()}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );

        // Prometheus 메트릭 기록 (요청 수 + 토큰 사용량)
        if (this.prometheusService && Number.isFinite(totalTokens)) {
          this.prometheusService.recordAiSuccess(endpoint, totalTokens);
        }
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new OpenAIResponseException('추천 결과가 없습니다', response);
      }

      const content = choice.message?.content;
      const finishReason = choice.finish_reason;

      if (!content) {
        throw new OpenAIResponseException('응답 내용이 비어있습니다', {
          finishReason,
        });
      }

      const parsed = JSON.parse(content) as MenuRecommendationsResponse;
      const recommendations = parsed.recommendations || [];
      const reason = parsed.reason?.trim() ?? '';

      if (!recommendations.length) {
        throw new OpenAIResponseException('추천 결과가 없습니다', parsed);
      }

      if (!reason) {
        throw new OpenAIResponseException('추천 이유가 없습니다', parsed);
      }

      const normalized = this.normalizeMenuNames(recommendations);

      this.logger.log(`✅ [메뉴 추천] 추천 개수: ${normalized.length}`);

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

      return { recommendations: normalized, reason };
    } catch (error) {
      // Prometheus 실패 메트릭 기록 (요청 수만 기록)
      if (this.prometheusService) {
        this.prometheusService.recordAiError('menu');
        const durationSeconds = elapsedSeconds(startedAt);
        this.prometheusService.recordAiDuration('menu', durationSeconds);
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
        '메뉴 추천 생성에 실패했습니다.',
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
