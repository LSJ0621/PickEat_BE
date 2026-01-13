import { Injectable, Logger } from '@nestjs/common';
import { mockGoogleCseResponses } from './fixtures';

/**
 * 블로그 검색 결과 (실제 클라이언트와 동일한 타입)
 */
export interface BlogSearchResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  thumbnailUrl: string | null;
  source: string | null;
}

/**
 * Google CSE (Custom Search Engine) Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockGoogleSearchClient {
  private readonly logger = new Logger(MockGoogleSearchClient.name);

  async searchBlogs(
    query: string,
    exactTerms?: string,
    options?: { numResults?: number },
  ): Promise<BlogSearchResult[]> {
    this.logger.log(
      `[MOCK] CSE searchBlogs: query="${query}", exactTerms="${exactTerms}"`,
    );
    const results = mockGoogleCseResponses.searchSuccess;
    const numResults = options?.numResults ?? results.length;
    return results.slice(0, numResults);
  }
}
