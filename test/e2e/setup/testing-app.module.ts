import {
  INestApplication,
  ValidationPipe,
  Type,
  DynamicModule,
  ForwardReference,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as cookieParser from 'cookie-parser';
import { MailerService } from '@nestjs-modules/mailer';

// Application modules
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

// External clients to mock
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';
import { KakaoLocalClient } from '@/external/kakao/clients/kakao-local.client';
import { NaverSearchClient } from '@/external/naver/clients/naver-search.client';
import { NaverMapClient } from '@/external/naver/clients/naver-map.client';
import { S3Client } from '@/external/aws/clients/s3.client';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';

// Mock factories
import {
  createMockGoogleOAuthClient,
  createMockGooglePlacesClient,
  createMockGoogleSearchClient,
  createMockKakaoOAuthClient,
  createMockKakaoLocalClient,
  createMockNaverSearchClient,
  createMockNaverMapClient,
  createMockS3Client,
  createMockDiscordWebhookClient,
  createMockPrometheusService,
  mockGoogleOAuthResponses,
  mockGooglePlacesResponses,
  mockGoogleCseResponses,
  mockKakaoOAuthResponses,
  mockKakaoLocalResponses,
  mockNaverSearchResponses,
  mockNaverMapResponses,
  mockS3Responses,
} from '../../mocks/external-clients.mock';

// Database setup
import {
  testDatabaseConfig,
  ALL_ENTITIES,
  resetDatabaseBeforeAppInit,
} from './test-database.setup';
import { TEST_ENV_CONFIG } from './auth-test.helper';
import { PrometheusService } from '@/prometheus/prometheus.service';

/**
 * Creates all mock external clients with default success responses
 */
export function createAllMockClients() {
  // Google OAuth
  const mockGoogleOAuthClient = createMockGoogleOAuthClient();
  mockGoogleOAuthClient.getAccessToken.mockResolvedValue(
    mockGoogleOAuthResponses.tokenSuccess.access_token,
  );
  mockGoogleOAuthClient.getUserProfile.mockResolvedValue(
    mockGoogleOAuthResponses.userProfileSuccess,
  );

  // Google Places
  const mockGooglePlacesClient = createMockGooglePlacesClient();
  mockGooglePlacesClient.searchByText.mockResolvedValue(
    mockGooglePlacesResponses.searchSuccess.places,
  );
  mockGooglePlacesClient.getDetails.mockResolvedValue(
    mockGooglePlacesResponses.placeDetailsSuccess,
  );
  mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

  // Google Search (CSE)
  const mockGoogleSearchClient = createMockGoogleSearchClient();
  mockGoogleSearchClient.searchBlogs.mockResolvedValue(
    mockGoogleCseResponses.searchSuccess.items,
  );

  // Kakao OAuth
  const mockKakaoOAuthClient = createMockKakaoOAuthClient();
  mockKakaoOAuthClient.getAccessToken.mockResolvedValue(
    mockKakaoOAuthResponses.tokenSuccess.access_token,
  );
  mockKakaoOAuthClient.getUserProfile.mockResolvedValue(
    mockKakaoOAuthResponses.userInfoSuccess,
  );

  // Kakao Local
  const mockKakaoLocalClient = createMockKakaoLocalClient();
  mockKakaoLocalClient.searchAddress.mockResolvedValue(
    mockKakaoLocalResponses.addressSearchSuccess,
  );

  // Naver Search
  const mockNaverSearchClient = createMockNaverSearchClient();
  mockNaverSearchClient.searchLocal.mockResolvedValue(
    mockNaverSearchResponses.localSearchSuccess.items,
  );

  // Naver Map
  const mockNaverMapClient = createMockNaverMapClient();
  mockNaverMapClient.reverseGeocode.mockResolvedValue(
    mockNaverMapResponses.reverseGeocodeSuccess.results,
  );

  // S3
  const mockS3ClientInstance = createMockS3Client();
  mockS3ClientInstance.uploadBugReportImage.mockResolvedValue(
    mockS3Responses.uploadSuccess.Location,
  );

  // Discord Webhook
  const mockDiscordWebhookClientInstance = createMockDiscordWebhookClient();
  mockDiscordWebhookClientInstance.sendMessage.mockResolvedValue(undefined);

  // Prometheus Service
  const mockPrometheusServiceInstance = createMockPrometheusService();

  // MailerService - Mock to prevent SMTP connection attempts
  const mockMailerServiceInstance = {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  } as jest.Mocked<Pick<MailerService, 'sendMail'>>;

  return {
    mockGoogleOAuthClient,
    mockGooglePlacesClient,
    mockGoogleSearchClient,
    mockKakaoOAuthClient,
    mockKakaoLocalClient,
    mockNaverSearchClient,
    mockNaverMapClient,
    mockS3Client: mockS3ClientInstance,
    mockDiscordWebhookClient: mockDiscordWebhookClientInstance,
    mockPrometheusService: mockPrometheusServiceInstance,
    mockMailerService: mockMailerServiceInstance,
  };
}

/**
 * Creates a test ConfigService with test environment values
 */
export function createTestConfigService(): Partial<ConfigService> {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      return (TEST_ENV_CONFIG as Record<string, string>)[key] ?? defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      const value = (TEST_ENV_CONFIG as Record<string, string>)[key];
      if (value === undefined) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return value;
    }),
  } as Partial<ConfigService>;
}

