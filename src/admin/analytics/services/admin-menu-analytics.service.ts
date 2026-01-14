import { Injectable } from '@nestjs/common';
import { AdminMenuTrendService } from './admin-menu-trend.service';
import { AdminMenuPopularService } from './admin-menu-popular.service';
import { AdminMenuRegionService } from './admin-menu-region.service';
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

/**
 * AdminMenuAnalyticsService - Facade Pattern
 * 메뉴 분석 관련 서비스들을 통합하는 Facade 서비스입니다.
 * 컨트롤러는 이 서비스만 주입받아 사용하며, 내부적으로는 책임별로 분리된 서비스들에 위임합니다.
 */
@Injectable()
export class AdminMenuAnalyticsService {
  constructor(
    private readonly trendService: AdminMenuTrendService,
    private readonly popularService: AdminMenuPopularService,
    private readonly regionService: AdminMenuRegionService,
  ) {}

  /**
   * 기간별 추천 추이를 조회합니다.
   * @delegate AdminMenuTrendService.getTrends()
   */
  async getTrends(query: MenuTrendsQueryDto): Promise<MenuTrendsResponseDto> {
    return this.trendService.getTrends(query);
  }

  /**
   * 시간대별 분석을 조회합니다.
   * @delegate AdminMenuTrendService.getHourlyAnalytics()
   */
  async getHourlyAnalytics(
    query: HourlyAnalyticsQueryDto,
  ): Promise<HourlyAnalyticsResponseDto> {
    return this.trendService.getHourlyAnalytics(query);
  }

  /**
   * 슬롯별 분석을 조회합니다.
   * @delegate AdminMenuTrendService.getSlotAnalytics()
   */
  async getSlotAnalytics(
    query: SlotAnalyticsQueryDto,
  ): Promise<SlotAnalyticsResponseDto> {
    return this.trendService.getSlotAnalytics(query);
  }

  /**
   * 인기 메뉴를 조회합니다.
   * @delegate AdminMenuPopularService.getPopularMenus()
   */
  async getPopularMenus(
    query: PopularMenuQueryDto,
  ): Promise<PopularMenuResponseDto> {
    return this.popularService.getPopularMenus(query);
  }

  /**
   * 키워드 분석을 조회합니다.
   * @delegate AdminMenuPopularService.getKeywordAnalytics()
   */
  async getKeywordAnalytics(
    query: KeywordAnalyticsQueryDto,
  ): Promise<KeywordAnalyticsResponseDto> {
    return this.popularService.getKeywordAnalytics(query);
  }

  /**
   * 지역별 분석을 조회합니다.
   * @delegate AdminMenuRegionService.getRegionAnalytics()
   */
  async getRegionAnalytics(
    query: RegionAnalyticsQueryDto,
  ): Promise<RegionAnalyticsResponseDto> {
    return this.regionService.getRegionAnalytics(query);
  }

  /**
   * 특정 지역의 인기 메뉴를 조회합니다.
   * @delegate AdminMenuRegionService.getRegionPopularMenus()
   */
  async getRegionPopularMenus(
    region: string,
  ): Promise<RegionPopularMenuResponseDto> {
    return this.regionService.getRegionPopularMenus(region);
  }
}
