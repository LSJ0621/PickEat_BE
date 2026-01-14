import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { MenuSlotPayload } from '@/menu/interface/menu-selection.interface';
import {
  PopularMenuQueryDto,
  PopularMenuResponseDto,
  PopularMenuItem,
  KeywordAnalyticsQueryDto,
  KeywordAnalyticsResponseDto,
  KeywordItem,
} from '../dto/menu';

interface RawMenuCount {
  menu: string;
  count: string;
}

@Injectable()
export class AdminMenuPopularService {
  private readonly logger = new Logger(AdminMenuPopularService.name);

  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly menuRecommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
  ) {}

  /**
   * 인기 메뉴를 조회합니다.
   * - 추천/선택 타입별
   * - 선택률 계산
   */
  async getPopularMenus(
    query: PopularMenuQueryDto,
  ): Promise<PopularMenuResponseDto> {
    const { type, period, slot, limit } = query;
    const startDate = this.getStartDateFromPeriod(period ?? '30d');

    this.logger.debug(
      `Getting popular menus: type=${type}, period=${period}, slot=${slot}`,
    );

    let data: PopularMenuItem[];

    if (type === 'recommended') {
      data = await this.getPopularRecommendedMenus(
        startDate,
        slot,
        limit ?? 20,
      );
    } else {
      data = await this.getPopularSelectedMenus(startDate, slot, limit ?? 20);
    }

    return { data };
  }

  /**
   * 키워드 분석을 조회합니다.
   * - 메뉴명에서 키워드 추출
   * - 트렌드 up/down/stable 판정
   */
  async getKeywordAnalytics(
    query: KeywordAnalyticsQueryDto,
  ): Promise<KeywordAnalyticsResponseDto> {
    const days = query.period === '7d' ? 7 : 30;
    const halfDays = Math.floor(days / 2);
    const now = this.getKSTToday();

    const recentStart = new Date(now);
    recentStart.setDate(recentStart.getDate() - halfDays);

    const previousStart = new Date(now);
    previousStart.setDate(previousStart.getDate() - days);

    this.logger.debug(`Getting keyword analytics: period=${query.period}`);

    // 최근 기간 메뉴 추출
    const recentMenus = await this.getMenuKeywords(recentStart, now);
    const previousMenus = await this.getMenuKeywords(
      previousStart,
      recentStart,
    );

    // 키워드 카운트
    const recentCounts = this.countKeywords(recentMenus);
    const previousCounts = this.countKeywords(previousMenus);

    // 키워드 분석 결과 생성
    const allKeywords = new Set([
      ...recentCounts.keys(),
      ...previousCounts.keys(),
    ]);
    const keywordItems: KeywordItem[] = [];

    for (const keyword of allKeywords) {
      const recentCount = recentCounts.get(keyword) ?? 0;
      const previousCount = previousCounts.get(keyword) ?? 0;
      const totalCount = recentCount + previousCount;

      if (totalCount < 2) continue; // 최소 2회 이상 등장한 키워드만

      const changeRate =
        previousCount > 0
          ? Math.round(((recentCount - previousCount) / previousCount) * 100)
          : recentCount > 0
            ? 100
            : 0;

      let trend: 'up' | 'down' | 'stable';
      if (changeRate > 10) {
        trend = 'up';
      } else if (changeRate < -10) {
        trend = 'down';
      } else {
        trend = 'stable';
      }

      keywordItems.push({
        keyword,
        count: totalCount,
        trend,
        changeRate,
      });
    }

    // 카운트 순으로 정렬 후 limit 적용
    keywordItems.sort((a, b) => b.count - a.count);
    const limitedData = keywordItems.slice(0, query.limit ?? 50);

    return { data: limitedData };
  }

  // ===== Private Helper Methods =====

  private getKSTToday(): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - kstOffset);
  }

  private getStartDateFromPeriod(period: '7d' | '30d' | 'all'): Date | null {
    if (period === 'all') {
      return null;
    }
    const days = period === '7d' ? 7 : 30;
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - days);
    return startDate;
  }

  private async getPopularRecommendedMenus(
    startDate: Date | null,
    slot: string | undefined,
    limit: number,
  ): Promise<PopularMenuItem[]> {
    let query = this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('UNNEST(mr.recommendations)', 'menu')
      .addSelect('COUNT(*)', 'count');

    if (startDate) {
      query = query.where('mr.createdAt >= :startDate', { startDate });
    }

    const rawResults = await query
      .groupBy('UNNEST(mr.recommendations)')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<RawMenuCount>();

    return rawResults.map((row) => ({
      menu: row.menu,
      count: parseInt(row.count, 10),
    }));
  }

  private async getPopularSelectedMenus(
    startDate: Date | null,
    slot: 'breakfast' | 'lunch' | 'dinner' | 'etc' | undefined,
    limit: number,
  ): Promise<PopularMenuItem[]> {
    let query = this.menuSelectionRepository
      .createQueryBuilder('ms')
      .select('ms.menuPayload', 'menuPayload');

    if (startDate) {
      query = query.where('ms.createdAt >= :startDate', { startDate });
    }

    const selections = await query.getRawMany<{
      menuPayload: MenuSlotPayload;
    }>();

    // 메뉴별 카운트
    const menuCounts = new Map<string, number>();

    for (const row of selections) {
      const payload = row.menuPayload;
      if (!payload) continue;

      const slots: Array<keyof MenuSlotPayload> = slot
        ? [slot]
        : ['breakfast', 'lunch', 'dinner', 'etc'];

      for (const s of slots) {
        const menus = payload[s] ?? [];
        for (const menu of menus) {
          menuCounts.set(menu, (menuCounts.get(menu) ?? 0) + 1);
        }
      }
    }

    // 정렬 및 limit 적용
    const sortedMenus = Array.from(menuCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // 선택률 계산을 위한 추천 데이터 조회
    const recommendedCounts = new Map<string, number>();
    let recommendQuery = this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('UNNEST(mr.recommendations)', 'menu')
      .addSelect('COUNT(*)', 'count');

    if (startDate) {
      recommendQuery = recommendQuery.where('mr.createdAt >= :startDate', {
        startDate,
      });
    }

    const recommendedRaw = await recommendQuery
      .groupBy('UNNEST(mr.recommendations)')
      .getRawMany<RawMenuCount>();

    for (const row of recommendedRaw) {
      recommendedCounts.set(row.menu, parseInt(row.count, 10));
    }

    return sortedMenus.map(([menu, count]) => {
      const recommendedCount = recommendedCounts.get(menu) ?? 0;
      const rate =
        recommendedCount > 0
          ? Math.round((count / recommendedCount) * 1000) / 10
          : undefined;

      return {
        menu,
        count,
        rate,
      };
    });
  }

  private async getMenuKeywords(
    startDate: Date,
    endDate: Date,
  ): Promise<string[]> {
    const results = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('mr.recommendations', 'recommendations')
      .where('mr.createdAt >= :startDate', { startDate })
      .andWhere('mr.createdAt < :endDate', { endDate })
      .getRawMany<{ recommendations: string[] }>();

    const menus: string[] = [];
    for (const row of results) {
      if (row.recommendations) {
        menus.push(...row.recommendations);
      }
    }

    return menus;
  }

  private countKeywords(menus: string[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const menu of menus) {
      // 메뉴명에서 키워드 추출 (공백으로 분리하거나 전체 메뉴명 사용)
      // 한국어 메뉴의 경우 전체 이름을 키워드로 사용
      const keyword = menu.trim();
      if (keyword) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
      }
    }

    return counts;
  }
}
