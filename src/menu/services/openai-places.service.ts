import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  buildGooglePlacesUserPrompt,
  GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA,
  GOOGLE_PLACES_SYSTEM_PROMPT,
} from '@/external/openai/prompts';
import { OpenAIResponseException } from '../../common/exceptions/openai-response.exception';
import { OPENAI_CONFIG } from '../../external/openai/openai.constants';
import {
  PlaceCandidate,
  PlaceRecommendationsResponse,
} from '../interface/openai-places.interface';

@Injectable()
export class OpenAiPlacesService implements OnModuleInit {
  private readonly logger = new Logger(OpenAiPlacesService.name);
  private openai: OpenAI | null = null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
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
      throw new ExternalApiException(
        'OpenAI',
        undefined,
        'OpenAI API key is not configured',
      );
    }

    if (!candidates.length) {
      return { recommendations: [] };
    }

    const systemPrompt = GOOGLE_PLACES_SYSTEM_PROMPT;
    const userPrompt = buildGooglePlacesUserPrompt(query, candidates);
    const jsonSchema = GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA;

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

      // 토큰 사용량 로깅 (프롬프트/완료/전체)
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
          `🧮 [OpenAI 토큰 사용량] prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
        );
      }

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new OpenAIResponseException('응답 내용이 비어있습니다', response);
      }

      const parsed = JSON.parse(content) as PlaceRecommendationsResponse;

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new OpenAIResponseException(
          '응답 형식이 올바르지 않습니다',
          parsed,
        );
      }

      return {
        recommendations: parsed.recommendations,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [OpenAI 장소 추천 에러] error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'OpenAI 장소 추천에 실패했습니다.',
      );
    }
  }
}
