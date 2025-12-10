import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedEntity } from '../common/interfaces/authenticated-user.interface';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuRecommendationService } from './services/menu-recommendation.service';
import { MenuSelectionService } from './services/menu-selection.service';
import { PlaceService } from './services/place.service';

/**
 * 메뉴 서비스 (Facade)
 * 하위 서비스들을 조합하여 컨트롤러에 통합 인터페이스 제공
 */
@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly menuRecommendationService: MenuRecommendationService,
    private readonly menuSelectionService: MenuSelectionService,
    private readonly placeService: PlaceService,
  ) {}

  // ========== 통합 메서드 (신규) ==========
  async recommend(
    entity: AuthenticatedEntity,
    prompt: string,
  ) {
    return this.menuRecommendationService.recommend(
      entity,
      prompt,
    );
  }

  async getHistory(
    entity: AuthenticatedEntity,
    page: number = 1,
    limit: number = 10,
    date?: string,
  ) {
    return this.menuRecommendationService.getHistory(entity, page, limit, date);
  }

  async createSelection(
    entity: AuthenticatedEntity,
    menus: Array<{ slot: string; name: string }>,
    historyId?: number,
  ) {
    return this.menuSelectionService.createSelection(entity, menus, historyId);
  }

  async updateSelection(
    entity: AuthenticatedEntity,
    selectionId: number,
    dto: UpdateMenuSelectionDto,
  ) {
    return this.menuSelectionService.updateSelection(entity, selectionId, dto);
  }

  async getSelections(entity: AuthenticatedEntity, selectedDate?: string) {
    return this.menuSelectionService.getSelections(entity, selectedDate);
  }

  async recommendRestaurants(
    entity: AuthenticatedEntity,
    textQuery: string,
    menuName: string,
    menuRecommendationId: number,
  ) {
    return this.placeService.recommendRestaurants(
      entity,
      textQuery,
      menuName,
      menuRecommendationId,
    );
  }

  async getRecommendationDetail(entity: AuthenticatedEntity, id: number) {
    const recommendation = await this.menuRecommendationService.findById(
      id,
      entity,
    );
    return this.placeService.buildRecommendationDetailResponse(recommendation);
  }

  async recommendRestaurantsWithGooglePlacesAndLlm(
    entity: AuthenticatedEntity,
    textQuery: string,
    menuName: string,
    menuRecommendationId?: number,
  ) {
    return this.recommendRestaurants(
      entity,
      textQuery,
      menuName,
      menuRecommendationId!,
    );
  }

  // ========== 유틸리티 메서드 ==========

  async searchRestaurantsWithGooglePlaces(textQuery: string) {
    return this.placeService.searchRestaurantsWithGooglePlaces(textQuery);
  }

  async getPlaceDetail(placeId: string) {
    return this.placeService.getPlaceDetail(placeId);
  }

  async searchRestaurantBlogs(query: string, restaurantName: string) {
    return this.placeService.searchRestaurantBlogs(query, restaurantName);
  }
}
