import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AdminRestaurantAnalyticsService } from '../services/admin-restaurant-analytics.service';
import {
  SearchVolumeQueryDto,
  SearchVolumeResponseDto,
  SearchKeywordsQueryDto,
  SearchKeywordsResponseDto,
  SearchRegionsQueryDto,
  SearchRegionsResponseDto,
} from '../dto/restaurant';

@Controller('admin/analytics/restaurant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminRestaurantAnalyticsController {
  constructor(
    private readonly restaurantAnalyticsService: AdminRestaurantAnalyticsService,
  ) {}

  /**
   * 검색량 추이 조회
   * GET /admin/analytics/restaurant/search-volume
   */
  @Get('search-volume')
  async getSearchVolume(
    @Query() query: SearchVolumeQueryDto,
  ): Promise<SearchVolumeResponseDto> {
    return this.restaurantAnalyticsService.getSearchVolume(query);
  }

  /**
   * 검색 키워드 분석
   * GET /admin/analytics/restaurant/keywords
   */
  @Get('keywords')
  async getSearchKeywords(
    @Query() query: SearchKeywordsQueryDto,
  ): Promise<SearchKeywordsResponseDto> {
    return this.restaurantAnalyticsService.getSearchKeywords(query);
  }

  /**
   * 검색 지역 분포 조회
   * GET /admin/analytics/restaurant/regions
   */
  @Get('regions')
  async getSearchRegions(
    @Query() query: SearchRegionsQueryDto,
  ): Promise<SearchRegionsResponseDto> {
    return this.restaurantAnalyticsService.getSearchRegions(query);
  }
}
