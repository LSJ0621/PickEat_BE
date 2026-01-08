import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SEARCH_DEFAULTS } from '../../../common/constants/business.constants';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import {
  elapsedSeconds,
  mapStatusGroupFromError,
} from '../../../common/utils/metrics.util';
import { PrometheusService } from '../../../prometheus/prometheus.service';
import { GOOGLE_CSE_CONFIG } from '../google.constants';
import { GoogleCseItem, GoogleCseResponse } from '../google.types';

/**
 * 블로그 검색 결과
 */
export interface BlogSearchResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  thumbnailUrl: string | null;
  source: string | null;
}

@Injectable()
export class GoogleSearchClient {
  private readonly logger = new Logger(GoogleSearchClient.name);
  private readonly apiKey: string;
  private readonly cseCx: string;
  private readonly appUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prometheusService: PrometheusService,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_API_KEY', '');
    this.cseCx = this.config.get<string>('GOOGLE_CSE_CX', '');
    this.appUrl = this.config.getOrThrow<string>('APP_URL');

    if (!this.apiKey || !this.cseCx) {
      this.logger.warn(
        'GOOGLE_API_KEY 또는 GOOGLE_CSE_CX가 설정되지 않았습니다.',
      );
    }
  }

  /**
   * 블로그/웹 문서 검색
   */
  async searchBlogs(
    query: string,
    exactTerms?: string,
    options?: { numResults?: number },
  ): Promise<BlogSearchResult[]> {
    if (!this.apiKey || !this.cseCx) {
      throw new ConfigMissingException(['GOOGLE_API_KEY', 'GOOGLE_CSE_CX']);
    }

    this.logger.log(
      `🔍 [CSE 블로그 검색] query="${query}", exactTerms="${exactTerms}"`,
    );

    const startedAt = Date.now();
    let statusGroup: '2xx' | '4xx' | '5xx' | '429' | 'timeout' = '2xx';

    try {
      const response = await firstValueFrom(
        this.httpService.get<GoogleCseResponse>(GOOGLE_CSE_CONFIG.BASE_URL, {
          params: {
            key: this.apiKey,
            cx: this.cseCx,
            q: query,
            exactTerms: exactTerms,
            num: options?.numResults ?? SEARCH_DEFAULTS.GOOGLE_CSE_NUM_RESULTS,
            hl: GOOGLE_CSE_CONFIG.DEFAULTS.LANGUAGE,
          },
          headers: {
            Referer: this.appUrl,
          },
        }),
      );

      const items = response.data?.items ?? [];
      const blogs = items.map((item) => this.mapCseItemToBlogResult(item));

      this.logger.log(`✅ [CSE 블로그 검색 완료] count=${blogs.length}`);
      this.recordExternal(statusGroup, startedAt);
      return blogs;
    } catch (error: unknown) {
      statusGroup = mapStatusGroupFromError(error);
      const message = error instanceof Error ? error.message : 'unknown error';

      let statusCode: number | undefined;
      let errorData: unknown;

      // Check if error has response property (axios error)
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const axiosError = error as {
          response?: { status?: number; data?: unknown };
        };
        statusCode = axiosError.response?.status;
        errorData = axiosError.response?.data;
      }

      this.logger.error(
        `❌ [CSE 블로그 검색 에러] query="${query}", status=${statusCode}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      this.recordExternal(statusGroup, startedAt);
      throw new ExternalApiException(
        'Google CSE',
        error,
        '블로그 검색에 실패했습니다.',
      );
    }
  }

  private mapCseItemToBlogResult(item: GoogleCseItem): BlogSearchResult {
    const pagemap = item.pagemap ?? {};
    const thumbnail =
      pagemap.cse_thumbnail?.[0]?.src ??
      pagemap.metatags?.[0]?.['og:image'] ??
      null;
    const source =
      pagemap.metatags?.[0]?.['og:site_name'] ?? item.displayLink ?? null;

    return {
      title: item.title ?? null,
      url: item.link ?? null,
      snippet: item.snippet ?? null,
      thumbnailUrl: thumbnail,
      source,
    };
  }

  private recordExternal(
    statusGroup: '2xx' | '4xx' | '5xx' | '429' | 'timeout',
    startedAt: number,
  ) {
    const durationSeconds = elapsedSeconds(startedAt);
    this.prometheusService.recordExternalApi(
      'cse',
      statusGroup,
      durationSeconds,
    );
  }
}
