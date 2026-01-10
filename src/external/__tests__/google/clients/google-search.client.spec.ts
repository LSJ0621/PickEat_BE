import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { GoogleSearchClient } from '../../../google/clients/google-search.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  mockGoogleCseResponses,
  createMockConfigService,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';

describe('GoogleSearchClient', () => {
  let client: GoogleSearchClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      GOOGLE_API_KEY: 'test-api-key',
      GOOGLE_CSE_CX: 'test-cse-cx',
      APP_URL: 'http://localhost:3000',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<GoogleSearchClient>(GoogleSearchClient);
  });

  describe('searchBlogs', () => {
    const query = '강남 맛집';
    const exactTerms = '레스토랑';

    it('should successfully search blogs', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleCseResponses.searchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchBlogs(query, exactTerms);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: expect.any(String),
        url: expect.any(String),
        snippet: expect.any(String),
      });
      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            key: 'test-api-key',
            cx: 'test-cse-cx',
            q: query,
            exactTerms: exactTerms,
          }),
        }),
      );
    });

    it('should return empty array when no items found', async () => {
      const mockResponse = createAxiosResponse({ items: [] });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchBlogs(query);

      expect(result).toEqual([]);
    });

    it('should handle response without items', async () => {
      const mockResponse = createAxiosResponse({});
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchBlogs(query);

      expect(result).toEqual([]);
    });

    it('should throw ConfigMissingException when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        GOOGLE_CSE_CX: 'test-cse-cx',
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GoogleSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = testModule.get<GoogleSearchClient>(GoogleSearchClient);

      await expect(testClient.searchBlogs(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ConfigMissingException when CSE CX is missing', async () => {
      const emptyConfigService = createMockConfigService({
        GOOGLE_API_KEY: 'test-api-key',
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GoogleSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = testModule.get<GoogleSearchClient>(GoogleSearchClient);

      await expect(testClient.searchBlogs(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on timeout', async () => {
      const error = new Error('ETIMEDOUT');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchBlogs(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.searchBlogs(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Google CSE');
      }
    });

    it('should support custom numResults option', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleCseResponses.searchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.searchBlogs(query, exactTerms, { numResults: 5 });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            num: 5,
          }),
        }),
      );
    });

    it('should map CSE item correctly with all fields', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleCseResponses.searchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchBlogs(query);

      expect(result[0]).toMatchObject({
        title: '맛집 블로그 포스트',
        url: 'https://blog.example.com/post1',
        snippet: '서울 강남구 최고의 맛집 추천',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        source: 'Example Blog',
      });
    });

    it('should handle missing pagemap fields gracefully', async () => {
      const mockResponse = createAxiosResponse({
        items: [
          {
            title: 'Test Post',
            link: 'https://example.com',
            snippet: 'Test snippet',
            displayLink: 'example.com',
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchBlogs(query);

      expect(result[0]).toMatchObject({
        title: 'Test Post',
        url: 'https://example.com',
        snippet: 'Test snippet',
        thumbnailUrl: null,
        source: 'example.com',
      });
    });
  });
});
