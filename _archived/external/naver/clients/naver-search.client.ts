import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SEARCH_DEFAULTS } from '../../../common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import { NAVER_SEARCH_CONFIG } from '../naver.constants';
import { NaverLocalSearchItem, NaverLocalSearchResponse } from '../naver.types';

@Injectable()
export class NaverSearchClient {
  private readonly logger = new Logger(NaverSearchClient.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('NAVER_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('NAVER_CLIENT_SECRET', '');

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        'NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET가 설정되지 않았습니다.',
      );
    }
  }

  /**
   * 로컬 검색 (음식점 등)
   */
  async searchLocal(
    query: string,
    options?: { display?: number },
  ): Promise<NaverLocalSearchItem[]> {
    if (!this.clientId || !this.clientSecret) {
      throw new ConfigMissingException([
        'NAVER_CLIENT_ID',
        'NAVER_CLIENT_SECRET',
      ]);
    }

    const url = `${NAVER_SEARCH_CONFIG.BASE_URL}${NAVER_SEARCH_CONFIG.ENDPOINTS.LOCAL_SEARCH}`;

    this.logger.log(`🔍 [Naver 로컬 검색] query="${query}"`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<NaverLocalSearchResponse>(url, {
          headers: {
            'X-Naver-Client-Id': this.clientId,
            'X-Naver-Client-Secret': this.clientSecret,
          },
          params: {
            query,
            display: options?.display ?? SEARCH_DEFAULTS.NAVER_LOCAL_DISPLAY,
          },
        }),
      );

      const items = response.data?.items ?? [];
      this.logger.log(`✅ [Naver 로컬 검색 완료] count=${items.length}`);
      return items;
    } catch (error: unknown) {
      // unknown → Error 변환
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const message = errorObj.message;

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
        `❌ [Naver 로컬 검색 에러] query="${query}", status=${statusCode ?? 'unknown'}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(
          `에러 상세: ${JSON.stringify(errorData).slice(0, 500)}`,
        );
      }

      throw new ExternalApiException(
        'Naver Search',
        errorObj,
        '로컬 검색에 실패했습니다.',
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }
}
