import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { GoogleModule } from '../external/google/google.module';
import { NaverModule } from '../external/naver/naver.module';
import { SearchModule } from '../search/search.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [HttpModule, forwardRef(() => SearchModule), GoogleModule, NaverModule],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
