import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUserPayload,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { ErrorCode } from '../common/constants/error-codes';
import { parseLanguage } from '../common/utils/language.util';
import { UserService } from '../user/user.service';
import { CreateMenuSelectionDto } from './dto/create-menu-selection.dto';
import { RecommendCommunityPlacesDto } from './dto/recommend-community-places.dto';
import { RecommendMenuDto } from './dto/recommend-menu.dto';
import { RecommendationHistoryQueryDto } from './dto/recommendation-history-query.dto';
import { SearchRestaurantBlogsDto } from './dto/search-restaurant-blogs.dto';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendationSource } from './enum/place-recommendation-source.enum';
import { PlaceRecommendationResponse } from './interface/place-recommendation-response.interface';
import { MenuService } from './menu.service';
import { CommunityPlaceService } from './services/community-place.service';
import { MenuRecommendationService } from './services/menu-recommendation.service';
import { PlaceService } from './services/place.service';

@Controller('menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly userService: UserService,
    private readonly placeService: PlaceService,
    private readonly communityPlaceService: CommunityPlaceService,
    private readonly menuRecommendationService: MenuRecommendationService,
  ) {}

  @Post('recommend')
  async recommend(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.recommend(entity, recommendMenuDto.prompt);
  }

  @Post('selections')
  async createSelection(
    @Body() createMenuSelectionDto: CreateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selection = await this.menuService.createSelection(
      entity,
      createMenuSelectionDto.menus,
      createMenuSelectionDto.historyId,
    );
    return this.buildSelectionResponse(selection);
  }

  @Get('selections/history')
  async getSelections(
    @Query('date') date: string | undefined,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selections = await this.menuService.getSelections(entity, date);
    return { selections };
  }

  @Patch('selections/:id')
  async updateSelection(
    @Param('id') id: string,
    @Body() updateDto: UpdateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const selectionId = Number(id);
    if (Number.isNaN(selectionId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_INVALID_SELECTION_ID,
      });
    }
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selection = await this.menuService.updateSelection(
      entity,
      selectionId,
      updateDto,
    );
    return this.buildSelectionResponse(selection);
  }

  @Get('recommendations/history')
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.getHistory(
      entity,
      query.page,
      query.limit,
      query.date,
    );
  }

  // Google Custom Search(Programmable Search)를 이용한
  // 가게 이름 기반 블로그/웹 문서 검색 (썸네일, URL, 제목, 스니펫, 출처)
  // 예: GET /menu/restaurant/blogs?query=부산시 해운대구 마라탕집&restaurantName=마라탕집
  @Get('restaurant/blogs')
  async searchRestaurantBlogs(@Query() dto: SearchRestaurantBlogsDto) {
    return this.menuService.searchRestaurantBlogs(
      dto.query,
      dto.restaurantName,
    );
  }

  // Google Places 텍스트 검색 + LLM 추천까지 한 번에 수행
  // (사용자가 "가게 추천받기" 버튼을 눌렀을 때 호출되는 엔드포인트)
  @Get('recommend/places')
  async recommendRestaurantsWithGooglePlacesAndLlm(
    @Query('query') query: string,
    @Query('menuName') menuName: string,
    @Query('historyId') historyId: string | undefined,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    if (!menuName) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_NAME_REQUIRED,
      });
    }
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const numericHistoryId =
      historyId !== undefined && historyId !== null
        ? Number(historyId)
        : undefined;
    return this.menuService.recommendRestaurantsWithGooglePlacesAndLlm(
      entity,
      query,
      menuName,
      numericHistoryId,
    );
  }

  // 검색 기반 가게 추천 (Google Places)
  @Get('recommend/places/search')
  async recommendSearchPlaces(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ): Promise<PlaceRecommendationResponse> {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );

    // Validate MenuRecommendation exists and belongs to user
    await this.menuRecommendationService.findById(
      dto.menuRecommendationId,
      entity,
    );

    const textQuery = dto.menuName;

    // Use existing PlaceService.recommendRestaurants with coordinates
    const result = await this.placeService.recommendRestaurants(
      entity,
      textQuery,
      dto.menuName,
      dto.menuRecommendationId,
      dto.latitude,
      dto.longitude,
    );

    // Add source field to each recommendation
    return {
      recommendations: result.recommendations.map((rec) => ({
        placeId: rec.placeId,
        name: rec.name,
        reason: rec.reason,
        menuName: dto.menuName,
        source: PlaceRecommendationSource.GOOGLE,
      })),
    };
  }

  // 커뮤니티 등록 가게 추천 (UserPlace)
  @Get('recommend/places/community')
  async recommendCommunityPlaces(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ): Promise<PlaceRecommendationResponse> {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );

    // Get MenuRecommendation
    const menuRecommendation = await this.menuRecommendationService.findById(
      dto.menuRecommendationId,
      entity,
    );

    if (!menuRecommendation) {
      throw new NotFoundException('Menu recommendation not found');
    }

    // Parse language
    const language = parseLanguage(dto.language || entity.preferredLanguage);

    // Call CommunityPlaceService
    const placeRecommendations =
      await this.communityPlaceService.recommendCommunityPlaces(
        entity,
        dto.latitude,
        dto.longitude,
        dto.menuName,
        menuRecommendation,
        language,
      );

    // Transform PlaceRecommendation[] to match frontend expected format
    return {
      recommendations: placeRecommendations.map((rec) => ({
        placeId: rec.placeId,
        name: rec.userPlace?.name || '',
        reason: rec.reason,
        menuName: rec.menuName || undefined,
        source: rec.source,
        userPlaceId: rec.userPlace?.id || undefined,
      })),
    };
  }

  // 특정 추천 이력 1건 + 그 이력에서 생성된 AI 가게 추천 상세 조회
  // 예: GET /menu/recommendations/123
  @Get('recommendations/:id')
  async getRecommendationDetail(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_INVALID_HISTORY_ID,
      });
    }
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.getRecommendationDetail(entity, numericId);
  }

  // 단일 placeId에 대한 Google Places 상세 조회
  // 예: GET /menu/places/:placeId/detail
  @Get('places/:placeId/detail')
  async getPlaceDetail(@Param('placeId') placeId: string) {
    return this.menuService.getPlaceDetail(placeId);
  }

  // [TEST] Google Places 검색 결과만 확인 (OpenAI 추천 제외)
  @Get('test/places/search')
  async testGooglePlacesSearch(
    @Query('query') query: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('language') language?: 'ko' | 'en',
  ) {
    const lat = latitude ? parseFloat(latitude) : undefined;
    const lng = longitude ? parseFloat(longitude) : undefined;
    return this.placeService.searchRestaurantsWithGooglePlaces(
      query,
      lat,
      lng,
      language,
    );
  }

  private buildSelectionResponse(selection: MenuSelection) {
    // menuPayload를 그대로 반환 (slot별 구조)
    const payload = selection.menuPayload;
    const normalizedPayload = {
      breakfast: Array.isArray(payload?.breakfast) ? payload.breakfast : [],
      lunch: Array.isArray(payload?.lunch) ? payload.lunch : [],
      dinner: Array.isArray(payload?.dinner) ? payload.dinner : [],
      etc: Array.isArray(payload?.etc) ? payload.etc : [],
    };
    return {
      selection: {
        id: selection.id,
        menuPayload: normalizedPayload,
        selectedDate: selection.selectedDate,
        historyId: selection.menuRecommendation?.id ?? null,
      },
    };
  }
}
