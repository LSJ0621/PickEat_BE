import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { MenuSlotPayload } from '@/menu/interface/menu-selection.interface';
import {
  MenuTrendsQueryDto,
  MenuTrendsResponseDto,
  DailyTrendItem,
  HourlyAnalyticsQueryDto,
  HourlyAnalyticsResponseDto,
  HourlyCountItem,
  DayHourCountItem,
  SlotAnalyticsQueryDto,
  SlotAnalyticsResponseDto,
  SlotTrendItem,
} from '../dto/menu';

interface RawDateCount {
  date: string;
  count: string;
}

interface RawHourCount {
  hour: string;
  count: string;
}

interface RawDayHourCount {
  day: string;
  hour: string;
  count: string;
}

@Injectable()
export class AdminMenuTrendService {
  private readonly logger = new Logger(AdminMenuTrendService.name);

  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly menuRecommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
  ) {}

  /**
   * 기간별 추천 추이를 조회합니다.
   * - 일별/주별/월별 그룹핑
   * - 이전 기간 대비 증감률 계산
   */
  async getTrends(query: MenuTrendsQueryDto): Promise<MenuTrendsResponseDto> {
    const { startDate, endDate, groupBy } = this.parseTrendsQuery(query);
    const days = this.getDaysFromDates(startDate, endDate);

    this.logger.debug(
      `Getting trends: ${startDate.toISOString()} to ${endDate.toISOString()}, groupBy=${groupBy}`,
    );

    // 현재 기간 데이터 조회
    const currentData = await this.getGroupedTrendData(
      startDate,
      endDate,
      groupBy,
    );

    // 이전 기간 데이터 조회 (증감률 계산용)
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);
    const previousEndDate = new Date(startDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1);

    const previousTotal = await this.getTotalCount(
      previousStartDate,
      previousEndDate,
    );
    const currentTotal = currentData.reduce((sum, item) => sum + item.count, 0);

    // 증감률 계산
    const change =
      previousTotal > 0
        ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
        : currentTotal > 0
          ? 100
          : 0;

    const average =
      currentData.length > 0
        ? Math.round(currentTotal / currentData.length)
        : 0;

    return {
      data: currentData,
      summary: {
        total: currentTotal,
        average,
        change,
      },
    };
  }

  /**
   * 시간대별 분석을 조회합니다.
   * - 0-23시별 분포
   * - 요일×시간 매트릭스
   * - 피크타임
   */
  async getHourlyAnalytics(
    query: HourlyAnalyticsQueryDto,
  ): Promise<HourlyAnalyticsResponseDto> {
    const days = query.period === '7d' ? 7 : 30;
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - days);

    this.logger.debug(`Getting hourly analytics: period=${query.period}`);

    // 시간대별 집계
    const byHourRaw = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select(
        "EXTRACT(HOUR FROM mr.createdAt AT TIME ZONE 'Asia/Seoul')",
        'hour',
      )
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .groupBy("EXTRACT(HOUR FROM mr.createdAt AT TIME ZONE 'Asia/Seoul')")
      .orderBy('hour', 'ASC')
      .getRawMany<RawHourCount>();

    // 요일×시간 매트릭스
    const byDayHourRaw = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select("EXTRACT(DOW FROM mr.createdAt AT TIME ZONE 'Asia/Seoul')", 'day')
      .addSelect(
        "EXTRACT(HOUR FROM mr.createdAt AT TIME ZONE 'Asia/Seoul')",
        'hour',
      )
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .groupBy(
        "EXTRACT(DOW FROM mr.createdAt AT TIME ZONE 'Asia/Seoul'), EXTRACT(HOUR FROM mr.createdAt AT TIME ZONE 'Asia/Seoul')",
      )
      .orderBy('day', 'ASC')
      .addOrderBy('hour', 'ASC')
      .getRawMany<RawDayHourCount>();

    // 시간대별 데이터 변환 (0-23시 모두 포함)
    const byHourMap = new Map<number, number>();
    for (const row of byHourRaw) {
      byHourMap.set(parseInt(row.hour, 10), parseInt(row.count, 10));
    }

    const byHour: HourlyCountItem[] = [];
    for (let h = 0; h < 24; h++) {
      byHour.push({
        hour: h,
        count: byHourMap.get(h) ?? 0,
      });
    }

    // 요일×시간 매트릭스 변환
    const byDayAndHour: DayHourCountItem[] = byDayHourRaw.map((row) => ({
      day: parseInt(row.day, 10),
      hour: parseInt(row.hour, 10),
      count: parseInt(row.count, 10),
    }));

    // 피크타임 계산
    let peakHour = 0;
    let peakCount = 0;
    for (const item of byHour) {
      if (item.count > peakCount) {
        peakHour = item.hour;
        peakCount = item.count;
      }
    }

    return {
      byHour,
      byDayAndHour,
      peakTime: {
        hour: peakHour,
        count: peakCount,
      },
    };
  }

  /**
   * 슬롯별 분석을 조회합니다.
   * - 아침/점심/저녁/기타 비율
   * - 일별 슬롯 추이
   */
  async getSlotAnalytics(
    query: SlotAnalyticsQueryDto,
  ): Promise<SlotAnalyticsResponseDto> {
    const days = query.period === '7d' ? 7 : query.period === '30d' ? 30 : 90;
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - days);

    this.logger.debug(`Getting slot analytics: period=${query.period}`);

    // 전체 슬롯별 집계
    const selections = await this.menuSelectionRepository
      .createQueryBuilder('ms')
      .select('ms.menuPayload', 'menuPayload')
      .where('ms.createdAt >= :startDate', { startDate })
      .getRawMany<{ menuPayload: MenuSlotPayload }>();

    const slotCounts = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      etc: 0,
    };

    for (const row of selections) {
      const payload = row.menuPayload;
      if (payload) {
        if (payload.breakfast?.length > 0) slotCounts.breakfast++;
        if (payload.lunch?.length > 0) slotCounts.lunch++;
        if (payload.dinner?.length > 0) slotCounts.dinner++;
        if (payload.etc?.length > 0) slotCounts.etc++;
      }
    }

    // 일별 슬롯 추이
    const dailySelections = await this.menuSelectionRepository
      .createQueryBuilder('ms')
      .select('DATE(ms.createdAt)', 'date')
      .addSelect('ms.menuPayload', 'menuPayload')
      .where('ms.createdAt >= :startDate', { startDate })
      .getRawMany<{ date: string; menuPayload: MenuSlotPayload }>();

    const dailyMap = new Map<
      string,
      { breakfast: number; lunch: number; dinner: number; etc: number }
    >();

    for (const row of dailySelections) {
      const dateStr = this.formatDate(row.date);
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { breakfast: 0, lunch: 0, dinner: 0, etc: 0 });
      }
      const dayData = dailyMap.get(dateStr)!;
      const payload = row.menuPayload;
      if (payload) {
        if (payload.breakfast?.length > 0) dayData.breakfast++;
        if (payload.lunch?.length > 0) dayData.lunch++;
        if (payload.dinner?.length > 0) dayData.dinner++;
        if (payload.etc?.length > 0) dayData.etc++;
      }
    }

    // 빠진 날짜 채우기
    const trends: SlotTrendItem[] = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = dailyMap.get(dateStr) ?? {
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        etc: 0,
      };
      trends.push({
        date: dateStr,
        ...dayData,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      data: slotCounts,
      trends,
    };
  }

  // ===== Private Helper Methods =====

  private parseTrendsQuery(query: MenuTrendsQueryDto): {
    startDate: Date;
    endDate: Date;
    groupBy: 'day' | 'week' | 'month';
  } {
    let startDate: Date;
    let endDate: Date;

    if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else {
      const days =
        query.period === '7d'
          ? 7
          : query.period === '30d'
            ? 30
            : query.period === '90d'
              ? 90
              : 365;
      endDate = this.getKSTToday();
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);
    }

    return {
      startDate,
      endDate,
      groupBy: query.groupBy ?? 'day',
    };
  }

  private getDaysFromDates(startDate: Date, endDate: Date): number {
    const diff = endDate.getTime() - startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  private async getGroupedTrendData(
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<DailyTrendItem[]> {
    // SQL Injection 방지를 위한 상수 매핑
    const TRUNC_FUNCTIONS: Record<string, string> = {
      day: 'day',
      week: 'week',
      month: 'month',
    };
    const truncFunc = TRUNC_FUNCTIONS[groupBy] ?? 'day';

    const rawResults = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select(`DATE_TRUNC('${truncFunc}', mr.createdAt)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .andWhere('mr.createdAt <= :endDate', { endDate })
      .groupBy(`DATE_TRUNC('${truncFunc}', mr.createdAt)`)
      .orderBy('date', 'ASC')
      .getRawMany<RawDateCount>();

    if (groupBy === 'day') {
      const days = this.getDaysFromDates(startDate, endDate);
      return this.fillMissingDates(rawResults, startDate, days);
    }

    return rawResults.map((row) => ({
      date: this.formatDate(row.date),
      count: parseInt(row.count, 10),
    }));
  }

  private async getTotalCount(startDate: Date, endDate: Date): Promise<number> {
    const result = await this.menuRecommendationRepository
      .createQueryBuilder('mr')
      .select('COUNT(*)', 'count')
      .where('mr.createdAt >= :startDate', { startDate })
      .andWhere('mr.createdAt <= :endDate', { endDate })
      .getRawOne<{ count: string }>();

    return parseInt(result?.count ?? '0', 10);
  }

  private fillMissingDates(
    rawResults: RawDateCount[],
    startDate: Date,
    days: number,
  ): DailyTrendItem[] {
    const resultMap = new Map<string, number>();
    for (const row of rawResults) {
      const dateStr = this.formatDate(row.date);
      resultMap.set(dateStr, parseInt(row.count, 10));
    }

    const trendData: DailyTrendItem[] = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      trendData.push({
        date: dateStr,
        count: resultMap.get(dateStr) ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private formatDate(dateValue: string | Date): string {
    if (typeof dateValue === 'object' && dateValue !== null) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
  }

  private getKSTToday(): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - kstOffset);
  }
}
