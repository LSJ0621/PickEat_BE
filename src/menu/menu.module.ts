import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { Gpt51MenuService } from './gptversion/gpt51-menu.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { OpenAiMenuService } from './openai-menu.service';
import { OpenAiPlacesService } from './openai-places.service';
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
    Gpt51MenuService,
    PreferencesScheduler,
  ],
})
export class MenuModule {}
