import {
  Body,
  Controller,
  Get,
  Param,
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
import { RecommendMenuDto } from './dto/recommend-menu.dto';
import { RecommendationHistoryQueryDto } from './dto/recommendation-history-query.dto';
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
      );
    } else {
      return this.menuService.recommendForSocialLogin(
        result.socialLogin!,
        recommendMenuDto.prompt,
      );
    }
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
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.recommendRestaurantsWithGooglePlacesAndLlmForUser(
        result.user!,
        query,
      );
    } else {
      return this.menuService.recommendRestaurantsWithGooglePlacesAndLlmForSocialLogin(
        result.socialLogin!,
        query,
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
}
