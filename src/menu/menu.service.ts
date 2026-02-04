import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseLanguage } from '../common/utils/language.util';
import { User } from '../user/entities/user.entity';
import { RecommendPlacesV2Dto } from './dto/recommend-places-v2.dto';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { PlaceRecommendationSource } from './enum/place-recommendation-source.enum';
import { GeminiPlaceRecommendationsResponse } from './interface/gemini-places.interface';
import { normalizePlaceId } from './place-id.util';
import { GeminiPlacesService } from './services/gemini-places.service';
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
    @InjectRepository(PlaceRecommendation)
    private readonly placeRecommendationRepository: Repository<PlaceRecommendation>,
    private readonly menuRecommendationService: MenuRecommendationService,
    private readonly menuSelectionService: MenuSelectionService,
    private readonly placeService: PlaceService,
    private readonly geminiPlacesService: GeminiPlacesService,
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

  async recommendPlacesWithGemini(
    dto: RecommendPlacesV2Dto,
    userId: number,
  ): Promise<GeminiPlaceRecommendationsResponse> {
    // 1. Verify menuRecommendationId belongs to user
    const menuRecommendation = await this.menuRecommendationService.findById(
      dto.menuRecommendationId,
      { id: userId } as User,
    );

    // 2. Parse language from dto or default to 'ko'
    const language = parseLanguage(dto.language);

    // 3. Call geminiPlacesService.recommendRestaurants
    const geminiResponse = await this.geminiPlacesService.recommendRestaurants(
      dto.menuName,
      dto.address,
      dto.latitude,
      dto.longitude,
      language,
    );

    // 4. Filter out recommendations with null placeId
    const validRecommendations = geminiResponse.recommendations.filter(
      (rec) => rec.placeId != null,
    );

    if (validRecommendations.length === 0) {
      this.logger.warn('⚠️ [Gemini V2] placeId가 있는 추천 결과 없음');
    }

    // 5. Save each recommendation to PlaceRecommendation entity with source: GEMINI
    const recommendationEntities = validRecommendations.map((rec) =>
      this.placeRecommendationRepository.create({
        menuRecommendation,
        placeId: normalizePlaceId(rec.placeId!), // Non-null guaranteed by filter
        reason: rec.reason,
        menuName: dto.menuName,
        source: PlaceRecommendationSource.GEMINI,
      }),
    );

    await this.placeRecommendationRepository.save(recommendationEntities);

    this.logger.log(
      `✅ [Gemini V2 추천 저장 완료] menuRecommendationId=${dto.menuRecommendationId}, total=${geminiResponse.recommendations.length}, saved=${recommendationEntities.length}`,
    );

    // 5. Return the response
    return geminiResponse;
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

  async searchRestaurantBlogs(
    query: string,
    restaurantName: string,
    language?: 'ko' | 'en' | 'ja' | 'zh',
    searchName?: string,
    searchAddress?: string,
  ) {
    return this.placeService.searchRestaurantBlogs(
      query,
      restaurantName,
      language,
      searchName,
      searchAddress,
    );
  }
}
