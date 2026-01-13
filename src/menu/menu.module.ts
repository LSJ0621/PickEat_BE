import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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

/**
 * MenuModule은 GoogleModule을 직접 import하지 않습니다.
 * @Global()인 ExternalModule.forRoot()가 AppModule에서 import되어
 * GooglePlacesClient, GoogleSearchClient를 전역으로 제공합니다.
 *
 * OpenAiPlacesService는 이 모듈의 providers에서 직접 제공합니다.
 *
 * E2E_MOCK=true 모드에서는 MockExternalModule의 Mock 클라이언트가 주입됩니다.
 */
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
    MenuRecommendationService,
    MenuSelectionService,
    PlaceService,
    OpenAiMenuService,
    OpenAiPlacesService,
    TwoStageMenuService,
    Gpt4oMiniValidationService,
    Gpt51MenuService,
    PreferencesScheduler,
  ],
})
export class MenuModule {}
