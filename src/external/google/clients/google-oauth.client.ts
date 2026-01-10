import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import { GOOGLE_OAUTH_CONFIG } from '../google.constants';
import { TEST_MODE } from '../../../common/constants/test-mode.constants';
import { isTestMode } from '../../../common/utils/test-mode.util';

/**
 * Google OAuth 토큰 응답
 */
export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

/**
 * Google 사용자 프로필
 */
export interface GoogleUserProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

@Injectable()
export class GoogleOAuthClient {
  private readonly logger = new Logger(GoogleOAuthClient.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('OAUTH_GOOGLE_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>(
      'OAUTH_GOOGLE_CLIENT_SECRET',
      '',
    );
    this.redirectUri = this.config.get<string>('OAUTH_GOOGLE_REDIRECT_URI', '');
  }

  /**
   * 인가 코드로 액세스 토큰 발급
   */
  async getAccessToken(code: string): Promise<GoogleOAuthTokenResponse> {
    // 테스트 모드 분기
    if (isTestMode()) {
      const testResponse = this.handleTestCode(code);
      if (testResponse) {
        return testResponse;
      }
    }

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ConfigMissingException([
        'OAUTH_GOOGLE_CLIENT_ID',
        'OAUTH_GOOGLE_CLIENT_SECRET',
        'OAUTH_GOOGLE_REDIRECT_URI',
      ]);
    }

    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('redirect_uri', this.redirectUri);
    params.append('grant_type', 'authorization_code');

    try {
      const response = await firstValueFrom(
        this.httpService.post<GoogleOAuthTokenResponse>(
          GOOGLE_OAUTH_CONFIG.TOKEN_URL,
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      this.logOAuthError('토큰 발급', error);
      throw new ExternalApiException(
        'Google OAuth',
        error,
        'Google 토큰 발급에 실패했습니다.',
      );
    }
  }

  /**
   * 액세스 토큰으로 사용자 프로필 조회
   */
  async getUserProfile(accessToken: string): Promise<GoogleUserProfile> {
    // 테스트 모드 분기
    if (isTestMode()) {
      const testProfile = this.getTestProfile(accessToken);
      if (testProfile) {
        return testProfile;
      }
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<GoogleUserProfile>(
          GOOGLE_OAUTH_CONFIG.USERINFO_URL,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      this.logOAuthError('프로필 조회', error);
      throw new ExternalApiException(
        'Google OAuth',
        error,
        'Google 프로필 조회에 실패했습니다.',
      );
    }
  }

  /**
   * 테스트 모드에서 OAuth 코드 처리
   */
  private handleTestCode(code: string): GoogleOAuthTokenResponse | null {
    const { OAUTH_CODES } = TEST_MODE;
    switch (code) {
      case OAUTH_CODES.VALID:
        return {
          access_token: 'test-google-valid-token',
          expires_in: 3600,
          token_type: 'bearer',
        };
      case OAUTH_CODES.NO_NAME:
        return {
          access_token: 'test-google-no-name-token',
          expires_in: 3600,
          token_type: 'bearer',
        };
      case OAUTH_CODES.DELETED_USER:
        return {
          access_token: 'test-google-deleted-token',
          expires_in: 3600,
          token_type: 'bearer',
        };
      case OAUTH_CODES.INVALID:
        throw new UnauthorizedException('Invalid authorization code');
      default:
        return null;
    }
  }

  /**
   * 테스트 모드에서 액세스 토큰으로 테스트 프로필 반환
   */
  private getTestProfile(accessToken: string): GoogleUserProfile | null {
    const { SOCIAL_IDS, USERS } = TEST_MODE;
    switch (accessToken) {
      case 'test-google-valid-token':
        return {
          sub: SOCIAL_IDS.GOOGLE.VALID,
          email: USERS.REGULAR.email,
          email_verified: true,
          name: USERS.REGULAR.name,
        };
      case 'test-google-no-name-token':
        return {
          sub: SOCIAL_IDS.GOOGLE.NO_NAME,
          email: 'noname-google@example.com',
          email_verified: true,
          name: undefined,
        };
      case 'test-google-deleted-token':
        return {
          sub: SOCIAL_IDS.GOOGLE.DELETED,
          email: USERS.DELETED.email,
          email_verified: true,
          name: USERS.DELETED.name,
        };
      default:
        return null;
    }
  }

  private logOAuthError(operation: string, error: unknown): void {
    this.logger.error(`=== Google OAuth ${operation} 에러 ===`);

    if (error instanceof Error) {
      this.logger.error(`에러 타입: ${error.name}`);
      this.logger.error(`에러 메시지: ${error.message}`);
    } else {
      this.logger.error(`에러 메시지: ${String(error)}`);
    }

    // Check if error has response property (axios error)
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown };
      };
      if (axiosError.response) {
        this.logger.error(`응답 상태 코드: ${axiosError.response.status}`);
        this.logger.error(
          `응답 데이터: ${JSON.stringify(axiosError.response.data)}`,
        );
      }
    }
  }
}
