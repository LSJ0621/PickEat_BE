import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { KakaoOAuthClient } from './kakao-oauth.client';
import {
  createMockHttpService,
  createAxiosResponse,
  createAxiosError,
  mockKakaoOAuthResponses,
  createMockConfigService,
} from '../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';

describe('KakaoOAuthClient', () => {
  let client: KakaoOAuthClient;
  let httpService: any;
  let configService: any;

  beforeEach(async () => {
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
});
