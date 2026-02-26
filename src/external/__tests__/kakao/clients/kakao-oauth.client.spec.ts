import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { KakaoOAuthClient } from '../../../kakao/clients/kakao-oauth.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  mockKakaoOAuthResponses,
  createMockConfigService,
} from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import * as testModeUtil from '@/common/utils/test-mode.util';
import { TEST_MODE } from '@/common/constants/test-mode.constants';

describe('KakaoOAuthClient', () => {
  let client: KakaoOAuthClient;
  let httpService: ReturnType<typeof createMockHttpService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpService = createMockHttpService();
    configService = createMockConfigService({
      OAUTH_KAKAO_CLIENT_ID: 'test-client-id',
      OAUTH_KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KakaoOAuthClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<KakaoOAuthClient>(KakaoOAuthClient);
  });

  describe('getAccessToken', () => {
    const authCode = 'test-auth-code';

    it('should successfully get access token', async () => {
      const mockResponse = createAxiosResponse(
        mockKakaoOAuthResponses.tokenSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.getAccessToken(authCode);

      expect(result).toEqual(mockKakaoOAuthResponses.tokenSuccess);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/token'),
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
          KakaoOAuthClient,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const testClient = testModule.get<KakaoOAuthClient>(KakaoOAuthClient);

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

    it('should throw ExternalApiException on 403 error', async () => {
      const error = createAxiosError(403, 'Forbidden');
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

    it('should throw ExternalApiException on 502 error', async () => {
      const error = createAxiosError(502, 'Bad Gateway');
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

    it('should throw ExternalApiException on timeout', async () => {
      const error = new Error('ETIMEDOUT');
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
        expect((e as ExternalApiException).provider).toBe('Kakao OAuth');
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
        access_token: 'test-kakao-valid-token',
        token_type: 'bearer',
        expires_in: 3600,
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should return no-name token response for NO_NAME oauth code in test mode', async () => {
      const result = await client.getAccessToken(TEST_MODE.OAUTH_CODES.NO_NAME);

      expect(result).toEqual({
        access_token: 'test-kakao-no-name-token',
        token_type: 'bearer',
        expires_in: 3600,
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should return deleted-user token response for DELETED_USER oauth code in test mode', async () => {
      const result = await client.getAccessToken(
        TEST_MODE.OAUTH_CODES.DELETED_USER,
      );

      expect(result).toEqual({
        access_token: 'test-kakao-deleted-token',
        token_type: 'bearer',
        expires_in: 3600,
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
        mockKakaoOAuthResponses.tokenSuccess,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      const result = await client.getAccessToken('unknown-code-in-test-mode');

      expect(httpService.post).toHaveBeenCalled();
      expect(result).toEqual(mockKakaoOAuthResponses.tokenSuccess);
    });
  });

  describe('getUserProfile', () => {
    const accessToken = 'test-access-token';

    it('should successfully get user profile', async () => {
      const mockResponse = createAxiosResponse(
        mockKakaoOAuthResponses.userInfoSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getUserProfile(accessToken);

      expect(result).toEqual(mockKakaoOAuthResponses.userInfoSuccess);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/user/me'),
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

    it('should throw ExternalApiException on 503 error', async () => {
      const error = createAxiosError(503, 'Service Unavailable');
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
        expect((e as ExternalApiException).provider).toBe('Kakao OAuth');
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

    it('should return valid kakao profile for valid-token in test mode', async () => {
      const result = await client.getUserProfile('test-kakao-valid-token');

      expect(result).toEqual({
        id: TEST_MODE.SOCIAL_IDS.KAKAO.VALID,
        kakao_account: {
          email: TEST_MODE.USERS.OAUTH_KAKAO.email,
          profile: { nickname: TEST_MODE.USERS.OAUTH_KAKAO.name },
        },
        properties: { nickname: TEST_MODE.USERS.OAUTH_KAKAO.name },
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should return no-name kakao profile for no-name-token in test mode', async () => {
      const result = await client.getUserProfile('test-kakao-no-name-token');

      expect(result).toEqual({
        id: TEST_MODE.SOCIAL_IDS.KAKAO.NO_NAME,
        kakao_account: {
          email: 'noname@example.com',
          profile: { nickname: undefined },
        },
        properties: {},
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should return deleted-user kakao profile for deleted-token in test mode', async () => {
      const result = await client.getUserProfile('test-kakao-deleted-token');

      expect(result).toEqual({
        id: TEST_MODE.SOCIAL_IDS.KAKAO.DELETED,
        kakao_account: {
          email: TEST_MODE.USERS.DELETED.email,
          profile: { nickname: TEST_MODE.USERS.DELETED.name },
        },
        properties: { nickname: TEST_MODE.USERS.DELETED.name },
      });
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should fall through to real HTTP call for unknown token in test mode', async () => {
      const mockResponse = createAxiosResponse(
        mockKakaoOAuthResponses.userInfoSuccess,
      );
      httpService.get.mockReturnValue(of(mockResponse));

      const result = await client.getUserProfile('unknown-token-in-test-mode');

      expect(httpService.get).toHaveBeenCalled();
      expect(result).toEqual(mockKakaoOAuthResponses.userInfoSuccess);
    });
  });
});
