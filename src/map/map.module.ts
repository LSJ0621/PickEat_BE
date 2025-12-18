import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NaverModule } from '../external/naver/naver.module';
import { SearchModule } from '../search/search.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [HttpModule, SearchModule, NaverModule],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
