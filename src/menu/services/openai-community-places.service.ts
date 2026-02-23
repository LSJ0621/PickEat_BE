import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import {
  buildCommunityPlacesUserPrompt,
  getCommunityPlacesRecommendationsJsonSchema,
  getCommunityPlacesSystemPrompt,
} from '@/external/openai/prompts';
import {
  CommunityPlaceCandidate,
  CommunityPlacesRecommendationResponse,
} from '../interface/community-places.interface';
import { logOpenAiTokenUsage } from '@/common/utils/openai-token-logger.util';
import { BaseOpenAiService } from './base-openai.service';

@Injectable()
export class OpenAiCommunityPlacesService extends BaseOpenAiService {
  constructor(config: ConfigService) {
    super(config, OpenAiCommunityPlacesService.name);
  }

  async recommendFromCommunityPlaces(
    menuName: string,
    candidates: CommunityPlaceCandidate[],
    language: 'ko' | 'en' = 'ko',
  ): Promise<CommunityPlacesRecommendationResponse> {
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

    const systemPrompt = getCommunityPlacesSystemPrompt(language);
    const userPrompt = buildCommunityPlacesUserPrompt(
      menuName,
      candidates,
      language,
    );
    const jsonSchema = getCommunityPlacesRecommendationsJsonSchema(language);

    this.logger.log(
      `📤 [OpenAI 커뮤니티 장소 추천 요청 시작] model=${this.model}, candidates=${candidates.length}`,
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
                name: 'community_places_recommendations',
                schema: jsonSchema,
                strict: true,
              },
            },
            max_completion_tokens: 800,
          }),
        {
          maxRetries: 1,
          initialDelayMs: 1000,
        },
        this.logger,
      );

      // Log token usage
      logOpenAiTokenUsage(this.logger, this.model, response.usage);

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new OpenAIResponseException(
          'Response content is empty.',
          response,
        );
      }

      const parsed = JSON.parse(
        content,
      ) as CommunityPlacesRecommendationResponse;

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new OpenAIResponseException('Invalid response format.', parsed);
      }

      this.logger.log(
        `✅ [OpenAI 커뮤니티 장소 추천 완료] recommendations=${parsed.recommendations.length}`,
      );

      return {
        recommendations: parsed.recommendations,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [OpenAI 커뮤니티 장소 추천 에러] error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to get OpenAI community place recommendations.',
      );
    }
  }
}
