import { Injectable, Logger } from '@nestjs/common';
import { User } from '../user/entities/user.entity';
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
  async recommend(user: User, prompt: string) {
    return this.menuRecommendationService.recommend(user, prompt);
  }

  async getHistory(
    user: User,
    page: number = 1,
    limit: number = 10,
    date?: string,
  ) {
    return this.menuRecommendationService.getHistory(user, page, limit, date);
  }

  async createSelection(
    user: User,
    menus: Array<{ slot: string; name: string }>,
    historyId?: number,
  ) {
    return this.menuSelectionService.createSelection(user, menus, historyId);
  }

  async updateSelection(
    user: User,
    selectionId: number,
    dto: UpdateMenuSelectionDto,
  ) {
    return this.menuSelectionService.updateSelection(user, selectionId, dto);
  }

  async getSelections(user: User, selectedDate?: string) {
    return this.menuSelectionService.getSelections(user, selectedDate);
  }

  async recommendRestaurants(
    user: User,
    textQuery: string,
    menuName: string,
    menuRecommendationId: number,
  ) {
    return this.placeService.recommendRestaurants(
      user,
      textQuery,
      menuName,
      menuRecommendationId,
    );
  }

  async getRecommendationDetail(user: User, id: number) {
    const recommendation = await this.menuRecommendationService.findById(
      id,
      user,
    );
    return this.placeService.buildRecommendationDetailResponse(recommendation);
  }

  async recommendRestaurantsWithGooglePlacesAndLlm(
    user: User,
    textQuery: string,
    menuName: string,
    menuRecommendationId?: number,
  ) {
    return this.recommendRestaurants(
      user,
      textQuery,
      menuName,
      menuRecommendationId!,
    );
  }

  // ========== 유틸리티 메서드 ==========

  async searchRestaurantsWithGooglePlaces(
    textQuery: string,
    latitude?: number,
    longitude?: number,
    languageCode?: 'ko' | 'en',
  ) {
    return this.placeService.searchRestaurantsWithGooglePlaces(
      textQuery,
      latitude,
      longitude,
      languageCode,
    );
  }

  async getPlaceDetail(placeId: string) {
    return this.placeService.getPlaceDetail(placeId);
  }

  async searchRestaurantBlogs(query: string, restaurantName: string) {
    return this.placeService.searchRestaurantBlogs(query, restaurantName);
  }
}
