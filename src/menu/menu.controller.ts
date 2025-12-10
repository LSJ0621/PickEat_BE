import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { UserService } from '../user/user.service';
import { CreateMenuSelectionDto } from './dto/create-menu-selection.dto';
import { RecommendMenuDto } from './dto/recommend-menu.dto';
import { RecommendationHistoryQueryDto } from './dto/recommendation-history-query.dto';
import { SearchRestaurantBlogsDto } from './dto/search-restaurant-blogs.dto';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuSelection } from './entities/menu-selection.entity';
import { MenuService } from './menu.service';

@Controller('menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly userService: UserService,
  ) {}

  @Post('recommend')
  async recommend(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.menuService.recommend(
      entity,
      recommendMenuDto.prompt,
    );
  }

  @Post('selections')
  async createSelection(
    @Body() createMenuSelectionDto: CreateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
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
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
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
      throw new BadRequestException('유효하지 않은 선택 ID입니다.');
    }
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
    const selection = await this.menuService.updateSelection(entity, selectionId, updateDto);
    return this.buildSelectionResponse(selection);
  }

  @Get('recommendations/history')
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
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
    return this.menuService.searchRestaurantBlogs(dto.query, dto.restaurantName);
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
      throw new BadRequestException('menuName 쿼리 파라미터가 필요합니다.');
    }
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
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

  // 특정 추천 이력 1건 + 그 이력에서 생성된 AI 가게 추천 상세 조회
  // 예: GET /menu/recommendations/123
  @Get('recommendations/:id')
  async getRecommendationDetail(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('유효하지 않은 추천 이력 ID입니다.');
    }
    const entity = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.menuService.getRecommendationDetail(entity, numericId);
  }

  // 단일 placeId에 대한 Google Places 상세 조회
  // 예: GET /menu/places/:placeId/detail
  @Get('places/:placeId/detail')
  async getPlaceDetail(@Param('placeId') placeId: string) {
    return this.menuService.getPlaceDetail(placeId);
  }

  private buildSelectionResponse(selection: MenuSelection) {
    // menuPayload를 그대로 반환 (slot별 구조)
    const payload = selection.menuPayload as any;
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
