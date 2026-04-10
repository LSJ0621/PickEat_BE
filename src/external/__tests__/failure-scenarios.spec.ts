/**
 * 외부 API 클라이언트 장애 시나리오 유닛 테스트
 *
 * 타임아웃, 429 Rate Limit, 500 서버 오류, 잘못된 응답 형식을 다룹니다.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import {
  createMockHttpService,
  createMockConfigService,
  createAxiosError,
} from '../../../test/mocks/external-clients.mock';

jest.mock('@google/genai');
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('외부 API 클라이언트 장애 시나리오', () => {
  let searchClient: GoogleSearchClient;
  let placesClient: GooglePlacesClient;
  let geminiClient: GeminiClient;
  let mockGenerateContent: jest.Mock;
  let mockHttpService: ReturnType<typeof createMockHttpService>;

  beforeEach(async () => {
    mockHttpService = createMockHttpService();

    // GeminiClient mock 초기화
    mockGenerateContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const searchModule: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_API_KEY: 'test-key',
            GOOGLE_CSE_CX: 'test-cx',
            APP_URL: 'https://test.pickeat.com',
          }),
        },
      ],
    }).compile();
    searchClient = searchModule.get<GoogleSearchClient>(GoogleSearchClient);

    const placesModule: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_API_KEY: 'test-key',
            APP_URL: 'https://test.pickeat.com',
          }),
        },
      ],
    }).compile();
    placesClient = placesModule.get<GooglePlacesClient>(GooglePlacesClient);

    const geminiModule: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClient,
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_GEMINI_API_KEY: 'test-gemini-key',
          }),
        },
      ],
    }).compile();
    geminiClient = geminiModule.get<GeminiClient>(GeminiClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('타임아웃 발생 시 GoogleSearchClient가 ExternalApiException을 던진다', async () => {
    const timeoutError = new Error('timeout of 10000ms exceeded');
    (timeoutError as NodeJS.ErrnoException).code = 'ECONNABORTED';
    mockHttpService.get.mockImplementation(() => {
      throw timeoutError;
    });

    await expect(searchClient.searchBlogs('강남 맛집')).rejects.toThrow(
      ExternalApiException,
    );
  });

  it('429 Rate Limit 응답 시 GooglePlacesClient가 빈 배열로 graceful degradation한다', async () => {
    // GooglePlacesClient는 graceful degradation 전략으로 빈 배열 반환
    const rateLimitError = createAxiosError(429, 'Too Many Requests');
    mockHttpService.post.mockImplementation(() => {
      throw rateLimitError;
    });

    const result = await placesClient.autocomplete('강남역');

    expect(result).toEqual([]);
  });

  it('500 서버 오류 시 GoogleSearchClient가 ExternalApiException을 던진다', async () => {
    const serverError = createAxiosError(
      500,
      'Internal Server Error',
      { error: 'Server Error' },
    );
    mockHttpService.get.mockImplementation(() => {
      throw serverError;
    });

    await expect(searchClient.searchBlogs('강남 맛집')).rejects.toThrow(
      ExternalApiException,
    );
  });

  it('잘못된 응답 형식 시 GoogleSearchClient가 ExternalApiException을 던진다 (앱은 종료되지 않는다)', async () => {
    // items 대신 예상치 못한 구조의 응답
    mockHttpService.get.mockImplementation(() => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    });

    await expect(searchClient.searchBlogs('강남 맛집')).rejects.toThrow(
      ExternalApiException,
    );
  });

  it('GeminiClient — API quota 초과 시 에러가 상위로 전파된다', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('Resource exhausted: Quota exceeded for quota metric'),
    );

    await expect(
      geminiClient.searchRestaurantsUnified('맛집 추천', 37.5, 127.0, 'ko'),
    ).rejects.toThrow('Resource exhausted: Quota exceeded');
  });
});