/**
 * Creates a testing module with all external clients mocked
 * This is the main entry point for E2E tests
 */
export async function createTestingApp(): Promise<{
  app: INestApplication;
  module: TestingModule;
  mocks: ReturnType<typeof createAllMockClients>;
}> {
  // Reset database before app initialization to prevent AdminInitializerService
  // from failing due to duplicate admin user from previous test runs
  await resetDatabaseBeforeAppInit();

  const mocks = createAllMockClients();

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  // Override external clients with mocks
  const module = await moduleBuilder
    .overrideProvider(GoogleOAuthClient)
    .useValue(mocks.mockGoogleOAuthClient)
    .overrideProvider(GooglePlacesClient)
    .useValue(mocks.mockGooglePlacesClient)
    .overrideProvider(GoogleSearchClient)
    .useValue(mocks.mockGoogleSearchClient)
    .overrideProvider(KakaoOAuthClient)
    .useValue(mocks.mockKakaoOAuthClient)
    .overrideProvider(KakaoLocalClient)
    .useValue(mocks.mockKakaoLocalClient)
    .overrideProvider(NaverSearchClient)
    .useValue(mocks.mockNaverSearchClient)
    .overrideProvider(NaverMapClient)
    .useValue(mocks.mockNaverMapClient)
    .overrideProvider(S3Client)
    .useValue(mocks.mockS3Client)
    .overrideProvider(DiscordWebhookClient)
    .useValue(mocks.mockDiscordWebhookClient)
    .overrideProvider(PrometheusService)
    .useValue(mocks.mockPrometheusService)
    .overrideProvider(MailerService)
    .useValue(mocks.mockMailerService)
    .compile();

  const app = module.createNestApplication();

  // Apply global pipes and filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Cast mock PrometheusService to actual type for HttpExceptionFilter
  // Mock object implements only the methods used by HttpExceptionFilter
  // so we need unknown as intermediate for safety and clarity of intent
  app.useGlobalFilters(
    new HttpExceptionFilter(
      mocks.mockPrometheusService as unknown as PrometheusService,
    ),
  );
  app.use(cookieParser());

  await app.init();

  return { app, module, mocks };
}

/**
 * Creates a minimal testing module for integration tests
 * Uses SQLite in-memory database
 */
export async function createIntegrationTestingModule(
  moduleImports: Array<
    Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >,
): Promise<TestingModule> {
  // Reset database before module initialization
  await resetDatabaseBeforeAppInit();

  const mocks = createAllMockClients();

  // Create a PrometheusModule mock that provides PrometheusService globally
  const PrometheusModuleMock = class {
    static forRoot() {
      return {
        module: PrometheusModuleMock,
        providers: [
          {
            provide: PrometheusService,
            useValue: mocks.mockPrometheusService,
          },
        ],
        exports: [PrometheusService],
        global: true,
      };
    }
  };

  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => TEST_ENV_CONFIG],
      }),
      TypeOrmModule.forRoot(testDatabaseConfig),
      TypeOrmModule.forFeature(ALL_ENTITIES),
      PrometheusModuleMock.forRoot(),
      ...moduleImports,
    ],
    providers: [
      {
        provide: PrometheusService,
        useValue: mocks.mockPrometheusService,
      },
    ],
    exports: [PrometheusService],
  })
    .overrideProvider(GoogleOAuthClient)
    .useValue(mocks.mockGoogleOAuthClient)
    .overrideProvider(GooglePlacesClient)
    .useValue(mocks.mockGooglePlacesClient)
    .overrideProvider(GoogleSearchClient)
    .useValue(mocks.mockGoogleSearchClient)
    .overrideProvider(KakaoOAuthClient)
    .useValue(mocks.mockKakaoOAuthClient)
    .overrideProvider(KakaoLocalClient)
    .useValue(mocks.mockKakaoLocalClient)
    .overrideProvider(NaverSearchClient)
    .useValue(mocks.mockNaverSearchClient)
    .overrideProvider(NaverMapClient)
    .useValue(mocks.mockNaverMapClient)
    .overrideProvider(S3Client)
    .useValue(mocks.mockS3Client)
    .overrideProvider(DiscordWebhookClient)
    .useValue(mocks.mockDiscordWebhookClient)
    .overrideProvider(PrometheusService)
    .useValue(mocks.mockPrometheusService)
    .overrideProvider(MailerService)
    .useValue(mocks.mockMailerService)
    .compile();
}

/**
 * Cleanup function for test application
 */
export async function closeTestingApp(app: INestApplication): Promise<void> {
  if (app) {
    await app.close();
    // Give time for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
