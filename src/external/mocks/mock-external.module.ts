import { Module, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

// Real client imports
import { GooglePlacesClient } from '../google/clients/google-places.client';
import { GoogleSearchClient } from '../google/clients/google-search.client';
import { GoogleOAuthClient } from '../google/clients/google-oauth.client';
import { KakaoOAuthClient } from '../kakao/clients/kakao-oauth.client';
import { S3Client } from '../aws/clients/s3.client';
import { DiscordWebhookClient } from '../discord/clients/discord-webhook.client';
import { GeminiClient } from '../gemini/clients/gemini.client';

// Real service imports (previously useClass mocked)
import { TwoStageMenuService } from '@/menu/services/two-stage-menu.service';
import { Gpt4oMiniValidationService } from '@/menu/services/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '@/menu/services/gpt51-menu.service';
import { GptWebSearchMenuService } from '@/menu/services/gpt-web-search-menu.service';
import { WebSearchSummaryService } from '@/menu/services/web-search-summary.service';
import { OpenAiPlacesService } from '@/menu/services/openai-places.service';
import { RedisCacheService } from '@/common/cache/cache.service';

// Mock HTTP and SDK fixtures
import { MockHttpService } from './mock-http.service';
import { mockGeminiApiResponse } from './fixtures/gemini-api-response.fixture';
import { mockS3Responses } from './fixtures';
import {
  createMockOpenAIChatSDK,
  createMockOpenAIWithResponsesSDK,
} from './fixtures/openai-chat-response.fixture';

const logger = new Logger('MockExternalModule');

/**
 * E2E 테스트용 Mock External 모듈 (v3 - HTTP/SDK 레벨 Mock)
 *
 * 실제 Client/Service 클래스를 그대로 사용하되, 의존하는 HTTP/SDK 계층만 mock합니다.
 * 이를 통해 Client/Service 내부의 파싱/에러처리/재시도 프로덕션 코드가 E2E에서도 실행됩니다.
 *
 * Mock 전략:
 * - HttpService 사용 Client: MockHttpService로 HTTP 응답 mock
 * - SDK 사용 Client: useFactory로 실제 인스턴스 생성 후 SDK 내부 객체 교체
 * - OpenAI 사용 Service: useFactory로 실제 인스턴스 생성 후 OpenAI SDK 객체 교체
 */
@Module({
  providers: [
    // =============================================
    // Mock HttpService (모든 HTTP 기반 Client가 공유)
    // =============================================
    {
      provide: HttpService,
      useFactory: () => {
        logger.log('[MOCK] HttpService → MockHttpService (URL 기반 fixture 응답)');
        return new MockHttpService() as unknown as HttpService;
      },
    },

    // =============================================
    // HTTP 기반 Client들 (실제 클래스 + Mock HttpService)
    // Client 프로덕션 코드가 실행됩니다.
    // =============================================

    // Google Places - 실제 Client (파싱, 에러 처리, retry 로직 실행)
    {
      provide: GooglePlacesClient,
      useFactory: (httpService: HttpService, config: ConfigService) => {
        logger.log('[MOCK] GooglePlacesClient → real class + MockHttpService');
        return new GooglePlacesClient(httpService, config);
      },
      inject: [HttpService, ConfigService],
    },

    // Google Search (CSE) - 실제 Client (mapCseItemToBlogResult 파싱 실행)
    {
      provide: GoogleSearchClient,
      useFactory: (httpService: HttpService, config: ConfigService) => {
        logger.log('[MOCK] GoogleSearchClient → real class + MockHttpService');
        return new GoogleSearchClient(httpService, config);
      },
      inject: [HttpService, ConfigService],
    },

    // Google OAuth - 실제 Client (isTestMode() 분기 + 에러 처리 실행)
    {
      provide: GoogleOAuthClient,
      useFactory: (httpService: HttpService, config: ConfigService) => {
        logger.log('[MOCK] GoogleOAuthClient → real class + MockHttpService (isTestMode 분기)');
        return new GoogleOAuthClient(httpService, config);
      },
      inject: [HttpService, ConfigService],
    },

    // Kakao OAuth - 실제 Client (isTestMode() 분기 + 에러 처리 실행)
    {
      provide: KakaoOAuthClient,
      useFactory: (httpService: HttpService, config: ConfigService) => {
        logger.log('[MOCK] KakaoOAuthClient → real class + MockHttpService (isTestMode 분기)');
        return new KakaoOAuthClient(httpService, config);
      },
      inject: [HttpService, ConfigService],
    },

    // Discord Webhook - 실제 Client (silent fail 로직 실행)
    {
      provide: DiscordWebhookClient,
      useFactory: (httpService: HttpService, config: ConfigService) => {
        logger.log('[MOCK] DiscordWebhookClient → real class + MockHttpService');
        return new DiscordWebhookClient(httpService, config);
      },
      inject: [HttpService, ConfigService],
    },

    // =============================================
    // SDK 기반 Client들 (실제 클래스 + SDK 내부 Mock)
    // Client 프로덕션 코드가 실행됩니다.
    // =============================================

    // Gemini Client - 실제 Client (JSON 파싱, placeId 매칭, 중복 제거 로직 실행)
    {
      provide: GeminiClient,
      useFactory: (config: ConfigService) => {
        logger.log('[MOCK] GeminiClient → real class + mock genAI SDK');
        const client = new GeminiClient(config);

        // genAI SDK 객체를 mock으로 교체
        // 실제 파싱 로직 (extractJsonFromText, placeId 매칭 등) 이 실행됨
        const mockGenAI = {
          models: {
            generateContent: async () => mockGeminiApiResponse,
          },
        };
        (client as unknown as Record<string, unknown>)['genAI'] = mockGenAI;

        return client;
      },
      inject: [ConfigService],
    },

    // S3 Client - 실제 Client (파일 확장자 검증, Path Traversal 방어 로직 실행)
    {
      provide: S3Client,
      useFactory: (config: ConfigService) => {
        logger.log('[MOCK] S3Client → real class + mock AWS S3 SDK');
        const client = new S3Client(config);

        // AWS S3Client SDK 객체를 mock으로 교체
        // uploadImage 내 extractSafeFileExtension, URL 생성 로직이 실행됨
        const mockAwsS3 = {
          send: async () => {
            // PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command 모두 처리
            return { Contents: [] };
          },
        };
        (client as unknown as Record<string, unknown>)['s3Client'] = mockAwsS3;

        // isPublicBucket을 true로 설정하여 presigned URL 대신 일반 URL 생성
        // (getSignedUrl mock 불필요)
        (client as unknown as Record<string, unknown>)['isPublicBucket'] = true;

        return client;
      },
      inject: [ConfigService],
    },

    // =============================================
    // OpenAI 기반 Service들 (실제 클래스 + OpenAI SDK Mock)
    // Service 프로덕션 코드 (프롬프트 생성, 응답 파싱, 검증 등)가 실행됩니다.
    // =============================================

    // Gpt4oMiniValidationService - Stage 1 검증 (onModuleInit 패턴)
    {
      provide: Gpt4oMiniValidationService,
      useFactory: (config: ConfigService) => {
        logger.log('[MOCK] Gpt4oMiniValidationService → real class + mock OpenAI SDK');
        const service = new Gpt4oMiniValidationService(config);
        (service as unknown as Record<string, unknown>)['openai'] =
          createMockOpenAIChatSDK();
        // onModuleInit가 실제 SDK로 덮어쓰지 않도록 비활성화
        service.onModuleInit = () => {};
        return service;
      },
      inject: [ConfigService],
    },

    // Gpt51MenuService - Stage 2 추천 (extends BaseMenuService, onModuleInit 패턴)
    {
      provide: Gpt51MenuService,
      useFactory: (config: ConfigService) => {
        logger.log('[MOCK] Gpt51MenuService → real class + mock OpenAI SDK');
        const service = new Gpt51MenuService(config);
        (service as unknown as Record<string, unknown>)['openai'] =
          createMockOpenAIChatSDK();
        // onModuleInit가 실제 SDK로 덮어쓰지 않도록 비활성화
        service.onModuleInit = () => {};
        return service;
      },
      inject: [ConfigService],
    },

    // WebSearchSummaryService - 웹 검색 요약 (constructor 패턴, responses API 사용)
    {
      provide: WebSearchSummaryService,
      useFactory: (config: ConfigService, cacheService: RedisCacheService) => {
        logger.log('[MOCK] WebSearchSummaryService → real class + mock OpenAI SDK (responses API)');
        const service = new WebSearchSummaryService(config, cacheService);
        // constructor에서 생성된 실제 OpenAI 인스턴스를 mock으로 교체
        (service as unknown as Record<string, unknown>)['openai'] =
          createMockOpenAIWithResponsesSDK();
        return service;
      },
      inject: [ConfigService, RedisCacheService],
    },

    // GptWebSearchMenuService - 웹 검색 기반 추천 (constructor 패턴)
    {
      provide: GptWebSearchMenuService,
      useFactory: (
        config: ConfigService,
        webSearchSummaryService: WebSearchSummaryService,
      ) => {
        logger.log('[MOCK] GptWebSearchMenuService → real class + mock OpenAI SDK');
        const service = new GptWebSearchMenuService(config, webSearchSummaryService);
        // constructor에서 생성된 실제 OpenAI 인스턴스를 mock으로 교체
        (service as unknown as Record<string, unknown>)['openai'] =
          createMockOpenAIChatSDK();
        return service;
      },
      inject: [ConfigService, WebSearchSummaryService],
    },

    // TwoStageMenuService - 2단계 오케스트레이터 (OpenAI 직접 사용 없음)
    {
      provide: TwoStageMenuService,
      useFactory: (
        validationService: Gpt4oMiniValidationService,
        menuService: Gpt51MenuService,
        webSearchMenuService: GptWebSearchMenuService,
      ) => {
        logger.log('[MOCK] TwoStageMenuService → real class (orchestrator)');
        return new TwoStageMenuService(
          validationService,
          menuService,
          webSearchMenuService,
        );
      },
      inject: [Gpt4oMiniValidationService, Gpt51MenuService, GptWebSearchMenuService],
    },

    // OpenAiPlacesService - 장소 추천 (extends BaseOpenAiService, onModuleInit 패턴)
    {
      provide: OpenAiPlacesService,
      useFactory: (config: ConfigService) => {
        logger.log('[MOCK] OpenAiPlacesService → real class + mock OpenAI SDK');
        const service = new OpenAiPlacesService(config);
        (service as unknown as Record<string, unknown>)['openai'] =
          createMockOpenAIChatSDK();
        // onModuleInit가 실제 SDK로 덮어쓰지 않도록 비활성화
        service.onModuleInit = () => {};
        return service;
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    GooglePlacesClient,
    GoogleSearchClient,
    GoogleOAuthClient,
    KakaoOAuthClient,
    S3Client,
    DiscordWebhookClient,
    TwoStageMenuService,
    OpenAiPlacesService,
    GeminiClient,
    // TwoStageMenuService 체인의 하위 서비스도 export (MenuModule 내부에서 사용)
    Gpt4oMiniValidationService,
    Gpt51MenuService,
    GptWebSearchMenuService,
    WebSearchSummaryService,
  ],
})
export class MockExternalModule {
  private readonly logger = new Logger(MockExternalModule.name);

  constructor() {
    this.logger.warn('========================================');
    this.logger.warn('  MockExternalModule v3 LOADED');
    this.logger.warn('  HTTP/SDK level mocking active!');
    this.logger.warn('  All production code IS executed.');
    this.logger.warn('========================================');
  }
}
