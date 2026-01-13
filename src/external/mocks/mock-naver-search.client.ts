import { Injectable, Logger } from '@nestjs/common';
import { NaverLocalSearchItem } from '../naver/naver.types';
import { mockNaverSearchResponses } from './fixtures';

/**
 * Naver Search API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockNaverSearchClient {
  private readonly logger = new Logger(MockNaverSearchClient.name);

  async searchLocal(
    query: string,
    options?: { display?: number },
  ): Promise<NaverLocalSearchItem[]> {
    this.logger.log(`[MOCK] Naver searchLocal: query="${query}"`);
    const items = mockNaverSearchResponses.localSearchSuccess;
    const display = options?.display ?? items.length;
    return items.slice(0, display) as NaverLocalSearchItem[];
  }
}
