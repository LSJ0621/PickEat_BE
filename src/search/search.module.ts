import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NaverModule } from '../external/naver/naver.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [HttpModule, NaverModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
