import { Injectable, Logger } from '@nestjs/common';
import { NaverReverseGeocodeResult } from '../naver/naver.types';
import { mockNaverMapResponses } from './fixtures';

/**
 * Naver Map API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockNaverMapClient {
  private readonly logger = new Logger(MockNaverMapClient.name);

  async reverseGeocode(
    latitude: number,
    longitude: number,
    _options?: { includeRoadAddress?: boolean },
  ): Promise<NaverReverseGeocodeResult[]> {
    this.logger.log(
      `[MOCK] Naver reverseGeocode: lat=${latitude}, lng=${longitude}`,
    );
    return mockNaverMapResponses.reverseGeocodeSuccess as NaverReverseGeocodeResult[];
  }
}
