import { randomUUID } from 'crypto';
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
  GooglePlacesAutocompleteOptions,
  GooglePlacesAutocompleteResponse,
  GooglePlacesAutocompleteSuggestion,
  GooglePlacesSearchByTextOptions,
  GooglePlacesSearchResponse,
  GooglePlacesTextSearchRequestBody,
} from '../google.types';

@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);
  private readonly apiKey: string;
  private readonly appUrl: string;
  private readonly baseUrl = GOOGLE_PLACES_CONFIG.BASE_URL;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_API_KEY', '');
    this.appUrl = this.config.getOrThrow<string>('APP_URL');
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_API_KEY가 설정되지 않았습니다.');
    }
  }

  /**
   * 세션 토큰 생성
   */
  createSessionToken(): string {
    return randomUUID();
  }

  /**
   * 주소 자동완성 검색
   */
  async autocomplete(
    input: string,
    options?: GooglePlacesAutocompleteOptions,
  ): Promise<GooglePlacesAutocompleteSuggestion[]> {
    if (!this.apiKey) {
      throw new ConfigMissingException('GOOGLE_API_KEY');
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.AUTOCOMPLETE}`;

    this.logger.log(`🔍 [Places Autocomplete] input="${input}"`);

    try {
      const requestBody: Record<string, unknown> = {
        input,
        languageCode:
          options?.languageCode ?? GOOGLE_PLACES_CONFIG.DEFAULTS.LANGUAGE_CODE,
      };

      if (options?.includedRegionCodes) {
        requestBody.includedRegionCodes = options.includedRegionCodes;
      }

      if (options?.locationBias) {
        requestBody.locationBias = options.locationBias;
      }

      if (options?.sessionToken) {
        requestBody.sessionToken = options.sessionToken;
      }

      const response = await firstValueFrom(
        this.httpService.post<GooglePlacesAutocompleteResponse>(
          url,
          requestBody,
          {
            headers: this.buildHeaders(
              GOOGLE_PLACES_CONFIG.FIELD_MASKS.AUTOCOMPLETE,
            ),
          },
        ),
      );

      const suggestions = response.data?.suggestions ?? [];
      this.logger.log(
        `✅ [Places Autocomplete 완료] count=${suggestions.length}`,
      );
      return suggestions;
    } catch (error: unknown) {
      this.logError('Places Autocomplete', input, error);
      throw new ExternalApiException(
        'Google Places',
        error,
        'Places Autocomplete에 실패했습니다.',
      );
    }
  }

  /**
   * 텍스트 기반 장소 검색
   */
  async searchByText(
    query: string,
    options?: GooglePlacesSearchByTextOptions,
  ): Promise<GooglePlaceSearchResult[]> {
    if (!this.apiKey) {
      throw new ConfigMissingException('GOOGLE_API_KEY');
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.SEARCH_TEXT}`;

    this.logger.log(`🔍 [Places 검색] query="${query}"`);

    try {
      const requestBody: GooglePlacesTextSearchRequestBody = {
        textQuery: query,
        languageCode:
          options?.languageCode ?? GOOGLE_PLACES_CONFIG.DEFAULTS.LANGUAGE_CODE,
        pageSize:
          options?.maxResults ?? SEARCH_DEFAULTS.GOOGLE_PLACES_MAX_RESULTS,
      };

      if (options?.locationBias) {
        requestBody.locationBias = options.locationBias;
      }

      const apiRequestBody: Record<string, unknown> = {
        textQuery: requestBody.textQuery,
        languageCode: requestBody.languageCode,
        pageSize: requestBody.pageSize,
      };

      if (requestBody.locationBias) {
        apiRequestBody.locationBias = requestBody.locationBias;
      }

      const response = await firstValueFrom(
        this.httpService.post<GooglePlacesSearchResponse>(url, apiRequestBody, {
          headers: this.buildHeaders(GOOGLE_PLACES_CONFIG.FIELD_MASKS.SEARCH),
        }),
      );

      const places = response.data?.places ?? [];
      this.logger.log(`✅ [Places 검색 완료] count=${places.length}`);
      return places;
    } catch (error: unknown) {
      this.logError('Places 검색', query, error);
      throw new ExternalApiException(
        'Google Places',
        error,
        'Places 검색에 실패했습니다.',
      );
    }
  }

  /**
   * 장소 상세 정보 조회
   */
  async getDetails(
    placeId: string,
    options?: {
      includeBusinessStatus?: boolean;
      useMinimalFields?: boolean;
      languageCode?: string;
      sessionToken?: string;
    },
  ): Promise<GooglePlaceDetails | null> {
    if (!this.apiKey) {
      throw new ConfigMissingException('GOOGLE_API_KEY');
    }

    const url = `${this.baseUrl}${GOOGLE_PLACES_CONFIG.ENDPOINTS.DETAILS(placeId)}`;
    let fieldMask: string;

    if (options?.useMinimalFields) {
      fieldMask = GOOGLE_PLACES_CONFIG.FIELD_MASKS.ADDRESS_DETAILS;
    } else if (options?.includeBusinessStatus) {
      fieldMask = GOOGLE_PLACES_CONFIG.FIELD_MASKS.DETAILS_WITH_BUSINESS_STATUS;
    } else {
      fieldMask = GOOGLE_PLACES_CONFIG.FIELD_MASKS.DETAILS;
    }

    this.logger.log(`🔍 [Places 상세 조회] placeId="${placeId}"`);

    try {
      const headers: Record<string, string> = {
        ...this.buildHeaders(fieldMask),
        Referer: this.appUrl,
      };

      if (options?.sessionToken) {
        headers['X-Goog-SessionToken'] = options.sessionToken;
      }

      const response = await firstValueFrom(
        this.httpService.get<GooglePlaceDetails>(url, {
          params: {
            languageCode:
              options?.languageCode ??
              GOOGLE_PLACES_CONFIG.DEFAULTS.LANGUAGE_CODE,
          },
          headers,
        }),
      );

      const result = response.data ?? null;
      return result;
    } catch (error: unknown) {
      this.logError('Places 상세 조회', placeId, error);
      throw new ExternalApiException(
        'Google Places',
        error,
        'Places 상세 조회에 실패했습니다.',
      );
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
            Referer: this.appUrl,
          },
        }),
      );

      const result = response.data?.photoUri ?? null;
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ [Places 사진 URI 에러] name="${photoName}", error=${errorMessage}`,
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
      Referer: this.appUrl,
    };
  }

  private logError(
    operation: string,
    identifier: string,
    error: unknown,
  ): void {
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
      `❌ [${operation} 에러] identifier="${identifier}", status=${statusCode}, error=${message}`,
    );
    if (errorData) {
      this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
    }
  }
}
