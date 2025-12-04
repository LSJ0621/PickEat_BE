import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { Gpt51MenuService } from './gpt/gpt51-menu.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PreferencesScheduler } from './preferences.scheduler';
import { OpenAiMenuService } from './services/openai-menu.service';
import { OpenAiPlacesService } from './services/openai-places.service';

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
