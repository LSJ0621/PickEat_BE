import { Injectable, Logger } from '@nestjs/common';
import { KakaoLocalMeta } from '../kakao/kakao.types';
import { mockKakaoLocalResponses } from './fixtures';

/**
 * 주소 검색 결과 (실제 클라이언트와 동일한 타입)
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

/**
 * Kakao Local API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockKakaoLocalClient {
  private readonly logger = new Logger(MockKakaoLocalClient.name);

  async searchAddress(query: string): Promise<AddressSearchResponse> {
    this.logger.log(`[MOCK] Kakao searchAddress: query="${query}"`);
    return mockKakaoLocalResponses.addressSearchSuccess;
  }
}
