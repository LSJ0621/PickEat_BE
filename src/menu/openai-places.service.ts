import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA,
  GOOGLE_PLACES_SYSTEM_PROMPT,
  buildGooglePlacesUserPrompt,
} from './prompts/google-places-recommendation.prompts';

interface PlaceCandidate {
  id: string;
  name: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: string | null;
  reviews?: Array<{
    rating: number | null;
    originalText: string | null;
    relativePublishTimeDescription: string | null;
  }> | null;
}

export interface PlaceRecommendationsResponse {
  recommendations: Array<{
    placeId: string;
    name: string;
    reason: string;
  }>;
}

@Injectable()
export class OpenAiPlacesService implements OnModuleInit {
  private readonly logger = new Logger(OpenAiPlacesService.name);
  private openai: OpenAI | null = null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-5.1');
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
      this.logger.log(
        `🧮 [OpenAI 토큰 사용량] prompt=${usage?.prompt_tokens ?? 'n/a'}, completion=${usage?.completion_tokens ?? 'n/a'}, total=${usage?.total_tokens ?? 'n/a'}`,
      );

      this.logger.log(
        `📥 [OpenAI 장소 추천 응답 수신] 소요 시간=${duration}ms, raw=${JSON.stringify(
          response,
        ).substring(0, 500)}...`,
      );

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned no content for place recommendations');
      }

      const parsed = JSON.parse(content) as PlaceRecommendationsResponse;

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new Error('OpenAI returned invalid recommendations format');
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
      throw new InternalServerErrorException(
        'Failed to fetch place recommendations',
      );
    }
  }
}
