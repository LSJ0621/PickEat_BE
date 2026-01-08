import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KakaoLocalClient } from '../../../kakao/clients/kakao-local.client';
import {
  createMockConfigService,
  mockKakaoLocalResponses,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { KAKAO_LOCAL_CONFIG } from '../../../kakao/kakao.constants';
import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KakaoLocalClient', () => {
  let client: KakaoLocalClient;
  let configService: ReturnType<typeof createMockConfigService>;
  let mockAxiosInstance: jest.Mocked<Pick<AxiosInstance, 'get' | 'post'>>;

  beforeEach(async () => {
    configService = createMockConfigService({
      KAKAO_REST_API_KEY: 'test-kakao-api-key',
    });
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(
      mockAxiosInstance as unknown as AxiosInstance,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KakaoLocalClient,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<KakaoLocalClient>(KakaoLocalClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct base URL and headers', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: KAKAO_LOCAL_CONFIG.BASE_URL,
        headers: {
          Authorization: 'KakaoAK test-kakao-api-key',
          'Content-Type': 'application/json',
        },
      });
    });

    it('should warn when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          KakaoLocalClient,
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<KakaoLocalClient>(KakaoLocalClient);

      expect(testClient).toBeDefined();
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: KAKAO_LOCAL_CONFIG.BASE_URL,
        headers: {
          Authorization: 'KakaoAK ',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('searchAddress', () => {
    const query = '서울특별시 강남구 역삼동';

    it('should successfully search address', async () => {
      const mockResponse = {
        data: mockKakaoLocalResponses.addressSearchSuccess,
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result).toEqual({
        meta: mockKakaoLocalResponses.addressSearchSuccess.meta,
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        KAKAO_LOCAL_CONFIG.ENDPOINTS.ADDRESS_SEARCH,
        {
          params: {
            query,
            analyze_type: KAKAO_LOCAL_CONFIG.DEFAULTS.ANALYZE_TYPE,
            page: 1,
            size: KAKAO_LOCAL_CONFIG.DEFAULTS.PAGE_SIZE,
          },
        },
      );
    });

    it('should return empty addresses when no documents found', async () => {
      const mockResponse = {
        data: {
          meta: {
            total_count: 0,
            pageable_count: 0,
            is_end: true,
          },
          documents: [],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result.addresses).toEqual([]);
      expect(result.meta.total_count).toBe(0);
    });

    it('should handle documents without road_address', async () => {
      const mockResponse = {
        data: {
          meta: {
            total_count: 1,
            pageable_count: 1,
            is_end: true,
          },
          documents: [
            {
              address_name: '서울특별시 강남구 역삼동',
              address_type: 'REGION',
              x: '127.0398765',
              y: '37.5012345',
              address: {
                address_name: '서울특별시 강남구 역삼동',
                region_1depth_name: '서울특별시',
                region_2depth_name: '강남구',
                region_3depth_name: '역삼동',
              },
            },
          ],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result.addresses[0]).toEqual({
        address: '서울특별시 강남구 역삼동',
        roadAddress: null,
        postalCode: null,
        latitude: '37.5012345',
        longitude: '127.0398765',
      });
    });

    it('should handle documents without address field', async () => {
      const mockResponse = {
        data: {
          meta: {
            total_count: 1,
            pageable_count: 1,
            is_end: true,
          },
          documents: [
            {
              address_name: '서울특별시 강남구 역삼동',
              address_type: 'REGION',
              x: '127.0398765',
              y: '37.5012345',
            },
          ],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result.addresses[0]).toEqual({
        address: '',
        roadAddress: null,
        postalCode: null,
        latitude: '37.5012345',
        longitude: '127.0398765',
      });
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on timeout error', async () => {
      const error = new Error('timeout of 5000ms exceeded');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.searchAddress(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      mockAxiosInstance.get.mockRejectedValue(error);

      try {
        await client.searchAddress(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Kakao Local');
      }
    });

    it('should include custom message in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      mockAxiosInstance.get.mockRejectedValue(error);

      try {
        await client.searchAddress(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        const exception = e as ExternalApiException;
        const response = exception.getResponse() as { message: string };
        expect(response.message).toBe('주소 검색에 실패했습니다.');
      }
    });

    it('should handle multiple addresses in response', async () => {
      const mockResponse = {
        data: {
          meta: {
            total_count: 2,
            pageable_count: 2,
            is_end: true,
          },
          documents: [
            {
              address_name: '서울특별시 강남구 역삼동',
              address_type: 'REGION',
              x: '127.0398765',
              y: '37.5012345',
              address: {
                address_name: '서울특별시 강남구 역삼동',
                region_1depth_name: '서울특별시',
                region_2depth_name: '강남구',
                region_3depth_name: '역삼동',
              },
              road_address: {
                address_name: '서울특별시 강남구 테헤란로 123',
                region_1depth_name: '서울특별시',
                region_2depth_name: '강남구',
                region_3depth_name: '역삼동',
                road_name: '테헤란로',
                zone_no: '06234',
              },
            },
            {
              address_name: '서울특별시 강남구 삼성동',
              address_type: 'REGION',
              x: '127.0632145',
              y: '37.5125234',
              address: {
                address_name: '서울특별시 강남구 삼성동',
                region_1depth_name: '서울특별시',
                region_2depth_name: '강남구',
                region_3depth_name: '삼성동',
              },
            },
          ],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0].address).toBe('서울특별시 강남구 역삼동');
      expect(result.addresses[1].address).toBe('서울특별시 강남구 삼성동');
    });

    it('should handle documents with missing coordinates', async () => {
      const mockResponse = {
        data: {
          meta: {
            total_count: 1,
            pageable_count: 1,
            is_end: true,
          },
          documents: [
            {
              address_name: '서울특별시 강남구 역삼동',
              address_type: 'REGION',
              x: '',
              y: '',
              address: {
                address_name: '서울특별시 강남구 역삼동',
                region_1depth_name: '서울특별시',
                region_2depth_name: '강남구',
                region_3depth_name: '역삼동',
              },
            },
          ],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchAddress(query);

      expect(result.addresses[0].latitude).toBe('');
      expect(result.addresses[0].longitude).toBe('');
    });
  });
});

/**
 * Helper function to create Axios errors for testing
 */
function createAxiosError(status: number, message: string): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.config = {} as InternalAxiosRequestConfig;
  error.toJSON = () => ({});
  error.name = 'AxiosError';
  error.response = {
    data: { error: message },
    status,
    statusText: message,
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
  return error;
}
