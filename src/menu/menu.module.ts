import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { UserModule } from '@/user/user.module';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { Gpt4oMiniValidationService } from './services/gpt4o-mini-validation.service';
import { Gpt51MenuService } from './services/gpt51-menu.service';
import { GptWebSearchMenuService } from './services/gpt-web-search-menu.service';
import { WebSearchSummaryService } from './services/web-search-summary.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { CommunityPlaceService } from './services/community-place.service';
import { GeminiPlacesService } from './services/gemini-places.service';
import { MenuRecommendationService } from './services/menu-recommendation.service';
import { MenuSelectionService } from './services/menu-selection.service';
import { OpenAiCommunityPlacesService } from './services/openai-community-places.service';
import { OpenAiMenuService } from './services/openai-menu.service';
import { OpenAiPlacesService } from './services/openai-places.service';
import { PlaceService } from './services/place.service';
import { TwoStageMenuService } from './services/two-stage-menu.service';

/**
 * MenuModule은 GoogleModule을 직접 import하지 않습니다.
 * @Global()인 ExternalModule.forRoot()가 AppModule에서 import되어
 * GooglePlacesClient, GoogleSearchClient, GeminiClient를 전역으로 제공합니다.
 *
 * OpenAiPlacesService와 GeminiPlacesService는 이 모듈의 providers에서 직접 제공합니다.
 *
 * E2E_MOCK=true 모드에서는 MockExternalModule의 Mock 클라이언트가 주입됩니다.
 * TwoStageMenuService와 하위 서비스들은 MockExternalModule에서 제공되므로
 * 이 모듈에서는 제외합니다.
 */
const isE2EMock = process.env.E2E_MOCK === 'true';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MenuRecommendation,
      PlaceRecommendation,
      MenuSelection,
      UserPlace,
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
    OpenAiCommunityPlacesService,
    GeminiPlacesService,
    CommunityPlaceService,
    // TwoStageMenuService and its dependencies are provided by MockExternalModule in E2E mode
    ...(isE2EMock
      ? []
      : [
          TwoStageMenuService,
          Gpt4oMiniValidationService,
          Gpt51MenuService,
          WebSearchSummaryService,
          GptWebSearchMenuService,
        ]),
  ],
})
export class MenuModule {}
