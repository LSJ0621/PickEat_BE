import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { AwsModule } from './aws/aws.module';
import { DiscordModule } from './discord/discord.module';
import { GeminiModule } from './gemini/gemini.module';
import { GoogleModule } from './google/google.module';
import { KakaoModule } from './kakao/kakao.module';
import { NaverModule } from './naver/naver.module';
import { OpenAiModule } from './openai/openai.module';
import { MockExternalModule } from './mocks/mock-external.module';

const logger = new Logger('ExternalModule');

/**
 * 외부 API 클라이언트 통합 모듈
 *
 * E2E_MOCK=true 환경에서는 MockExternalModule을 사용하여
 * 모든 외부 API 호출을 mock 처리합니다.
 */
@Global()
@Module({})
export class ExternalModule {
  static forRoot(): DynamicModule {
    const isMockMode = process.env.E2E_MOCK === 'true';

    if (isMockMode) {
      logger.warn('========================================');
      logger.warn('  E2E_MOCK=true detected!');
      logger.warn('  Using MockExternalModule');
      logger.warn('========================================');

      return {
        module: ExternalModule,
        imports: [MockExternalModule],
        exports: [MockExternalModule],
      };
    }

    return {
      module: ExternalModule,
      imports: [
        GoogleModule,
        GeminiModule,
        KakaoModule,
        NaverModule.forRoot(),
        OpenAiModule,
        AwsModule,
        DiscordModule,
      ],
      exports: [
        GoogleModule,
        GeminiModule,
        KakaoModule,
        NaverModule,
        OpenAiModule,
        AwsModule,
        DiscordModule,
      ],
    };
  }
}
