import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import {
  RegionAnalyticsQueryDto,
  RegionAnalyticsResponseDto,
  RegionItem,
  RegionPopularMenuResponseDto,
  RegionPopularMenuItem,
} from '../dto/menu';

interface RawRegionCount {
  region: string;
  count: string;
}

interface RawMenuCount {
  menu: string;
  count: string;
}

@Injectable()
export class AdminMenuRegionService {
  private readonly logger = new Logger(AdminMenuRegionService.name);

  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly menuRecommendationRepository: Repository<MenuRecommendation>,
  ) {}

  /**
   * 지역별 분석을 조회합니다.
   * - 시/도별 분포
   */
  async getRegionAnalytics(
    query: RegionAnalyticsQueryDto,
  ): Promise<RegionAnalyticsResponseDto> {
    const days = query.period === '7d' ? 7 : query.period === '30d' ? 30 : 90;
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - days);

    this.logger.debug(`Getting region analytics: period=${query.period}`);

    const rawResults = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('mr.region', 'region')
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .andWhere('mr.region IS NOT NULL')
      .groupBy('mr.region')
      .orderBy('count', 'DESC')
      .getRawMany<RawRegionCount>();

    const total = rawResults.reduce(
      (sum, row) => sum + parseInt(row.count, 10),
      0,
    );

    const byRegion: RegionItem[] = rawResults.map((row) => ({
      region: row.region,
      count: parseInt(row.count, 10),
      percentage:
        total > 0
          ? Math.round((parseInt(row.count, 10) / total) * 1000) / 10
          : 0,
    }));

    return { byRegion };
  }

  /**
   * 특정 지역의 인기 메뉴를 조회합니다.
   */
  async getRegionPopularMenus(
    region: string,
  ): Promise<RegionPopularMenuResponseDto> {
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - 30);

    this.logger.debug(`Getting region popular menus: region=${region}`);

    // 해당 지역 인기 메뉴
    const regionMenusRaw = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('UNNEST(mr.recommendations)', 'menu')
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .andWhere('mr.region = :region', { region })
      .groupBy('UNNEST(mr.recommendations)')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany<RawMenuCount>();

    // 전국 순위 계산을 위한 전국 데이터
    const nationalMenusRaw = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('UNNEST(mr.recommendations)', 'menu')
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .groupBy('UNNEST(mr.recommendations)')
      .orderBy('count', 'DESC')
      .getRawMany<RawMenuCount>();

    // 전국 순위 맵 생성
    const nationalRankMap = new Map<string, number>();
    nationalMenusRaw.forEach((row, index) => {
      nationalRankMap.set(row.menu, index + 1);
    });

    // 지역 평균 대비 특화 메뉴 판정
    const nationalCountMap = new Map<string, number>();
    nationalMenusRaw.forEach((row) => {
      nationalCountMap.set(row.menu, parseInt(row.count, 10));
    });

    const data: RegionPopularMenuItem[] = regionMenusRaw.map((row) => {
      const menu = row.menu;
      const count = parseInt(row.count, 10);
      const nationalRank = nationalRankMap.get(menu) ?? 999;
      const nationalCount = nationalCountMap.get(menu) ?? 0;

      // 지역 비율이 전국 비율보다 50% 이상 높으면 지역 특화 메뉴로 판정
      const totalRegion = regionMenusRaw.reduce(
        (sum, r) => sum + parseInt(r.count, 10),
        0,
      );
      const totalNational = nationalMenusRaw.reduce(
        (sum, r) => sum + parseInt(r.count, 10),
        0,
      );

      const regionRate = totalRegion > 0 ? count / totalRegion : 0;
      const nationalRate =
        totalNational > 0 ? nationalCount / totalNational : 0;

      const isUnique = nationalRate > 0 && regionRate / nationalRate > 1.5;

      return {
        menu,
        count,
        nationalRank,
        isUnique,
      };
    });

    return {
      region,
      data,
    };
  }

  // ===== Private Helper Methods =====

  private getKSTToday(): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - kstOffset);
  }
}
