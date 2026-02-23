import { Injectable } from '@nestjs/common';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigService } from '@nestjs/config';
import {
  buildGooglePlacesUserPrompt,
  getGooglePlacesRecommendationsJsonSchema,
  getGooglePlacesSystemPrompt,
} from '@/external/openai/prompts';
import { detectLanguage } from '@/common/utils/language.util';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import {
  PlaceCandidate,
  PlaceRecommendationsResponse,
} from '../interface/openai-places.interface';
import { logOpenAiTokenUsage } from '@/common/utils/openai-token-logger.util';
import { BaseOpenAiService } from './base-openai.service';

@Injectable()
export class OpenAiPlacesService extends BaseOpenAiService {
  constructor(config: ConfigService) {
    super(config, OpenAiPlacesService.name, 'OPENAI_PLACES_MODEL');
  }

  async recommendFromGooglePlaces(
    query: string,
    candidates: PlaceCandidate[],
    menuName?: string,
    language?: 'ko' | 'en',
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

    // Determine language (priority: explicit > detection > default)
    let finalLanguage: 'ko' | 'en' = language || 'ko';
    if (!language && menuName) {
      finalLanguage = detectLanguage(menuName);
    }

    const systemPrompt = getGooglePlacesSystemPrompt(finalLanguage);
    const userPrompt = buildGooglePlacesUserPrompt(
      query,
      candidates,
      finalLanguage,
    );
    const jsonSchema = getGooglePlacesRecommendationsJsonSchema(finalLanguage);

    this.logger.log(
      `📤 [OpenAI 장소 추천 요청 시작] model=${this.model}, candidates=${candidates.length}`,
    );

    try {
      const response = await retryWithExponentialBackoff(
        () =>
          this.openai!.chat.completions.create({
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
          }),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
        },
        this.logger,
      );

      // 토큰 사용량 로깅 (프롬프트/완료/전체)
      logOpenAiTokenUsage(this.logger, this.model, response.usage);

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new OpenAIResponseException(
          'Response content is empty.',
          response,
        );
      }

      const parsed = JSON.parse(content) as PlaceRecommendationsResponse;

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new OpenAIResponseException('Invalid response format.', parsed);
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
        'Failed to get OpenAI place recommendations.',
      );
    }
  }
}
