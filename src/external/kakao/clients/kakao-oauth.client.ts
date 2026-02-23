import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ErrorCode } from '@/common/constants/error-codes';
import { TEST_MODE } from '@/common/constants/test-mode.constants';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { isTestMode } from '@/common/utils/test-mode.util';
import { logOAuthError } from '@/common/utils/external-api-error.util';
import { KAKAO_OAUTH_CONFIG } from '../kakao.constants';
import { KakaoOAuthTokenResponse, KakaoUserProfile } from '../kakao.types';

@Injectable()
export class KakaoOAuthClient {
  private readonly logger = new Logger(KakaoOAuthClient.name);
  private readonly clientId: string;
  private readonly redirectUri: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('OAUTH_KAKAO_CLIENT_ID', '');
    this.redirectUri = this.config.get<string>('OAUTH_KAKAO_REDIRECT_URI', '');
  }

  /**
   * 인가 코드로 액세스 토큰 발급
   */
  async getAccessToken(code: string): Promise<KakaoOAuthTokenResponse> {
    // 테스트 모드 분기
    if (isTestMode()) {
      const testResponse = this.handleTestCode(code);
      if (testResponse) {
        return testResponse;
      }
    }

    if (!this.clientId || !this.redirectUri) {
      throw new ConfigMissingException([
        'OAUTH_KAKAO_CLIENT_ID',
        'OAUTH_KAKAO_REDIRECT_URI',
      ]);
    }

    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', this.clientId);
    params.append('redirect_uri', this.redirectUri);
    params.append('grant_type', 'authorization_code');

    try {
      const response = await firstValueFrom(
        this.httpService.post<KakaoOAuthTokenResponse>(
          KAKAO_OAUTH_CONFIG.TOKEN_URL,
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      logOAuthError(this.logger, 'Kakao', error, '토큰 발급');
      throw new ExternalApiException(
        'Kakao OAuth',
        error,
        'Kakao 토큰 발급에 실패했습니다.',
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }

  /**
   * 액세스 토큰으로 사용자 프로필 조회
   */
  async getUserProfile(accessToken: string): Promise<KakaoUserProfile> {
    // 테스트 모드 분기
    if (isTestMode()) {
      const testProfile = this.getTestProfile(accessToken);
      if (testProfile) {
        return testProfile;
      }
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<KakaoUserProfile>(
          KAKAO_OAUTH_CONFIG.USER_INFO_URL,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      logOAuthError(this.logger, 'Kakao', error, '프로필 조회');
      throw new ExternalApiException(
        'Kakao OAuth',
        error,
        'Kakao 프로필 조회에 실패했습니다.',
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }

  /**
   * 테스트 코드 처리 (테스트 모드 전용)
   */
  private handleTestCode(code: string): KakaoOAuthTokenResponse | null {
    const { OAUTH_CODES } = TEST_MODE;
    switch (code) {
      case OAUTH_CODES.VALID:
        return {
          access_token: 'test-kakao-valid-token',
          token_type: 'bearer',
          expires_in: 3600,
        };
      case OAUTH_CODES.NO_NAME:
        return {
          access_token: 'test-kakao-no-name-token',
          token_type: 'bearer',
          expires_in: 3600,
        };
      case OAUTH_CODES.DELETED_USER:
        return {
          access_token: 'test-kakao-deleted-token',
          token_type: 'bearer',
          expires_in: 3600,
        };
      case OAUTH_CODES.INVALID:
        throw new UnauthorizedException('Invalid authorization code');
      default:
        return null;
    }
  }

  /**
   * 테스트 프로필 반환 (테스트 모드 전용)
   */
  private getTestProfile(accessToken: string): KakaoUserProfile | null {
    const { SOCIAL_IDS, USERS } = TEST_MODE;
    switch (accessToken) {
      case 'test-kakao-valid-token':
        return {
          id: SOCIAL_IDS.KAKAO.VALID,
          kakao_account: {
            email: USERS.OAUTH_KAKAO.email,
            profile: { nickname: USERS.OAUTH_KAKAO.name },
          },
          properties: { nickname: USERS.OAUTH_KAKAO.name },
        };
      case 'test-kakao-no-name-token':
        return {
          id: SOCIAL_IDS.KAKAO.NO_NAME,
          kakao_account: {
            email: 'noname@example.com',
            profile: { nickname: undefined },
          },
          properties: {},
        };
      case 'test-kakao-deleted-token':
        return {
          id: SOCIAL_IDS.KAKAO.DELETED,
          kakao_account: {
            email: USERS.DELETED.email,
            profile: { nickname: USERS.DELETED.name },
          },
          properties: { nickname: USERS.DELETED.name },
        };
      default:
        return null;
    }
  }
}
