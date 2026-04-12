import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { UnauthorizedException } from '@nestjs/common';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { TEST_MODE } from '@/common/constants/test-mode.constants';
import {
  createMockHttpService,
  createMockConfigService,
  createAxiosResponse,
  createAxiosError,
  mockKakaoOAuthResponses,
} from '../../../../test/mocks/external-clients.mock';

describe('KakaoOAuthClient', () => {
  let client: KakaoOAuthClient;
  let mockHttpService: ReturnType<typeof createMockHttpService>;

  const buildClient = async (
    config: Record<string, unknown> = {
      OAUTH_KAKAO_CLIENT_ID: 'test-kakao-client-id',
      OAUTH_KAKAO_REDIRECT_URI: 'https://test.pickeat.com/oauth/kakao',
    },
  ) => {
    mockHttpService = createMockHttpService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KakaoOAuthClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService(config),
        },
      ],
    }).compile();
    client = module.get<KakaoOAuthClient>(KakaoOAuthClient);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('VALID 테스트 코드는 테스트 토큰을 반환하고 HTTP 호출을 하지 않는다', async () => {
      await buildClient();
      const result = await client.getAccessToken(TEST_MODE.OAUTH_CODES.VALID);
      expect(result.access_token).toBe('test-kakao-valid-token');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('NO_NAME 테스트 코드는 no-name 토큰을 반환한다', async () => {
      await buildClient();
      const result = await client.getAccessToken(
        TEST_MODE.OAUTH_CODES.NO_NAME,
      );
      expect(result.access_token).toBe('test-kakao-no-name-token');
    });

    it('INVALID 테스트 코드는 UnauthorizedException을 던진다', async () => {
      await buildClient();
      await expect(
        client.getAccessToken(TEST_MODE.OAUTH_CODES.INVALID),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('설정 누락 시 ConfigMissingException을 던진다', async () => {
      await buildClient({});
      await expect(client.getAccessToken('unknown-code')).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('실 HTTP 호출 실패 시 ExternalApiException을 던진다', async () => {
      await buildClient();
      mockHttpService.post.mockReturnValue(
        throwError(() => createAxiosError(500, 'Kakao down')),
      );
      await expect(client.getAccessToken('unknown-code')).rejects.toThrow(
        ExternalApiException,
      );
    });
  });

  describe('getUserProfile', () => {
    beforeEach(() => buildClient());

    it('test-kakao-valid-token은 테스트 프로필을 반환한다', async () => {
      const profile = await client.getUserProfile('test-kakao-valid-token');
      expect(profile.kakao_account?.email).toBe(
        TEST_MODE.USERS.OAUTH_KAKAO.email,
      );
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('실 HTTP 경로에서 프로필 조회 성공 시 응답을 반환한다', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockKakaoOAuthResponses.userInfoSuccess)),
      );
      const profile = await client.getUserProfile('real-access-token');
      expect(profile.id).toBe(123456789);
    });

    it('실 HTTP 호출 실패 시 ExternalApiException을 던진다', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => createAxiosError(401, 'unauthorized')),
      );
      await expect(
        client.getUserProfile('real-access-token'),
      ).rejects.toThrow(ExternalApiException);
    });
  });
});
