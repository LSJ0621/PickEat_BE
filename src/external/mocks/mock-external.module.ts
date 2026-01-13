import { Module, Logger } from '@nestjs/common';

// Real client imports (for token aliasing)
import { GooglePlacesClient } from '../google/clients/google-places.client';
import { GoogleSearchClient } from '../google/clients/google-search.client';
import { GoogleOAuthClient } from '../google/clients/google-oauth.client';
import { KakaoOAuthClient } from '../kakao/clients/kakao-oauth.client';
import { KakaoLocalClient } from '../kakao/clients/kakao-local.client';
import { NaverSearchClient } from '../naver/clients/naver-search.client';
import { NaverMapClient } from '../naver/clients/naver-map.client';
import { S3Client } from '../aws/clients/s3.client';
import { DiscordWebhookClient } from '../discord/clients/discord-webhook.client';

// Service imports (for E2E mock)
import { TwoStageMenuService } from '@/menu/services/two-stage-menu.service';
import { OpenAiPlacesService } from '@/menu/services/openai-places.service';
import { LocationService } from '../naver/services/location.service';

// Mock implementations
import { MockGooglePlacesClient } from './mock-google-places.client';
import { MockGoogleSearchClient } from './mock-google-search.client';
import { MockKakaoLocalClient } from './mock-kakao-local.client';
import { MockNaverSearchClient } from './mock-naver-search.client';
import { MockNaverMapClient } from './mock-naver-map.client';
import { MockS3Client } from './mock-s3.client';
import { MockDiscordWebhookClient } from './mock-discord-webhook.client';
import { MockTwoStageMenuService } from './mock-two-stage-menu.service';
import { MockOpenAiPlacesService } from './mock-openai-places.service';
import { MockLocationService } from './mock-location.service';

const logger = new Logger('MockExternalModule');

/**
 * E2E 테스트용 Mock External 모듈
 *
 * E2E_MOCK=true 환경에서 실제 외부 API 클라이언트 대신
 * Mock 클라이언트를 주입합니다.
 *
 * 참고: OAuth 클라이언트(Google, Kakao)는 이미 isTestMode() 분기가 있으므로
 * 실제 클라이언트를 그대로 사용하되, mock 응답을 반환합니다.
 */
@Module({
  providers: [
    // Google Places - mock 사용
    {
      provide: GooglePlacesClient,
      useClass: MockGooglePlacesClient,
    },
    // Google Search (CSE) - mock 사용
    {
      provide: GoogleSearchClient,
      useClass: MockGoogleSearchClient,
    },
    // Google OAuth - 실제 클라이언트 (내부 테스트 모드 분기 있음)
    // HttpService 의존성이 없으므로 별도 처리 필요
    {
      provide: GoogleOAuthClient,
      useFactory: () => {
        logger.log('[MOCK] GoogleOAuthClient - using test mode branching');
        // 실제 클라이언트가 isTestMode()로 mock 응답 반환
        // 여기서는 mock stub만 제공
        return {
          getAccessToken: async (code: string) => {
            logger.log(`[MOCK] GoogleOAuth getAccessToken: code="${code}"`);
            return {
              access_token: 'test-google-valid-token',
              expires_in: 3600,
              token_type: 'bearer',
            };
          },
          getUserProfile: async (accessToken: string) => {
            logger.log(`[MOCK] GoogleOAuth getUserProfile`);
            return {
              sub: 'google-test-valid-id',
              email: 'oauth-google@test-oauth.example.com',
              email_verified: true,
              name: '구글테스트',
            };
          },
        };
      },
    },
    // Kakao OAuth - 실제 클라이언트 (내부 테스트 모드 분기 있음)
    {
      provide: KakaoOAuthClient,
      useFactory: () => {
        logger.log('[MOCK] KakaoOAuthClient - using test mode branching');
        return {
          getAccessToken: async (code: string) => {
            logger.log(`[MOCK] KakaoOAuth getAccessToken: code="${code}"`);
            return {
              access_token: 'test-kakao-valid-token',
              token_type: 'bearer',
              expires_in: 3600,
            };
          },
          getUserProfile: async (accessToken: string) => {
            logger.log(`[MOCK] KakaoOAuth getUserProfile`);
            return {
              id: 123456789,
              kakao_account: {
                email: 'oauth-kakao@test-oauth.example.com',
                profile: { nickname: '카카오테스트' },
              },
              properties: { nickname: '카카오테스트' },
            };
          },
        };
      },
    },
    // Kakao Local - mock 사용
    {
      provide: KakaoLocalClient,
      useClass: MockKakaoLocalClient,
    },
    // Naver Search - mock 사용
    {
      provide: NaverSearchClient,
      useClass: MockNaverSearchClient,
    },
    // Naver Map - mock 사용
    {
      provide: NaverMapClient,
      useClass: MockNaverMapClient,
    },
    // S3 - mock 사용
    {
      provide: S3Client,
      useClass: MockS3Client,
    },
    // Discord - mock 사용
    {
      provide: DiscordWebhookClient,
      useClass: MockDiscordWebhookClient,
    },
    // OpenAI Menu Service - mock 사용
    {
      provide: TwoStageMenuService,
      useClass: MockTwoStageMenuService,
    },
    // OpenAI Places Service - mock 사용
    {
      provide: OpenAiPlacesService,
      useClass: MockOpenAiPlacesService,
    },
    // Location Service - mock 사용
    {
      provide: LocationService,
      useClass: MockLocationService,
    },
  ],
  exports: [
    GooglePlacesClient,
    GoogleSearchClient,
    GoogleOAuthClient,
    KakaoOAuthClient,
    KakaoLocalClient,
    NaverSearchClient,
    NaverMapClient,
    S3Client,
    DiscordWebhookClient,
    TwoStageMenuService,
    OpenAiPlacesService,
    LocationService,
  ],
})
export class MockExternalModule {
  private readonly logger = new Logger(MockExternalModule.name);

  constructor() {
    this.logger.warn('========================================');
    this.logger.warn('  MockExternalModule LOADED');
    this.logger.warn('  All external API calls are mocked!');
    this.logger.warn('========================================');
  }
}
