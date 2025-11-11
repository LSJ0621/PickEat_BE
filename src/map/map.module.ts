import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { MapService } from './map.service';
import { MapController } from './map.controller';

@Module({
  imports: [HttpModule, forwardRef(() => SearchModule)],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
