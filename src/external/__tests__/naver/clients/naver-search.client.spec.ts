import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { NaverSearchClient } from '../../../naver/clients/naver-search.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  createMockConfigService,
  mockNaverSearchResponses,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { NAVER_SEARCH_CONFIG } from '../../../naver/naver.constants';
import { SEARCH_DEFAULTS } from '@/common/constants/business.constants';

describe('NaverSearchClient', () => {
  let client: NaverSearchClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;
  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      NAVER_CLIENT_ID: 'test-client-id',
      NAVER_CLIENT_SECRET: 'test-client-secret',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NaverSearchClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<NaverSearchClient>(NaverSearchClient);
  });

  describe('constructor', () => {
    it('should warn when client credentials are missing', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          NaverSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverSearchClient>(NaverSearchClient);

      expect(testClient).toBeDefined();
    });
  });

  describe('searchLocal', () => {
    const query = '강남 맛집';

    it('should successfully search local places', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverSearchResponses.localSearchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result).toEqual(mockNaverSearchResponses.localSearchSuccess.items);
      expect(httpService.get).toHaveBeenCalledWith(
        `${NAVER_SEARCH_CONFIG.BASE_URL}${NAVER_SEARCH_CONFIG.ENDPOINTS.LOCAL_SEARCH}`,
        {
          headers: {
            'X-Naver-Client-Id': 'test-client-id',
            'X-Naver-Client-Secret': 'test-client-secret',
          },
          params: {
            query,
            display: SEARCH_DEFAULTS.NAVER_LOCAL_DISPLAY,
          },
        },
      );
    });

    it('should return empty array when no items found', async () => {
      const mockResponse = createAxiosResponse({
        total: 0,
        display: 0,
        start: 1,
        items: [],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result).toEqual([]);
    });

    it('should handle response with null data', async () => {
      const mockResponse = createAxiosResponse(null);
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result).toEqual([]);
    });

    it('should handle response with undefined items', async () => {
      const mockResponse = createAxiosResponse({
        total: 0,
        display: 0,
        start: 1,
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result).toEqual([]);
    });

    it('should support custom display option', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverSearchResponses.localSearchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.searchLocal(query, { display: 10 });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            query,
            display: 10,
          },
        }),
      );
    });

    it('should use default display when option not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverSearchResponses.localSearchSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.searchLocal(query);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            display: SEARCH_DEFAULTS.NAVER_LOCAL_DISPLAY,
          }),
        }),
      );
    });

    it('should throw ConfigMissingException when client ID is missing', async () => {
      const emptyConfigService = createMockConfigService({
        NAVER_CLIENT_SECRET: 'test-secret',
      });

      const module = await Test.createTestingModule({
        providers: [
          NaverSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverSearchClient>(NaverSearchClient);

      await expect(testClient.searchLocal(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ConfigMissingException when client secret is missing', async () => {
      const emptyConfigService = createMockConfigService({
        NAVER_CLIENT_ID: 'test-id',
      });

      const module = await Test.createTestingModule({
        providers: [
          NaverSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverSearchClient>(NaverSearchClient);

      await expect(testClient.searchLocal(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ConfigMissingException when both credentials are missing', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          NaverSearchClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverSearchClient>(NaverSearchClient);

      await expect(testClient.searchLocal(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on timeout error', async () => {
      const error = new Error('timeout of 5000ms exceeded');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.searchLocal(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Naver Search');
      }
    });

    it('should include custom message in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.searchLocal(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        const exception = e as ExternalApiException;
        const response = exception.getResponse() as any;
        expect(response.message).toBe('로컬 검색에 실패했습니다.');
      }
    });

    it('should log error details with status code', async () => {
      const error = createAxiosError(500, 'Internal Server Error', {
        errorMessage: 'Server error',
      });
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle error without response', async () => {
      const error = new Error('Request failed');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.searchLocal(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should return items with all optional fields present', async () => {
      const mockResponse = createAxiosResponse({
        total: 1,
        display: 1,
        start: 1,
        items: [
          {
            title: '<b>맛있는</b> 식당',
            link: 'https://example.com',
            category: '음식점>한식',
            description: '맛있는 한식 전문점',
            telephone: '02-1234-5678',
            address: '서울특별시 강남구 역삼동 123-45',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            mapx: '1270398765',
            mapy: '375012345',
            distance: '100',
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result[0]).toEqual({
        title: '<b>맛있는</b> 식당',
        link: 'https://example.com',
        category: '음식점>한식',
        description: '맛있는 한식 전문점',
        telephone: '02-1234-5678',
        address: '서울특별시 강남구 역삼동 123-45',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        mapx: '1270398765',
        mapy: '375012345',
        distance: '100',
      });
    });

    it('should handle items with missing optional fields', async () => {
      const mockResponse = createAxiosResponse({
        total: 1,
        display: 1,
        start: 1,
        items: [
          {
            title: '식당',
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result[0]).toEqual({
        title: '식당',
      });
    });

    it('should handle multiple items in response', async () => {
      const mockResponse = createAxiosResponse({
        total: 3,
        display: 3,
        start: 1,
        items: [
          { title: '식당1', address: '주소1' },
          { title: '식당2', address: '주소2' },
          { title: '식당3', address: '주소3' },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.searchLocal(query);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('식당1');
      expect(result[1].title).toBe('식당2');
      expect(result[2].title).toBe('식당3');
    });
  });
});
