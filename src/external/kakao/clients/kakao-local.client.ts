import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { KAKAO_LOCAL_CONFIG } from '../kakao.constants';
import {
  KakaoLocalAddressDocument,
  KakaoLocalAddressResponse,
  KakaoLocalMeta,
} from '../kakao.types';

/**
 * 주소 검색 결과
 */
export interface AddressSearchResult {
  address: string;
  roadAddress: string | null;
  postalCode: string | null;
  latitude: string;
  longitude: string;
}

/**
 * 주소 검색 응답
 */
export interface AddressSearchResponse {
  meta: KakaoLocalMeta;
  addresses: AddressSearchResult[];
}

@Injectable()
export class KakaoLocalClient {
  private readonly logger = new Logger(KakaoLocalClient.name);
  private readonly apiClient: AxiosInstance;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('KAKAO_REST_API_KEY', '');

    if (!this.apiKey) {
      this.logger.warn(
        'KAKAO_REST_API_KEY가 설정되지 않았습니다. .env 파일에 추가해주세요.',
      );
    }

    this.apiClient = axios.create({
      baseURL: KAKAO_LOCAL_CONFIG.BASE_URL,
      headers: {
        Authorization: `KakaoAK ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 주소 검색
   */
  async searchAddress(query: string): Promise<AddressSearchResponse> {
    this.logger.debug(`🔍 [Kakao 주소 검색] query="${query}"`);

    try {
      const response = await this.apiClient.get<KakaoLocalAddressResponse>(
        KAKAO_LOCAL_CONFIG.ENDPOINTS.ADDRESS_SEARCH,
        {
          params: {
            query,
            analyze_type: KAKAO_LOCAL_CONFIG.DEFAULTS.ANALYZE_TYPE,
            page: 1,
            size: KAKAO_LOCAL_CONFIG.DEFAULTS.PAGE_SIZE,
          },
        },
      );

      const addresses = response.data.documents.map((doc) =>
        this.mapDocumentToResult(doc),
      );

      this.logger.debug(`✅ [Kakao 주소 검색 완료] count=${addresses.length}`);

      return {
        meta: response.data.meta,
        addresses,
      };
    } catch (error: unknown) {
      this.logger.error('❌ [Kakao 주소 검색 에러]', error);
      throw new ExternalApiException(
        'Kakao Local',
        error,
        '주소 검색에 실패했습니다.',
      );
    }
  }

  private mapDocumentToResult(
    doc: KakaoLocalAddressDocument,
  ): AddressSearchResult {
    return {
      address: doc.address?.address_name || '',
      roadAddress: doc.road_address?.address_name || null,
      postalCode: doc.road_address?.zone_no || null,
      latitude: doc.y || '',
      longitude: doc.x || '',
    };
  }
}
