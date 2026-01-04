import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleModule } from '../external/google/google.module';
import { UserModule } from '../user/user.module';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { Gpt4oMiniValidationService } from './gpt/gpt4o-mini-validation.service';
import { Gpt51MenuService } from './gpt/gpt51-menu.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PreferencesScheduler } from './preferences.scheduler';
import { MenuRecommendationService } from './services/menu-recommendation.service';
import { MenuSelectionService } from './services/menu-selection.service';
import { OpenAiMenuService } from './services/openai-menu.service';
import { OpenAiPlacesService } from './services/openai-places.service';
import { PlaceService } from './services/place.service';
import { TwoStageMenuService } from './services/two-stage-menu.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MenuRecommendation,
      PlaceRecommendation,
      MenuSelection,
    ]),
    UserModule,
    HttpModule,
    GoogleModule,
  ],
  controllers: [MenuController],
  providers: [
    MenuService,
    MenuRecommendationService,
    MenuSelectionService,
    PlaceService,
    OpenAiMenuService,
    OpenAiPlacesService,
    Gpt4oMiniValidationService,
    Gpt51MenuService,
    TwoStageMenuService,
    PreferencesScheduler,
  ],
})
export class MenuModule {}
