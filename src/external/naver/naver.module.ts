import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NaverMapClient } from './clients/naver-map.client';
import { NaverSearchClient } from './clients/naver-search.client';
import { LocationService } from './services/location.service';

@Module({
  imports: [HttpModule],
  providers: [NaverSearchClient, NaverMapClient, LocationService],
  exports: [NaverSearchClient, NaverMapClient, LocationService],
})
export class NaverModule {}

