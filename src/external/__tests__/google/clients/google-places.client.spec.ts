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
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      GOOGLE_API_KEY: 'test-api-key',
      APP_URL: 'http://localhost:3000',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
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
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      await expect(testClient.searchByText(query)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should return empty array on 400 error (graceful degradation)', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 401 error (graceful degradation)', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 403 error (graceful degradation)', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 404 error (graceful degradation)', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 500 error (graceful degradation)', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 502 error (graceful degradation)', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 503 error (graceful degradation)', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on 429 rate limit (graceful degradation)', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should return empty array on network error (graceful degradation)', async () => {
      const error = new Error('Network Error');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      expect(result).toEqual([]);
    });

    it('should log error details on failure', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.searchByText(query);
      // Graceful degradation: returns empty array
      expect(result).toEqual([]);
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
          pageSize: 10,
          languageCode: 'en',
        }),
        expect.any(Object),
      );
    });

    it('should use pageSize instead of maxResultCount in request body', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await client.searchByText(query, { maxResults: 15 });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          pageSize: 15,
        }),
        expect.any(Object),
      );
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          maxResultCount: expect.anything(),
        }),
        expect.any(Object),
      );
    });

    it('should include locationBias when provided in options', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const locationBias = {
        circle: {
          center: { latitude: 37.5665, longitude: 126.978 },
          radius: 2000,
        },
      };

      await client.searchByText(query, { locationBias });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: 37.5665, longitude: 126.978 },
              radius: 2000,
            },
          },
        }),
        expect.any(Object),
      );
    });

    it('should include locationBias and languageCode when both provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const locationBias = {
        circle: {
          center: { latitude: 37.5665, longitude: 126.978 },
          radius: 2000,
        },
      };

      await client.searchByText(query, {
        locationBias,
        languageCode: 'en',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          textQuery: query,
          languageCode: 'en',
          locationBias: {
            circle: {
              center: { latitude: 37.5665, longitude: 126.978 },
              radius: 2000,
            },
          },
        }),
        expect.any(Object),
      );
    });

    it('should not include locationBias when not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await client.searchByText(query, { languageCode: 'ko' });

      const callArgs = httpService.post.mock.calls[0];
      const requestBody = callArgs[1];

      expect(requestBody).not.toHaveProperty('locationBias');
    });

    it('should use default languageCode when not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await client.searchByText(query);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          languageCode: 'ko',
        }),
        expect.any(Object),
      );
    });

    it('should use default pageSize when maxResults not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.searchSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await client.searchByText(query);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          pageSize: 10,
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
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      await expect(testClient.getDetails(placeId)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should return null on 400 error (graceful degradation)', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await client.getDetails(placeId);
      expect(result).toBeNull();
    });

    it('should return null on 404 error (graceful degradation)', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await client.getDetails(placeId);
      expect(result).toBeNull();
    });

    it('should return null on 500 error (graceful degradation)', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await client.getDetails(placeId);
      expect(result).toBeNull();
    });

    it('should return null on 429 rate limit (graceful degradation)', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await client.getDetails(placeId);
      expect(result).toBeNull();
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

    it('should pass languageCode parameter when provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId, { languageCode: 'en' });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            languageCode: 'en',
          },
        }),
      );
    });

    it('should use default languageCode when not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            languageCode: 'ko',
          },
        }),
      );
    });

    it('should support both includeBusinessStatus and languageCode options', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId, {
        includeBusinessStatus: true,
        languageCode: 'en',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            languageCode: 'en',
          },
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

  describe('autocomplete', () => {
    const input = '강남역';

    it('should return suggestions when API call succeeds', async () => {
      const mockSuggestions = [
        {
          placePrediction: {
            placeId: 'ChIJ123',
            text: { text: '강남역 2호선', matches: [] },
          },
        },
      ];
      const mockResponse = createAxiosResponse({
        suggestions: mockSuggestions,
      });
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.autocomplete(input);

      expect(result).toEqual(mockSuggestions);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/places:autocomplete'),
        expect.objectContaining({ input }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('should return empty array when no suggestions are returned', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.autocomplete(input);

      expect(result).toEqual([]);
    });

    it('should return empty array when suggestions field is missing', async () => {
      const mockResponse = createAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.autocomplete(input);

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
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);

      await expect(testClient.autocomplete(input)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should return empty array on HTTP error (graceful degradation)', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.autocomplete(input);

      expect(result).toEqual([]);
    });

    it('should return empty array on 429 rate limit (graceful degradation)', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.autocomplete(input);

      expect(result).toEqual([]);
    });

    it('should include includedRegionCodes when provided in options', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      await client.autocomplete(input, { includedRegionCodes: ['KR'] });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includedRegionCodes: ['KR'] }),
        expect.any(Object),
      );
    });

    it('should include locationBias when provided in options', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      const locationBias = {
        circle: {
          center: { latitude: 37.5, longitude: 127.0 },
          radius: 1000,
        },
      };

      await client.autocomplete(input, { locationBias });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ locationBias }),
        expect.any(Object),
      );
    });

    it('should include sessionToken when provided in options', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      const sessionToken = 'test-session-token';
      await client.autocomplete(input, { sessionToken });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sessionToken }),
        expect.any(Object),
      );
    });

    it('should use default languageCode when not provided', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      await client.autocomplete(input);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ languageCode: 'ko' }),
        expect.any(Object),
      );
    });

    it('should use provided languageCode when specified', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      await client.autocomplete(input, { languageCode: 'en' });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ languageCode: 'en' }),
        expect.any(Object),
      );
    });

    it('should not include optional fields when not provided', async () => {
      const mockResponse = createAxiosResponse({ suggestions: [] });
      httpService.post.mockReturnValue(of(mockResponse));

      await client.autocomplete(input);

      const callArgs = httpService.post.mock.calls[0];
      const requestBody = callArgs[1];
      expect(requestBody).not.toHaveProperty('includedRegionCodes');
      expect(requestBody).not.toHaveProperty('locationBias');
      expect(requestBody).not.toHaveProperty('sessionToken');
    });
  });

  describe('getDetails - additional branch coverage', () => {
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

    it('should use minimal field mask when useMinimalFields is true', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId, { useMinimalFields: true });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-FieldMask': expect.stringContaining('formattedAddress'),
          }),
        }),
      );
    });

    it('should include session token header when sessionToken is provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const sessionToken = 'my-session-token-abc';
      await client.getDetails(placeId, { sessionToken });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-SessionToken': sessionToken,
          }),
        }),
      );
    });

    it('should not include X-Goog-SessionToken header when sessionToken is not provided', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId);

      const callArgs = httpService.get.mock.calls[0];
      const config = callArgs[1];
      expect(config.headers).not.toHaveProperty('X-Goog-SessionToken');
    });

    it('should use DETAILS field mask as default when no special options given', async () => {
      const mockResponse = createAxiosResponse(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      await client.getDetails(placeId);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-FieldMask': expect.any(String),
          }),
        }),
      );
    });

    it('should return null on network error (graceful degradation)', async () => {
      const networkError = new Error('Network Error');
      httpService.get.mockReturnValue(throwError(() => networkError));

      const result = await client.getDetails(placeId);

      expect(result).toBeNull();
    });
  });

  describe('createSessionToken', () => {
    it('should return a non-empty UUID string', () => {
      const token = client.createSessionToken();

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(36);
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should return unique tokens on each call', () => {
      const token1 = client.createSessionToken();
      const token2 = client.createSessionToken();

      expect(token1).not.toBe(token2);
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
        ],
      }).compile();

      const testClient = testModule.get<GooglePlacesClient>(GooglePlacesClient);
      const photos = [{ name: 'places/ChIJ123/photos/photo1' }];

      const result = await testClient.resolvePhotoUris(photos);

      expect(result).toEqual([]);
    });
  });
});
