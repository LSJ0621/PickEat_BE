import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../common/constants/error-codes';
import { parseLanguage } from '../common/utils/language.util';
import { RedisCacheService } from '../common/cache/cache.service';
import { User } from '../user/entities/user.entity';
import { RecommendPlacesV2Dto } from './dto/recommend-places-v2.dto';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { PlaceRecommendationSource } from './enum/place-recommendation-source.enum';
import { GeminiPlaceRecommendationsResponse } from './interfaces/gemini-places.interface';
import { normalizePlaceId } from './utils/place-id.util';
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
    private readonly cacheService: RedisCacheService,
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
    const language = parseLanguage(user.preferredLanguage);
    return this.placeService.buildRecommendationDetailResponse(
      recommendation,
      language,
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
      this.logger.warn('[Gemini V2] placeId가 있는 추천 결과 없음');
    }

    // 5. Save each recommendation to PlaceRecommendation entity with source: GEMINI (PickEat 자체 데이터만)
    const recommendationEntities = validRecommendations.map((rec) =>
      this.placeRecommendationRepository.create({
        menuRecommendation,
        placeId: normalizePlaceId(rec.placeId!), // Non-null guaranteed by filter
        reason: rec.reason,
        reasonTags: Array.isArray(rec.reasonTags) ? rec.reasonTags : [],
        menuName: dto.menuName,
        source: PlaceRecommendationSource.GEMINI,
        // NEW: 다국어 저장
        nameKo: rec.nameKo,
        nameEn: rec.nameEn,
        nameLocal: rec.nameLocal ?? null,
        addressKo: rec.addressKo ?? null,
        addressEn: rec.addressEn ?? null,
        addressLocal: rec.addressLocal ?? null,
        placeLatitude: rec.location?.latitude ?? null,
        placeLongitude: rec.location?.longitude ?? null,
      }),
    );

    try {
      await this.placeRecommendationRepository.save(recommendationEntities);
      this.logger.log(
        `✅ [Gemini V2 추천 저장 완료] menuRecommendationId=${dto.menuRecommendationId}, menuName="${dto.menuName}", total=${geminiResponse.recommendations.length}, saved=${recommendationEntities.length}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [Gemini V2 추천 저장 실패] menuRecommendationId=${dto.menuRecommendationId}, menuName="${dto.menuName}", count=${recommendationEntities.length}, error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        errorCode: ErrorCode.PLACE_RECOMMENDATION_SAVE_FAILED,
      });
    }

    // 6. Return the response
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

  async getPlaceDetail(placeId: string, language: 'ko' | 'en' = 'ko') {
    return this.placeService.getPlaceDetail(placeId, language);
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
