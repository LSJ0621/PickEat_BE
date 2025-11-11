import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { MenuController } from './menu.controller';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuService } from './menu.service';
import { OpenAiMenuService } from './openai-menu.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuRecommendation]),
    UserModule,
  ],
  controllers: [MenuController],
  providers: [MenuService, OpenAiMenuService],
})
export class MenuModule {}
