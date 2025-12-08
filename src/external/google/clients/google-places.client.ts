import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SEARCH_DEFAULTS } from '../../../common/constants/business.constants';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { GOOGLE_PLACES_CONFIG } from '../google.constants';
import {
  GooglePlaceDetails,
  GooglePlacePhotoUriResponse,
  GooglePlaceSearchResult,
  GooglePlacesSearchResponse,
} from '../google.types';

@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);
  private readonly apiKey: string;
  private readonly baseUrl = GOOGLE_PLACES_CONFIG.BASE_URL;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_API_KEY가 설정되지 않았습니다.');
    }
  }

  /**
   * 텍스트 기반 장소 검색
   */
  async searchByText(
    query: string,
    options?: { maxResults?: number; languageCode?: string },
  ): Promise<GooglePlaceSearchResult[]> {
    if (!this.apiKey) {
      throw new ConfigMissingException('GOOGLE_API_KEY');
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.SEARCH_TEXT}`;

    this.logger.log(`🔍 [Places 검색] query="${query}"`);

    try {
      const response = await firstValueFrom(
        this.httpService.post<GooglePlacesSearchResponse>(
          url,
          {
            textQuery: query,
            languageCode:
              options?.languageCode ?? GOOGLE_PLACES_CONFIG.DEFAULTS.LANGUAGE_CODE,
            maxResultCount:
              options?.maxResults ?? SEARCH_DEFAULTS.GOOGLE_PLACES_MAX_RESULTS,
          },
          {
            headers: this.buildHeaders(GOOGLE_PLACES_CONFIG.FIELD_MASKS.SEARCH),
          },
        ),
      );

      const places = response.data?.places ?? [];
      this.logger.log(`✅ [Places 검색 완료] count=${places.length}`);
      return places;
    } catch (error: any) {
      this.logError('Places 검색', query, error);
      throw new ExternalApiException('Google Places', error, 'Places 검색에 실패했습니다.');
    }
  }

  /**
   * 장소 상세 정보 조회
   */
  async getDetails(
    placeId: string,
    options?: { includeBusinessStatus?: boolean },
  ): Promise<GooglePlaceDetails | null> {
    if (!this.apiKey) {
      throw new ConfigMissingException('GOOGLE_API_KEY');
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.DETAILS(placeId)}`;
    const fieldMask = options?.includeBusinessStatus
      ? GOOGLE_PLACES_CONFIG.FIELD_MASKS.DETAILS_WITH_BUSINESS_STATUS
      : GOOGLE_PLACES_CONFIG.FIELD_MASKS.DETAILS;

    this.logger.log(`🔍 [Places 상세 조회] placeId="${placeId}"`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GooglePlaceDetails>(url, {
          params: { languageCode: GOOGLE_PLACES_CONFIG.DEFAULTS.LANGUAGE_CODE },
          headers: {
            ...this.buildHeaders(fieldMask),
            'Referer': 'http://localhost:3000',
          },
        }),
      );

      return response.data ?? null;
    } catch (error: any) {
      this.logError('Places 상세 조회', placeId, error);
      throw new ExternalApiException('Google Places', error, 'Places 상세 조회에 실패했습니다.');
    }
  }

  /**
   * 사진 URI 조회
   */
  async getPhotoUri(
    photoName: string,
    options?: { maxWidth?: number; maxHeight?: number },
  ): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.PHOTO(photoName)}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<GooglePlacePhotoUriResponse>(url, {
          params: {
            maxHeightPx: options?.maxHeight ?? 400,
            maxWidthPx: options?.maxWidth ?? 400,
            skipHttpRedirect: true,
          },
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'Referer': 'http://localhost:3000',
          },
        }),
      );

      return response.data?.photoUri ?? null;
    } catch (error: any) {
      this.logger.error(
        `❌ [Places 사진 URI 에러] name="${photoName}", error=${error.message}`,
      );
      return null;
    }
  }

  /**
   * 여러 사진의 URI 일괄 조회
   */
  async resolvePhotoUris(
    photos: Array<{ name?: string }> | null | undefined,
    options?: { maxWidth?: number; maxHeight?: number },
  ): Promise<string[]> {
    if (!photos || photos.length === 0 || !this.apiKey) {
      return [];
    }

    const tasks = photos.map(async (photo) => {
      if (!photo?.name) return null;
      return this.getPhotoUri(photo.name, options);
    });

    const results = await Promise.all(tasks);
    return results.filter((uri): uri is string => uri !== null);
  }

  private buildHeaders(fieldMask: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.apiKey,
      'X-Goog-FieldMask': fieldMask,
      'Referer': 'http://localhost:3000',
    };
  }

  private logError(operation: string, identifier: string, error: any): void {
    const message = error instanceof Error ? error.message : 'unknown error';
    const statusCode = error?.response?.status;
    const errorData = error?.response?.data;

    this.logger.error(
      `❌ [${operation} 에러] identifier="${identifier}", status=${statusCode}, error=${message}`,
    );
    if (errorData) {
      this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
    }
  }
}

