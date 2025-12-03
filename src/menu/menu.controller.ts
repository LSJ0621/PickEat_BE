import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
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
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuSelection } from './entities/menu-selection.entity';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly userService: UserService,
  ) {}

  @Post('recommend')
  @UseGuards(JwtAuthGuard)
  async recommend(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.recommendForUser(
        result.user!,
        recommendMenuDto.prompt,
        recommendMenuDto.requestAddress,
        recommendMenuDto.requestLocation?.lat,
        recommendMenuDto.requestLocation?.lng,
      );
    } else {
      return this.menuService.recommendForSocialLogin(
        result.socialLogin!,
        recommendMenuDto.prompt,
        recommendMenuDto.requestAddress,
        recommendMenuDto.requestLocation?.lat,
        recommendMenuDto.requestLocation?.lng,
      );
    }
  }

  @Post('selections')
  @UseGuards(JwtAuthGuard)
  async createSelection(
    @Body() createMenuSelectionDto: CreateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      const selection = await this.menuService.createSelectionForUser(
        result.user!,
        createMenuSelectionDto.menus,
        createMenuSelectionDto.historyId,
      );
      return this.buildSelectionResponse(selection);
    } else {
      const selection = await this.menuService.createSelectionForSocialLogin(
        result.socialLogin!,
        createMenuSelectionDto.menus,
        createMenuSelectionDto.historyId,
      );
      return this.buildSelectionResponse(selection);
    }
  }

  @Get('selections/history')
  @UseGuards(JwtAuthGuard)
  async getSelections(
    @Query('date') date: string | undefined,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      const selections = await this.menuService.getSelectionsForUser(
        result.user!,
        date,
      );
      return { selections };
    } else {
      const selections = await this.menuService.getSelectionsForSocialLogin(
        result.socialLogin!,
        date,
      );
      return { selections };
    }
  }

  @Patch('selections/:id')
  @UseGuards(JwtAuthGuard)
  async updateSelection(
    @Param('id') id: string,
    @Body() updateDto: UpdateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const selectionId = Number(id);
    if (Number.isNaN(selectionId)) {
      throw new BadRequestException('유효하지 않은 선택 ID입니다.');
    }
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    let selection: MenuSelection;
    if (result.type === 'user') {
      selection = await this.menuService.updateSelectionForUser(
        result.user!,
        selectionId,
        updateDto,
      );
    } else {
      selection = await this.menuService.updateSelectionForSocialLogin(
        result.socialLogin!,
        selectionId,
        updateDto,
      );
    }
    return this.buildSelectionResponse(selection);
  }

  @Get('recommendations/history')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.getHistory(result.user!, query.date);
    } else {
      return this.menuService.getHistoryForSocialLogin(
        result.socialLogin!,
        query.date,
      );
    }
  }

  // Google Places 텍스트 검색 결과만 조회하는 테스트용 엔드포인트 (토큰 불필요)
  // 예: GET /menu/google-places/search?query=덕소 마라탕
  @Get('google-places/search')
  async searchRestaurantsWithGooglePlaces(@Query('query') query: string) {
    return this.menuService.searchRestaurantsWithGooglePlaces(query);
  }

  // Google Custom Search(Programmable Search)를 이용한
  // 가게 이름 기반 블로그/웹 문서 검색 (썸네일, URL, 제목, 스니펫, 출처)
  // 예: GET /menu/restaurant/blogs?query=연남동 삼겹살
  @Get('restaurant/blogs')
  @UseGuards(JwtAuthGuard)
  async searchRestaurantBlogs(@Query('query') query: string) {
    return this.menuService.searchRestaurantBlogs(query);
  }

  // Google Places 텍스트 검색 + LLM 추천까지 한 번에 수행
  // (사용자가 "가게 추천받기" 버튼을 눌렀을 때 호출되는 엔드포인트)
  @Get('recommend/places')
  @UseGuards(JwtAuthGuard)
  async recommendRestaurantsWithGooglePlacesAndLlm(
    @Query('query') query: string,
    @Query('menuName') menuName: string,
    @Query('historyId') historyId: string | undefined,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    if (!menuName) {
      throw new BadRequestException('menuName 쿼리 파라미터가 필요합니다.');
    }
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    const numericHistoryId =
      historyId !== undefined && historyId !== null
        ? Number(historyId)
        : undefined;
    if (result.type === 'user') {
      return this.menuService.recommendRestaurantsWithGooglePlacesAndLlmForUser(
        result.user!,
        query,
        menuName,
        numericHistoryId,
      );
    } else {
      return this.menuService.recommendRestaurantsWithGooglePlacesAndLlmForSocialLogin(
        result.socialLogin!,
        query,
        menuName,
        numericHistoryId,
      );
    }
  }

  // 특정 추천 이력 1건 + 그 이력에서 생성된 AI 가게 추천 상세 조회
  // 예: GET /menu/recommendations/123
  @Get('recommendations/:id')
  @UseGuards(JwtAuthGuard)
  async getRecommendationDetail(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      // 간단한 예외: 잘못된 id
      throw new Error('유효하지 않은 추천 이력 ID입니다.');
    }

    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.getRecommendationDetailForUser(
        result.user!,
        numericId,
      );
    } else {
      return this.menuService.getRecommendationDetailForSocialLogin(
        result.socialLogin!,
        numericId,
      );
    }
  }

  // 단일 placeId에 대한 Google Places 상세 조회
  // 예: GET /menu/places/:placeId/detail
  @Get('places/:placeId/detail')
  @UseGuards(JwtAuthGuard)
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
