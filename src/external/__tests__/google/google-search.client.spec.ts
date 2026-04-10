import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import {
  createMockHttpService,
  createMockConfigService,
  createAxiosResponse,
  mockGoogleCseResponses,
} from '../../../../test/mocks/external-clients.mock';

jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('GoogleSearchClient', () => {
  let client: GoogleSearchClient;
  let mockHttpService: ReturnType<typeof createMockHttpService>;

  beforeEach(async () => {
    mockHttpService = createMockHttpService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_API_KEY: 'test-google-api-key',
            GOOGLE_CSE_CX: 'test-cse-cx',
            APP_URL: 'https://test.pickeat.com',
          }),
        },
      ],
    }).compile();

    client = module.get<GoogleSearchClient>(GoogleSearchClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('CSE 블로그 검색 응답을 BlogSearchResult 배열로 파싱해 반환한다', async () => {
    mockHttpService.get.mockReturnValue(
      of(createAxiosResponse(mockGoogleCseResponses.searchSuccess)),
    );

    const result = await client.searchBlogs('강남 맛집');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('맛집 블로그 포스트');
    expect(result[0].url).toBe('https://blog.example.com/post1');
    expect(result[0].snippet).toBe('서울 강남구 최고의 맛집 추천');
    expect(result[0].thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(result[0].source).toBe('Example Blog');
  });

  it('검색 결과 items가 없으면 빈 배열을 반환한다', async () => {
    mockHttpService.get.mockReturnValue(of(createAxiosResponse({ items: [] })));

    const result = await client.searchBlogs('검색결과없음');

    expect(result).toEqual([]);
  });
});
