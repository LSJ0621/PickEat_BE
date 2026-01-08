import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { GooglePlacesClient } from '../../../google/clients/google-places.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  mockGooglePlacesResponses,
  createMockConfigService,
  createMockPrometheusService,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { PrometheusService } from '@/prometheus/prometheus.service';

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let prometheusService: ReturnType<typeof createMockPrometheusService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      GOOGLE_API_KEY: 'test-api-key',
      APP_URL: 'http://localhost:3000',
    });
    prometheusService = createMockPrometheusService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: PrometheusService, useValue: prometheusService },
      ],
    }).compile();

    client = module.get<GooglePlacesClient>(GooglePlacesClient);
  });

  describe('searchByText', () => {
    const query = '강남 맛집';

    it('should successfully search places', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.searchByText(query);

      expect(result).toEqual(mockGooglePlacesResponses.searchSuccess.places);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/places:searchText'),
        expect.objectContaining({
          textQuery: query,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('should return empty array when no places found', async () => {
      const mockResponse = createAxiosResponse({ places: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.searchByText(query);

      expect(result).toEqual([]);
    });

    it('should throw ConfigMissingException when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GooglePlacesClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
          { provide: PrometheusService, useValue: prometheusService },
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      await expect(testClient.searchByText(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.searchByText(query)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      try {
        await client.searchByText(query);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Google Places');
      }
    });

    it('should support custom options', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await client.searchByText(query, { maxResults: 10, languageCode: 'en' });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxResultCount: 10,
          languageCode: 'en',
        }),
        expect.any(Object),
      );
    });
  });

  describe('getDetails', () => {
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

    it('should successfully get place details', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getDetails(placeId);

      expect(result).toEqual(mockGooglePlacesResponses.placeDetailsSuccess);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(placeId),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('should return null when response data is null', async () => {
      const mockResponse = createAxiosResponse(null);
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getDetails(placeId);

      expect(result).toBeNull();
    });

    it('should throw ConfigMissingException when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GooglePlacesClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
          { provide: PrometheusService, useValue: prometheusService },
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      await expect(testClient.getDetails(placeId)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getDetails(placeId)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getDetails(placeId)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getDetails(placeId)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getDetails(placeId)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should support includeBusinessStatus option', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId, { includeBusinessStatus: true });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-FieldMask': expect.stringContaining('businessStatus'),
          }),
        }),
      );
    });
  });

  describe('getPhotoUri', () => {
    const photoName = 'places/ChIJ123/photos/test123';

    it('should successfully get photo URI', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.photoUriSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getPhotoUri(photoName);

      expect(result).toBe(mockGooglePlacesResponses.photoUriSuccess.photoUri);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(photoName),
        expect.objectContaining({
          params: expect.objectContaining({
            skipHttpRedirect: true,
          }),
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('should return null when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GooglePlacesClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
          { provide: PrometheusService, useValue: prometheusService },
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      const result = await testClient.getPhotoUri(photoName);

      expect(result).toBeNull();
    });

    it('should return null on error instead of throwing', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await client.getPhotoUri(photoName);

      expect(result).toBeNull();
    });

    it('should support custom dimensions', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.photoUriSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getPhotoUri(photoName, { maxWidth: 800, maxHeight: 600 });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            maxWidthPx: 800,
            maxHeightPx: 600,
          }),
        }),
      );
    });
  });

  describe('resolvePhotoUris', () => {
    it('should resolve multiple photo URIs', async () => {
      const photos = [
        { name: 'places/ChIJ123/photos/photo1' },
        { name: 'places/ChIJ123/photos/photo2' },
      ];
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.photoUriSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.resolvePhotoUris(photos);

      expect(result).toHaveLength(2);
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when photos is null', async () => {
      const result = await client.resolvePhotoUris(null);

      expect(result).toEqual([]);
    });

    it('should return empty array when photos is empty', async () => {
      const result = await client.resolvePhotoUris([]);

      expect(result).toEqual([]);
    });

    it('should filter out null results', async () => {
      const photos = [
        { name: 'places/ChIJ123/photos/photo1' },
        { name: undefined },
      ];
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.photoUriSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.resolvePhotoUris(photos);

      expect(result).toHaveLength(1);
    });

    it('should return empty array when API key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        APP_URL: 'http://localhost:3000',
      });
      const testModule = await Test.createTestingModule({
        providers: [
          GooglePlacesClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
          { provide: PrometheusService, useValue: prometheusService },
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);
      const photos = [{ name: 'places/ChIJ123/photos/photo1' }];

      const result = await testClient.resolvePhotoUris(photos);

      expect(result).toEqual([]);
    });
  });
});
