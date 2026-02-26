import { Injectable, Logger } from '@nestjs/common';
import type { BlogSearchResult } from '@/external/google/google.types';

const mockGoogleCseResponses = {
  searchSuccess: [
    {
      title: 'Mock Blog Post 1',
      url: 'https://mock-blog.example.com/1',
      snippet: 'This is a mock blog post about food.',
      thumbnailUrl: null,
      source: 'mock-blog.example.com',
    } as BlogSearchResult,
  ],
};

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
