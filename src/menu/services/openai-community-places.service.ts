import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import {
  buildCommunityPlacesUserPrompt,
  getCommunityPlacesRecommendationsJsonSchema,
  getCommunityPlacesSystemPrompt,
} from '@/external/openai/prompts';
import {
  CommunityPlaceCandidate,
  CommunityPlacesRecommendationResponse,
} from '../interface/community-places.interface';

@Injectable()
export class OpenAiCommunityPlacesService implements OnModuleInit {
  private readonly logger = new Logger(OpenAiCommunityPlacesService.name);
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
      const response = await this.openai.chat.completions.create({
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
      });

      // Log token usage
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
