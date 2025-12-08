import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import { ConfigMissingException } from '../../../common/exceptions/config-missing.exception';
import { GOOGLE_OAUTH_CONFIG } from '../google.constants';

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
    this.clientSecret = this.config.get<string>('OAUTH_GOOGLE_CLIENT_SECRET', '');
    this.redirectUri = this.config.get<string>('OAUTH_GOOGLE_REDIRECT_URI', '');
  }

  /**
   * 인가 코드로 액세스 토큰 발급
   */
  async getAccessToken(code: string): Promise<GoogleOAuthTokenResponse> {
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
    } catch (error: any) {
      this.logOAuthError('토큰 발급', error);
      throw new ExternalApiException('Google OAuth', error, 'Google 토큰 발급에 실패했습니다.');
    }
  }

  /**
   * 액세스 토큰으로 사용자 프로필 조회
   */
  async getUserProfile(accessToken: string): Promise<GoogleUserProfile> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GoogleUserProfile>(GOOGLE_OAUTH_CONFIG.USERINFO_URL, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logOAuthError('프로필 조회', error);
      throw new ExternalApiException('Google OAuth', error, 'Google 프로필 조회에 실패했습니다.');
    }
  }

  private logOAuthError(operation: string, error: any): void {
    this.logger.error(`=== Google OAuth ${operation} 에러 ===`);
    this.logger.error(`에러 타입: ${error.name}`);
    this.logger.error(`에러 메시지: ${error.message}`);

    if (error.response) {
      this.logger.error(`응답 상태 코드: ${error.response.status}`);
      this.logger.error(`응답 데이터: ${JSON.stringify(error.response.data)}`);
    }
  }
}

