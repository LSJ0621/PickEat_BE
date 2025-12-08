import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NaverMapClient } from './clients/naver-map.client';
import { NaverSearchClient } from './clients/naver-search.client';

@Module({
  imports: [HttpModule],
  providers: [NaverSearchClient, NaverMapClient],
  exports: [NaverSearchClient, NaverMapClient],
})
export class NaverModule {}

