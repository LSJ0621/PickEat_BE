import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { NAVER_MAP_CONFIG } from '../naver.constants';
import { NaverReverseGeocodeResponse, NaverReverseGeocodeResult } from '../naver.types';

@Injectable()
export class NaverMapClient {
  private readonly logger = new Logger(NaverMapClient.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('NAVER_MAP_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('NAVER_MAP_CLIENT_SECRET', '');

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('NAVER_MAP_CLIENT_ID 또는 NAVER_MAP_CLIENT_SECRET가 설정되지 않았습니다.');
    }
  }

  /**
   * 좌표로 주소 조회 (Reverse Geocoding)
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    options?: { includeRoadAddress?: boolean },
  ): Promise<NaverReverseGeocodeResult[]> {
    if (!this.clientId || !this.clientSecret) {
      throw new ConfigMissingException(['NAVER_MAP_CLIENT_ID', 'NAVER_MAP_CLIENT_SECRET']);
    }

    const url = `${NAVER_MAP_CONFIG.BASE_URL}${NAVER_MAP_CONFIG.ENDPOINTS.REVERSE_GEOCODE}`;
    const orders = options?.includeRoadAddress ? 'legalcode,addr,roadaddr' : 'legalcode,addr';

    this.logger.debug(`🔍 [Naver Reverse Geocode] lat=${latitude}, lng=${longitude}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<NaverReverseGeocodeResponse>(url, {
          headers: {
            'x-ncp-apigw-api-key-id': this.clientId,
            'x-ncp-apigw-api-key': this.clientSecret,
          },
          params: {
            coords: `${longitude},${latitude}`,
            orders,
            output: 'json',
          },
        }),
      );

      return response.data?.results ?? [];
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const statusCode = error?.response?.status;
      const errorData = error?.response?.data;

      this.logger.error(
        `❌ [Naver Reverse Geocode 에러] lat=${latitude}, lng=${longitude}, status=${statusCode ?? 'unknown'}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      throw new ExternalApiException('Naver Map', error, 'Reverse Geocode에 실패했습니다.');
    }
  }
}

