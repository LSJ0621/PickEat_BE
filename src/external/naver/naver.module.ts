import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { NaverMapClient } from './clients/naver-map.client';
import { NaverSearchClient } from './clients/naver-search.client';
import { LocationService } from './services/location.service';
import { MockNaverSearchClient } from '../mocks/mock-naver-search.client';
import { MockNaverMapClient } from '../mocks/mock-naver-map.client';
import { MockLocationService } from '../mocks/mock-location.service';

const logger = new Logger('NaverModule');

/**
 * Naver API 클라이언트 모듈
 *
 * E2E_MOCK=true 환경에서는 Mock 클라이언트를 사용합니다.
 */
@Module({})
export class NaverModule {
  static forRoot(): DynamicModule {
    const isMockMode = process.env.E2E_MOCK === 'true';
    logger.warn(
      `[NaverModule.forRoot] E2E_MOCK="${process.env.E2E_MOCK}", isMockMode=${isMockMode}`,
    );

    if (isMockMode) {
      logger.warn('[NaverModule] E2E_MOCK=true - Using Mock clients');

      return {
        module: NaverModule,
        imports: [HttpModule],
        providers: [
          { provide: NaverSearchClient, useClass: MockNaverSearchClient },
          { provide: NaverMapClient, useClass: MockNaverMapClient },
          { provide: LocationService, useClass: MockLocationService },
        ],
        exports: [NaverSearchClient, NaverMapClient, LocationService],
      };
    }

    return {
      module: NaverModule,
      imports: [HttpModule],
      providers: [NaverSearchClient, NaverMapClient, LocationService],
      exports: [NaverSearchClient, NaverMapClient, LocationService],
    };
  }

  // 기존 정적 모듈 호환성 유지 (default: forRoot와 동일)
  static register(): DynamicModule {
    return NaverModule.forRoot();
  }
}
