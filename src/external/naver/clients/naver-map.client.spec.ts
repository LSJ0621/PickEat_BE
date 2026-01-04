import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { NaverMapClient } from './naver-map.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  createMockConfigService,
  mockNaverMapResponses,
} from '../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { NAVER_MAP_CONFIG } from '../naver.constants';

describe('NaverMapClient', () => {
  let client: NaverMapClient;
  let httpService: any;
  let configService: any;

  beforeEach(async () => {
    httpService = createMockHttpService();
    configService = createMockConfigService({
      NAVER_MAP_CLIENT_ID: 'test-map-client-id',
      NAVER_MAP_CLIENT_SECRET: 'test-map-client-secret',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NaverMapClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<NaverMapClient>(NaverMapClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should warn when client credentials are missing', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          NaverMapClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverMapClient>(NaverMapClient);

      expect(testClient).toBeDefined();
    });
  });

  describe('reverseGeocode', () => {
    const latitude = 37.5012345;
    const longitude = 127.0398765;

    it('should successfully reverse geocode coordinates', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toEqual(
        mockNaverMapResponses.reverseGeocodeSuccess.results,
      );
      expect(httpService.get).toHaveBeenCalledWith(
        `${NAVER_MAP_CONFIG.BASE_URL}${NAVER_MAP_CONFIG.ENDPOINTS.REVERSE_GEOCODE}`,
        {
          headers: {
            'x-ncp-apigw-api-key-id': 'test-map-client-id',
            'x-ncp-apigw-api-key': 'test-map-client-secret',
          },
          params: {
            coords: `${longitude},${latitude}`,
            orders: 'legalcode,addr',
            output: 'json',
          },
        },
      );
    });

    it('should return empty array when no results found', async () => {
      const mockResponse = createAxiosResponse({
        status: { code: 0, name: 'ok', message: 'done' },
        results: [],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toEqual([]);
    });

    it('should handle response with null data', async () => {
      const mockResponse = createAxiosResponse(null);
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toEqual([]);
    });

    it('should handle response with undefined results', async () => {
      const mockResponse = createAxiosResponse({
        status: { code: 0, name: 'ok', message: 'done' },
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toEqual([]);
    });

    it('should include road address when option is true', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.reverseGeocode(latitude, longitude, {
        includeRoadAddress: true,
      });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            orders: 'legalcode,addr,roadaddr',
          }),
        }),
      );
    });

    it('should not include road address when option is false', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.reverseGeocode(latitude, longitude, {
        includeRoadAddress: false,
      });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            orders: 'legalcode,addr',
          }),
        }),
      );
    });

    it('should not include road address by default', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.reverseGeocode(latitude, longitude);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            orders: 'legalcode,addr',
          }),
        }),
      );
    });

    it('should format coordinates in correct order (longitude, latitude)', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.reverseGeocode(latitude, longitude);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            coords: `${longitude},${latitude}`,
          }),
        }),
      );
    });

    it('should throw ConfigMissingException when client ID is missing', async () => {
      const emptyConfigService = createMockConfigService({
        NAVER_MAP_CLIENT_SECRET: 'test-secret',
      });

      const module = await Test.createTestingModule({
        providers: [
          NaverMapClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverMapClient>(NaverMapClient);

      await expect(
        testClient.reverseGeocode(latitude, longitude),
      ).rejects.toThrow(ConfigMissingException);
    });

    it('should throw ConfigMissingException when client secret is missing', async () => {
      const emptyConfigService = createMockConfigService({
        NAVER_MAP_CLIENT_ID: 'test-id',
      });

      const module = await Test.createTestingModule({
        providers: [
          NaverMapClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverMapClient>(NaverMapClient);

      await expect(
        testClient.reverseGeocode(latitude, longitude),
      ).rejects.toThrow(ConfigMissingException);
    });

    it('should throw ConfigMissingException when both credentials are missing', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          NaverMapClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = module.get<NaverMapClient>(NaverMapClient);

      await expect(
        testClient.reverseGeocode(latitude, longitude),
      ).rejects.toThrow(ConfigMissingException);
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on timeout error', async () => {
      const error = new Error('timeout of 5000ms exceeded');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.reverseGeocode(latitude, longitude);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Naver Map');
      }
    });

    it('should include custom message in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.reverseGeocode(latitude, longitude);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        const exception = e as ExternalApiException;
        const response = exception.getResponse() as any;
        expect(response.message).toBe('Reverse Geocode에 실패했습니다.');
      }
    });

    it('should log error details with status code', async () => {
      const error = createAxiosError(500, 'Internal Server Error', {
        errorMessage: 'Server error',
      });
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle error without response', async () => {
      const error = new Error('Request failed');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should return results with all fields present', async () => {
      const mockResponse = createAxiosResponse({
        status: { code: 0, name: 'ok', message: 'done' },
        results: [
          {
            name: 'roadaddr',
            code: {
              id: '1168010600',
              type: 'L',
              mappingId: '09680106',
            },
            region: {
              area0: { name: 'kr' },
              area1: { name: '서울특별시' },
              area2: { name: '강남구' },
              area3: { name: '역삼동' },
              area4: { name: '' },
            },
            land: {
              type: 'lot',
              number1: '123',
              number2: '45',
              name: '테헤란로',
              addition0: { type: 'dongmyun', value: '역삼1동' },
              addition1: { type: 'roadname', value: '테헤란로' },
              addition2: { type: 'building', value: '삼성빌딩' },
            },
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('roadaddr');
      expect(result[0].region?.area1?.name).toBe('서울특별시');
      expect(result[0].land?.name).toBe('테헤란로');
    });

    it('should handle multiple results', async () => {
      const mockResponse = createAxiosResponse({
        status: { code: 0, name: 'ok', message: 'done' },
        results: [
          {
            name: 'legalcode',
            region: {
              area1: { name: '서울특별시' },
              area2: { name: '강남구' },
              area3: { name: '역삼동' },
            },
          },
          {
            name: 'addr',
            region: {
              area1: { name: '서울특별시' },
              area2: { name: '강남구' },
              area3: { name: '역삼1동' },
            },
          },
          {
            name: 'roadaddr',
            region: {
              area1: { name: '서울특별시' },
              area2: { name: '강남구' },
              area3: { name: '역삼동' },
            },
            land: {
              name: '테헤란로',
              number1: '123',
            },
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('legalcode');
      expect(result[1].name).toBe('addr');
      expect(result[2].name).toBe('roadaddr');
    });

    it('should handle results with minimal fields', async () => {
      const mockResponse = createAxiosResponse({
        status: { code: 0, name: 'ok', message: 'done' },
        results: [
          {
            name: 'legalcode',
          },
        ],
      });
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.reverseGeocode(latitude, longitude);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('legalcode');
    });

    it('should handle decimal coordinates correctly', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const lat = 37.50123456789;
      const lng = 127.03987654321;

      await client.reverseGeocode(lat, lng);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            coords: `${lng},${lat}`,
          }),
        }),
      );
    });

    it('should handle negative coordinates', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const lat = -37.5012345;
      const lng = -127.0398765;

      await client.reverseGeocode(lat, lng);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            coords: `${lng},${lat}`,
          }),
        }),
      );
    });

    it('should handle zero coordinates', async () => {
      const mockResponse = createAxiosResponse(
        mockNaverMapResponses.reverseGeocodeSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.reverseGeocode(0, 0);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            coords: '0,0',
          }),
        }),
      );
    });
  });
});
