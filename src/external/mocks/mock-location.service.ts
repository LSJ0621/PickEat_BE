import { Injectable, Logger } from '@nestjs/common';

/**
 * LocationService Mock 구현
 * E2E 테스트 시 실제 Naver Map API 호출 대신 사용
 */
@Injectable()
export class MockLocationService {
  private readonly logger = new Logger(MockLocationService.name);

  /**
   * 역지오코딩: 위도/경도를 주소로 변환 (Mock)
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    includeRoadAddress: boolean = false,
  ): Promise<string> {
    this.logger.log(
      `[MOCK] LocationService.reverseGeocode: lat=${latitude}, lng=${longitude}, includeRoadAddress=${includeRoadAddress}`,
    );

    // Mock 주소 반환 - 실제 테스트 데이터와 일치
    if (includeRoadAddress) {
      return '서울특별시 강남구 테헤란로 123';
    }

    return '서울특별시 강남구 역삼동';
  }
}
