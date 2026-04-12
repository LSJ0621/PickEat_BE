import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { TEST_MODE } from '@/common/constants/test-mode.constants';
import {
  createMockHttpService,
  createMockConfigService,
  createAxiosResponse,
  createAxiosError,
  mockGoogleOAuthResponses,
} from '../../../../test/mocks/external-clients.mock';

describe('GoogleOAuthClient', () => {
  let client: GoogleOAuthClient;
  let mockHttpService: ReturnType<typeof createMockHttpService>;

  const buildClient = async (
    config: Record<string, unknown> = {
      OAUTH_GOOGLE_CLIENT_ID: 'test-client-id',
      OAUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
      OAUTH_GOOGLE_REDIRECT_URI: 'https://test.pickeat.com/oauth/google',
    },
  ) => {
    mockHttpService = createMockHttpService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService(config),
        },
      ],
    }).compile();
    client = module.get<GoogleOAuthClient>(GoogleOAuthClient);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAccessToken (테스트 모드 분기)', () => {
    beforeEach(() => buildClient());

    it('VALID 코드는 테스트 토큰을 즉시 반환한다', async () => {
      const result = await client.getAccessToken(TEST_MODE.OAUTH_CODES.VALID);
      expect(result.access_token).toBe('test-google-valid-token');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('INVALID 코드는 UnauthorizedException을 던진다', async () => {
      await expect(
        client.getAccessToken(TEST_MODE.OAUTH_CODES.INVALID),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('DELETED_USER 코드는 deleted 토큰을 반환한다', async () => {
      const result = await client.getAccessToken(
        TEST_MODE.OAUTH_CODES.DELETED_USER,
      );
      expect(result.access_token).toBe('test-google-deleted-token');
    });
  });

  describe('getAccessToken (실 HTTP 경로)', () => {
    it('설정 누락 시 ConfigMissingException을 던진다', async () => {
      await buildClient({});
      await expect(client.getAccessToken('unknown-code')).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('API 호출 실패 시 ExternalApiException으로 래핑된다', async () => {
      await buildClient();
      mockHttpService.post.mockReturnValue(
        throwError(() => createAxiosError(500, 'Google down')),
      );
      await expect(client.getAccessToken('unknown-code')).rejects.toThrow(
        ExternalApiException,
      );
    });
  });

  describe('getUserProfile', () => {
    beforeEach(() => buildClient());

    it('테스트 토큰(test-google-valid-token)은 테스트 프로필을 즉시 반환한다', async () => {
      const profile = await client.getUserProfile('test-google-valid-token');
      expect(profile.email).toBe(TEST_MODE.USERS.OAUTH_GOOGLE.email);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('실 HTTP 경로에서 프로필 조회에 성공하면 응답을 반환한다', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGoogleOAuthResponses.userProfileSuccess)),
      );
      const profile = await client.getUserProfile('real-access-token');
      expect(profile.email).toBe('oauth-google@test-oauth.example.com');
    });

    it('HTTP 호출 실패 시 ExternalApiException을 던진다', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => createAxiosError(401, 'unauthorized')),
      );
      await expect(
        client.getUserProfile('real-access-token'),
      ).rejects.toThrow(ExternalApiException);
    });
  });
});
