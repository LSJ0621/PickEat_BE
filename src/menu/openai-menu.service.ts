import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

interface ChatCompletionResponse {
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface RecommendationPayload {
  recommendations?: unknown;
  menus?: unknown;
  items?: unknown;
}

@Injectable()
export class OpenAiMenuService {
  private readonly logger = new Logger(OpenAiMenuService.name);
  private readonly defaultModel = 'gpt-4o';
  private readonly defaultUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(private readonly httpService: HttpService) {}

  async generateMenuRecommendations(
    prompt: string,
    tags: string[],
  ): Promise<string[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      throw new InternalServerErrorException(
        'OpenAI API key is not configured',
      );
    }

    const model = process.env.OPENAI_MODEL ?? this.defaultModel;
    const url = process.env.OPENAI_API_URL ?? this.defaultUrl;
    const normalizedTags = tags?.filter(Boolean) ?? [];
    const promptForModel = [
      `User prompt: ${prompt}`,
      `User preferences: ${normalizedTags.length ? normalizedTags.join(', ') : 'none provided'}`,
      'Respond ONLY with JSON shaped as {"recommendations":["menu1","menu2"]} where each item is a concrete dish.',
    ].join('\n');

    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a culinary assistant for the Pick-Eat app. Recommend diverse Korean-friendly menus that align with user mood and preferences.',
        },
        { role: 'user', content: promptForModel },
      ],
    };

    const maskedHeaders = {
      Authorization: 'Bearer ***',
      'Content-Type': 'application/json',
    };
    const startedAt = Date.now();
    this.logger.log(
      `📤 [OpenAI 요청]
        URL: ${url}
        Headers: ${JSON.stringify(maskedHeaders, null, 2)}
        Body: ${JSON.stringify(requestBody, null, 2)}
        시작 시간: ${new Date(startedAt).toISOString()}`,
    );

    try {
      const response = await firstValueFrom<
        AxiosResponse<ChatCompletionResponse>
      >(
        this.httpService.post<ChatCompletionResponse>(url, requestBody, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      const duration = Date.now() - startedAt;
      this.logger.log(
        `📥 [OpenAI 응답]
          상태 코드: ${response.status}
          소요 시간: ${duration}ms
          응답 내용: ${JSON.stringify(response.data, null, 2)}`,
      );
      const content = response.data.choices?.[0]?.message?.content;
      const recommendations = this.extractRecommendations(content);
      if (!recommendations.length) {
        throw new Error('OpenAI returned no recommendations');
      }
      return recommendations;
    } catch (error) {
      const duration = Date.now() - startedAt;
      const axiosError = error as AxiosError;
      const response = axiosError.response;
      if (response) {
        this.logger.error(
          `❌ [OpenAI 에러]
            상태 코드: ${response.status}
            소요 시간: ${duration}ms
            에러 내용: ${JSON.stringify(response.data, null, 2)}
            스택 트레이스: ${axiosError.stack}`,
        );
      } else {
        this.logger.error(
          `❌ [OpenAI 에러]
            소요 시간: ${duration}ms
            에러 메시지: ${axiosError.message}
            스택 트레이스: ${axiosError.stack}`,
        );
      }
      throw new InternalServerErrorException(
        'Failed to fetch menu recommendations',
      );
    }
  }

  private extractRecommendations(content?: string): string[] {
    if (!content) {
      return [];
    }

    const normalized = this.stripCodeFence(content).trim();
    try {
      const parsed = JSON.parse(normalized) as RecommendationPayload;
      const recommendations =
        this.toStringArray(parsed.recommendations) ??
        this.toStringArray(parsed.menus) ??
        this.toStringArray(parsed.items);
      if (recommendations) {
        return this.normalizeList(recommendations);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse OpenAI JSON payload: ${error instanceof Error ? error.message : error}`,
      );
    }

    return this.normalizeList(
      normalized
        .split(/\n|,/)
        .map((item) =>
          item
            .replace(/^\d+\.?/g, '')
            .replace(/^-/, '')
            .trim(),
        )
        .filter((item) => item.length > 0),
    );
  }

  private stripCodeFence(content: string): string {
    if (!content.startsWith('```')) {
      return content;
    }
    return content.replace(/```(json)?/g, ' ');
  }

  private toStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }
    return value
      .map((item) => (typeof item === 'string' ? item : String(item)))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private normalizeList(items: string[]): string[] {
    return Array.from(new Set(items));
  }
}
