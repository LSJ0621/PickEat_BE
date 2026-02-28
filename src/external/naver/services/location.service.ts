import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';
import { NaverMapClient } from '@/external/naver/clients/naver-map.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { NaverReverseGeocodeResult } from '@/external/naver/naver.types';

/**
 * 지리적 위치 관련 서비스
 * 역지오코딩(좌표 → 주소) 기능 제공
 */
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(private readonly naverMapClient: NaverMapClient) {}

  /**
   * 역지오코딩: 위도/경도를 주소로 변환
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    includeRoadAddress: boolean = false,
  ): Promise<string> {
    this.logger.log(`🔍 [역지오코딩 요청] lat=${latitude}, lng=${longitude}`);

    try {
      const results = await this.naverMapClient.reverseGeocode(
        latitude,
        longitude,
        { includeRoadAddress },
      );

      const address = this.extractAddressFromResults(
        results,
        includeRoadAddress,
      );

      if (!address) {
        throw new BadRequestException({
          errorCode: ErrorCode.LOCATION_ADDRESS_NOT_FOUND,
        });
      }

      this.logger.log(`✅ [역지오코딩 응답] address="${address}"`);

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [역지오코딩 에러] lat=${latitude}, lng=${longitude}, error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new ExternalApiException(
        'Naver Map',
        error instanceof Error ? error : undefined,
        '역지오코딩에 실패했습니다.',
      );
    }
  }

  private extractAddressFromResults(
    results: NaverReverseGeocodeResult[],
    includeRoadAddress: boolean,
  ): string | null {
    if (!results?.length) {
      return null;
    }

    const preferredOrder = ['roadaddr', 'addr', 'admcode', 'legalcode'];

    for (const name of preferredOrder) {
      const candidate = results.find((result) => result.name === name);
      if (!candidate) continue;

      const address = this.buildDetailedAddress(candidate, includeRoadAddress);
      if (address) {
        return address;
      }
    }

    for (const result of results) {
      const address = this.buildDetailedAddress(result, includeRoadAddress);
      if (address) {
        return address;
      }
    }

    return null;
  }

  private buildDetailedAddress(
    result: NaverReverseGeocodeResult,
    includeRoadAddress: boolean,
  ): string | null {
    if (!result.region) {
      return null;
    }

    const regionAddress = this.buildRegionAddress(result.region);
    if (!regionAddress) {
      return null;
    }

    if (includeRoadAddress && result.name === 'roadaddr' && result.land) {
      const roadParts: string[] = [];

      if (result.land.name && typeof result.land.name === 'string') {
        roadParts.push(result.land.name);
      }

      if (result.land.number1 && typeof result.land.number1 === 'string') {
        roadParts.push(result.land.number1);
        if (result.land.number2 && typeof result.land.number2 === 'string') {
          roadParts.push(result.land.number2);
        }
      }

      if (roadParts.length > 0) {
        return `${regionAddress} ${roadParts.join(' ')}`;
      }
    }

    return regionAddress;
  }

  private buildRegionAddress(
    region?: NaverReverseGeocodeResult['region'],
  ): string | null {
    if (!region) {
      return null;
    }

    const names: string[] = [];

    if (region.area1?.name?.trim()) names.push(region.area1.name.trim());
    if (region.area2?.name?.trim()) names.push(region.area2.name.trim());
    if (region.area3?.name?.trim()) names.push(region.area3.name.trim());
    if (region.area4?.name?.trim()) names.push(region.area4.name.trim());

    if (!names.length && region.area0?.name?.trim()) {
      names.push(region.area0.name.trim());
    }

    const uniqueNames = names.filter(
      (name, index) => names.indexOf(name) === index,
    );

    return uniqueNames.length ? uniqueNames.join(' ') : null;
  }
}
