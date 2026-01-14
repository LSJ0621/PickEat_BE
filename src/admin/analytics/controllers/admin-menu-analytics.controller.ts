import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AdminMenuAnalyticsService } from '../services/admin-menu-analytics.service';
import {
  MenuTrendsQueryDto,
  MenuTrendsResponseDto,
  HourlyAnalyticsQueryDto,
  HourlyAnalyticsResponseDto,
  SlotAnalyticsQueryDto,
  SlotAnalyticsResponseDto,
  PopularMenuQueryDto,
  PopularMenuResponseDto,
  KeywordAnalyticsQueryDto,
  KeywordAnalyticsResponseDto,
  RegionAnalyticsQueryDto,
  RegionAnalyticsResponseDto,
  RegionPopularMenuResponseDto,
} from '../dto/menu';

@Controller('admin/analytics/menu')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminMenuAnalyticsController {
  constructor(
    private readonly menuAnalyticsService: AdminMenuAnalyticsService,
  ) {}

  /**
   * 기간별 추천 추이 조회
   * GET /admin/analytics/menu/trends
   */
  @Get('trends')
  async getTrends(
    @Query() query: MenuTrendsQueryDto,
  ): Promise<MenuTrendsResponseDto> {
    return this.menuAnalyticsService.getTrends(query);
  }

  /**
   * 시간대별 분석 조회
   * GET /admin/analytics/menu/hourly
   */
  @Get('hourly')
  async getHourlyAnalytics(
    @Query() query: HourlyAnalyticsQueryDto,
  ): Promise<HourlyAnalyticsResponseDto> {
    return this.menuAnalyticsService.getHourlyAnalytics(query);
  }

  /**
   * 슬롯별 분석 조회
   * GET /admin/analytics/menu/slots
   */
  @Get('slots')
  async getSlotAnalytics(
    @Query() query: SlotAnalyticsQueryDto,
  ): Promise<SlotAnalyticsResponseDto> {
    return this.menuAnalyticsService.getSlotAnalytics(query);
  }

  /**
   * 인기 메뉴 조회
   * GET /admin/analytics/menu/popular
   */
  @Get('popular')
  async getPopularMenus(
    @Query() query: PopularMenuQueryDto,
  ): Promise<PopularMenuResponseDto> {
    return this.menuAnalyticsService.getPopularMenus(query);
  }

  /**
   * 키워드 분석 조회
   * GET /admin/analytics/menu/keywords
   */
  @Get('keywords')
  async getKeywordAnalytics(
    @Query() query: KeywordAnalyticsQueryDto,
  ): Promise<KeywordAnalyticsResponseDto> {
    return this.menuAnalyticsService.getKeywordAnalytics(query);
  }

  /**
   * 지역별 분석 조회
   * GET /admin/analytics/menu/regions
   */
  @Get('regions')
  async getRegionAnalytics(
    @Query() query: RegionAnalyticsQueryDto,
  ): Promise<RegionAnalyticsResponseDto> {
    return this.menuAnalyticsService.getRegionAnalytics(query);
  }

  /**
   * 지역별 인기 메뉴 조회
   * GET /admin/analytics/menu/regions/:region/popular
   */
  @Get('regions/:region/popular')
  async getRegionPopularMenus(
    @Param('region') region: string,
  ): Promise<RegionPopularMenuResponseDto> {
    if (!region || region.trim().length === 0) {
      throw new BadRequestException('Region parameter is required');
    }
    return this.menuAnalyticsService.getRegionPopularMenus(region);
  }
}
