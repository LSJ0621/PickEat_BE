import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NaverModule } from '@/external/naver/naver.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule은 NaverModule.forRoot()를 import하여
 * NaverSearchClient, NaverMapClient, LocationService를 사용합니다.
 *
 * E2E_MOCK=true 모드에서는 NaverModule이 Mock 클라이언트를 제공합니다.
 */
@Module({
  imports: [HttpModule, NaverModule.forRoot()],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
