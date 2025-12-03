import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { MenuController } from './menu.controller';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { MenuService } from './menu.service';
import { OpenAiMenuService } from './openai-menu.service';
import { OpenAiPlacesService } from './openai-places.service';
import { Gpt4MenuService } from './gptversion/gpt4-menu.service';
import { Gpt5MenuService } from './gptversion/gpt5-menu.service';
import { PreferencesScheduler } from './preferences.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MenuRecommendation,
      PlaceRecommendation,
      MenuSelection,
    ]),
    UserModule,
    HttpModule,
  ],
  controllers: [MenuController],
  providers: [
    MenuService,
    OpenAiMenuService,
    OpenAiPlacesService,
    Gpt4MenuService,
    Gpt5MenuService,
    PreferencesScheduler,
  ],
})
export class MenuModule {}
