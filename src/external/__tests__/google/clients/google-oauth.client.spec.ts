import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GoogleOAuthClient } from '../../../google/clients/google-oauth.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  mockGoogleOAuthResponses,
  createMockConfigService,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import * as testModeUtil from '@/common/utils/test-mode.util';
import { TEST_MODE } from '@/common/constants/test-mode.constants';

describe('GoogleOAuthClient', () => {
  let client: GoogleOAuthClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      OAUTH_GOOGLE_CLIENT_ID: 'test-client-id',
      OAUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
      OAUTH_GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<GoogleOAuthClient>(GoogleOAuthClient);
  });

  describe('getAccessToken', () => {
    const authCode = 'test-auth-code';

    it('should successfully get access token', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleOAuthResponses.tokenSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.getAccessToken(authCode);

      expect(result).toEqual(mockGoogleOAuthResponses.tokenSuccess);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/token'),
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );
    });

    it('should throw ConfigMissingException when client credentials are missing', async () => {
      const emptyConfigService = createMockConfigService({});
      const testModule = await Test.createTestingModule({
        providers: [
          GoogleOAuthClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = testModule.get<GoogleOAuthClient>(GoogleOAuthClient);

      await expect(testClient.getAccessToken(authCode)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Invalid grant');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network error', async () => {
      const error = new Error('Network Error');
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(client.getAccessToken(authCode)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.post.mockReturnValue(throwError(() => error));

      try {
        await client.getAccessToken(authCode);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Google OAuth');
      }
    });
  });

  describe('getAccessToken - test mode branches', () => {
    beforeEach(() => {
      jest.spyOn(testModeUtil, 'isTestMode').mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return valid token response for VALID oauth code in test mode', async () => {
      const result = await client.getAccessToken(TEST_MODE.OAUTH_CODES.VALID);

      expect(result).toEqual({
        access_token: 'test-google-valid-token',
        expires_in: 3600,
        token_type: 'bearer',
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should return no-name token response for NO_NAME oauth code in test mode', async () => {
      const result = await client.getAccessToken(TEST_MODE.OAUTH_CODES.NO_NAME);

      expect(result).toEqual({
        access_token: 'test-google-no-name-token',
        expires_in: 3600,
        token_type: 'bearer',
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should return deleted-user token response for DELETED_USER oauth code in test mode', async () => {
      const result = await client.getAccessToken(
        TEST_MODE.OAUTH_CODES.DELETED_USER,
      );

      expect(result).toEqual({
        access_token: 'test-google-deleted-token',
        expires_in: 3600,
        token_type: 'bearer',
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for INVALID oauth code in test mode', async () => {
      await expect(
        client.getAccessToken(TEST_MODE.OAUTH_CODES.INVALID),
      ).rejects.toThrow(UnauthorizedException);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should fall through to real HTTP call for unknown code in test mode', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleOAuthResponses.tokenSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.getAccessToken('unknown-code-in-test-mode');

      expect(httpService.post).toHaveBeenCalled();
      expect(result).toEqual(mockGoogleOAuthResponses.tokenSuccess);
    });
  });

  describe('getUserProfile', () => {
    const accessToken = 'test-access-token';

    it('should successfully get user profile', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleOAuthResponses.userProfileSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getUserProfile(accessToken);

      expect(result).toEqual(mockGoogleOAuthResponses.userProfileSuccess);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/userinfo'),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );
    });

    it('should throw ExternalApiException on 400 error', async () => {
      const error = createAxiosError(400, 'Bad Request');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 401 error', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 404 error', async () => {
      const error = createAxiosError(404, 'Not Found');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 500 error', async () => {
      const error = createAxiosError(500, 'Internal Server Error');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on 429 rate limit', async () => {
      const error = createAxiosError(429, 'Too Many Requests');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException on network timeout', async () => {
      const error = new Error('ETIMEDOUT');
      httpService.get.mockReturnValue(throwError(() => error));

      await expect(client.getUserProfile(accessToken)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should include provider info in exception', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      httpService.get.mockReturnValue(throwError(() => error));

      try {
        await client.getUserProfile(accessToken);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Google OAuth');
      }
    });
  });

  describe('getUserProfile - test mode branches', () => {
    beforeEach(() => {
      jest.spyOn(testModeUtil, 'isTestMode').mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return valid google profile for valid-token in test mode', async () => {
      const result = await client.getUserProfile('test-google-valid-token');

      expect(result).toEqual({
        sub: TEST_MODE.SOCIAL_IDS.GOOGLE.VALID,
        email: TEST_MODE.USERS.OAUTH_GOOGLE.email,
        email_verified: true,
        name: TEST_MODE.USERS.OAUTH_GOOGLE.name,
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should return no-name google profile for no-name-token in test mode', async () => {
      const result = await client.getUserProfile('test-google-no-name-token');

      expect(result).toEqual({
        sub: TEST_MODE.SOCIAL_IDS.GOOGLE.NO_NAME,
        email: 'noname-google@example.com',
        email_verified: true,
        name: undefined,
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should return deleted-user google profile for deleted-token in test mode', async () => {
      const result = await client.getUserProfile('test-google-deleted-token');

      expect(result).toEqual({
        sub: TEST_MODE.SOCIAL_IDS.GOOGLE.DELETED,
        email: TEST_MODE.USERS.DELETED.email,
        email_verified: true,
        name: TEST_MODE.USERS.DELETED.name,
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should fall through to real HTTP call for unknown token in test mode', async () => {
      const mockResponse = createAxiosResponse(
        mockGoogleOAuthResponses.userProfileSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getUserProfile('unknown-token-in-test-mode');

      expect(httpService.get).toHaveBeenCalled();
      expect(result).toEqual(mockGoogleOAuthResponses.userProfileSuccess);
    });
  });
});
