import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { MenuController } from './menu.controller';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuService } from './menu.service';
import { OpenAiMenuService } from './openai-menu.service';
import { Gpt4MenuService } from './gptversion/gpt4-menu.service';
import { Gpt5MenuService } from './gptversion/gpt5-menu.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuRecommendation]),
    UserModule,
  ],
  controllers: [MenuController],
  providers: [
    MenuService,
    OpenAiMenuService,
    Gpt4MenuService,
    Gpt5MenuService,
  ],
})
export class MenuModule {}
