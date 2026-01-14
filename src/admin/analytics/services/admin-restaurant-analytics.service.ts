import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceSearchLog } from '../entities/place-search-log.entity';
import {
  SearchVolumeQueryDto,
  SearchVolumeResponseDto,
  DailySearchItem,
  SearchKeywordsQueryDto,
  SearchKeywordsResponseDto,
  SearchKeywordItem,
  SearchRegionsQueryDto,
  SearchRegionsResponseDto,
  SearchRegionItem,
} from '../dto/restaurant';

/**
 * 지역별 대표 좌표
 */
const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  서울: { lat: 37.5665, lng: 126.978 },
  경기: { lat: 37.4138, lng: 127.5183 },
  인천: { lat: 37.4563, lng: 126.7052 },
  부산: { lat: 35.1796, lng: 129.0756 },
  대구: { lat: 35.8714, lng: 128.6014 },
  광주: { lat: 35.1595, lng: 126.8526 },
  대전: { lat: 36.3504, lng: 127.3845 },
  울산: { lat: 35.5384, lng: 129.3114 },
  세종: { lat: 36.48, lng: 127.289 },
  강원: { lat: 37.8228, lng: 128.1555 },
  충북: { lat: 36.8, lng: 127.7 },
  충남: { lat: 36.5184, lng: 126.8 },
  전북: { lat: 35.82, lng: 127.108 },
  전남: { lat: 34.8679, lng: 126.991 },
  경북: { lat: 36.4919, lng: 128.8889 },
  경남: { lat: 35.4606, lng: 128.2132 },
  제주: { lat: 33.4996, lng: 126.5312 },
};

interface RawDailySearchResult {
  date: string | Date;
  count: string;
}

interface RawKeywordResult {
  keyword: string;
  count: string;
}

interface RawRegionResult {
  region: string;
  count: string;
}

@Injectable()
export class AdminRestaurantAnalyticsService {
  private readonly logger = new Logger(AdminRestaurantAnalyticsService.name);

  constructor(
    @InjectRepository(PlaceSearchLog)
    private readonly placeSearchLogRepository: Repository<PlaceSearchLog>,
  ) {}

  /**
   * 검색량 추이 조회
   * - places/blogs 타입별 일별 검색량
   * - 전기간 대비 증감률
   */
  async getSearchVolume(
    query: SearchVolumeQueryDto,
  ): Promise<SearchVolumeResponseDto> {
    const days = this.getPeriodDays(query.period ?? '30d');
    const startDate = this.getKSTStartDate(days);
    const previousStartDate = this.getKSTStartDate(days * 2);

    let placesData: DailySearchItem[] = [];
    let blogsData: DailySearchItem[] = [];
    let totalPlaceSearches = 0;
    let totalBlogSearches = 0;
    let previousPlaceSearches = 0;
    let previousBlogSearches = 0;

    const includeAll = query.type === 'all' || !query.type;

    // Places 검색량 조회
    if (includeAll || query.type === 'places') {
      const [currentPlaces, currentTotal, previousTotal] = await Promise.all([
        this.getDailySearchData('places', startDate, days),
        this.getTotalSearchCount('places', startDate),
        this.getTotalSearchCount('places', previousStartDate, startDate),
      ]);
      placesData = currentPlaces;
      totalPlaceSearches = currentTotal;
      previousPlaceSearches = previousTotal;
    }

    // Blogs 검색량 조회
    if (includeAll || query.type === 'blogs') {
      const [currentBlogs, currentTotal, previousTotal] = await Promise.all([
        this.getDailySearchData('blogs', startDate, days),
        this.getTotalSearchCount('blogs', startDate),
        this.getTotalSearchCount('blogs', previousStartDate, startDate),
      ]);
      blogsData = currentBlogs;
      totalBlogSearches = currentTotal;
      previousBlogSearches = previousTotal;
    }

    const placeChangeRate = this.calculateChangeRate(
      totalPlaceSearches,
      previousPlaceSearches,
    );
    const blogChangeRate = this.calculateChangeRate(
      totalBlogSearches,
      previousBlogSearches,
    );

    return {
      places: placesData,
      blogs: blogsData,
      summary: {
        totalPlaceSearches,
        totalBlogSearches,
        placeChangeRate,
        blogChangeRate,
      },
    };
  }

  /**
   * 검색 키워드 분석
   * - 인기 키워드 목록
   * - 트렌드 변화 (up/down/stable)
   */
  async getSearchKeywords(
    query: SearchKeywordsQueryDto,
  ): Promise<SearchKeywordsResponseDto> {
    const days = this.getPeriodDays(query.period ?? '30d');
    const limit = query.limit ?? 20;
    const startDate = this.getKSTStartDate(days);
    const previousStartDate = this.getKSTStartDate(days * 2);
    const halfDaysAgo = this.getKSTStartDate(Math.floor(days / 2));

    // 현재 기간 인기 키워드 조회
    const currentKeywords = await this.getTopKeywords(startDate, limit);

    // 이전 기간 키워드 수 조회 (비교용)
    const keywordNames = currentKeywords.map((k) => k.keyword);
    const previousKeywordCounts = await this.getKeywordCounts(
      keywordNames,
      previousStartDate,
      startDate,
    );
    const firstHalfCounts = await this.getKeywordCounts(
      keywordNames,
      startDate,
      halfDaysAgo,
    );
    const secondHalfCounts = await this.getKeywordCounts(
      keywordNames,
      halfDaysAgo,
    );

    const data: SearchKeywordItem[] = currentKeywords.map((k) => {
      const previousCount = previousKeywordCounts.get(k.keyword) ?? 0;
      const firstHalf = firstHalfCounts.get(k.keyword) ?? 0;
      const secondHalf = secondHalfCounts.get(k.keyword) ?? 0;

      const changeRate = this.calculateChangeRate(k.count, previousCount);
      const trend = this.determineTrend(firstHalf, secondHalf);

      return {
        keyword: k.keyword,
        count: k.count,
        trend,
        changeRate,
      };
    });

    return { data };
  }

  /**
   * 검색 지역 분포 조회
   * - 시/도별 검색 수
   * - 비율 및 대표 좌표
   */
  async getSearchRegions(
    query: SearchRegionsQueryDto,
  ): Promise<SearchRegionsResponseDto> {
    const days = this.getPeriodDays(query.period ?? '30d');
    const startDate = this.getKSTStartDate(days);

    const rawResults = await this.placeSearchLogRepository
      .createQueryBuilder('log')
      .select('log.region', 'region')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :startDate', { startDate })
      .andWhere('log.region IS NOT NULL')
      .andWhere('log.deletedAt IS NULL')
      .groupBy('log.region')
      .orderBy('count', 'DESC')
      .getRawMany<RawRegionResult>();

    const totalCount = rawResults.reduce(
      (sum, row) => sum + parseInt(row.count, 10),
      0,
    );

    const data: SearchRegionItem[] = rawResults.map((row) => {
      const regionName = row.region;
      const count = parseInt(row.count, 10);
      const percentage =
        totalCount > 0 ? Math.round((count / totalCount) * 100 * 100) / 100 : 0;

      const coordinates = REGION_COORDINATES[regionName] ?? {
        lat: 37.5665,
        lng: 126.978,
      };

      return {
        region: regionName,
        count,
        percentage,
        coordinates,
      };
    });

    return { data };
  }

  /**
   * 특정 타입의 일별 검색 데이터 조회
   */
  private async getDailySearchData(
    searchType: string,
    startDate: Date,
    days: number,
  ): Promise<DailySearchItem[]> {
    const rawResults = await this.placeSearchLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :startDate', { startDate })
      .andWhere('log.searchType = :searchType', { searchType })
      .andWhere('log.deletedAt IS NULL')
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<RawDailySearchResult>();

    return this.fillMissingDates(rawResults, startDate, days);
  }

  /**
   * 특정 타입의 전체 검색 수 조회
   */
  private async getTotalSearchCount(
    searchType: string,
    startDate: Date,
    endDate?: Date,
  ): Promise<number> {
    const queryBuilder = this.placeSearchLogRepository
      .createQueryBuilder('log')
      .where('log.createdAt >= :startDate', { startDate })
      .andWhere('log.searchType = :searchType', { searchType })
      .andWhere('log.deletedAt IS NULL');

    if (endDate) {
      queryBuilder.andWhere('log.createdAt < :endDate', { endDate });
    }

    return queryBuilder.getCount();
  }

  /**
   * 인기 키워드 조회
   */
  private async getTopKeywords(
    startDate: Date,
    limit: number,
  ): Promise<Array<{ keyword: string; count: number }>> {
    const rawResults = await this.placeSearchLogRepository
      .createQueryBuilder('log')
      .select('log.keyword', 'keyword')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :startDate', { startDate })
      .andWhere('log.deletedAt IS NULL')
      .groupBy('log.keyword')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<RawKeywordResult>();

    return rawResults.map((row) => ({
      keyword: row.keyword,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * 특정 키워드들의 검색 수 조회
   */
  private async getKeywordCounts(
    keywords: string[],
    startDate: Date,
    endDate?: Date,
  ): Promise<Map<string, number>> {
    if (keywords.length === 0) {
      return new Map();
    }

    const queryBuilder = this.placeSearchLogRepository
      .createQueryBuilder('log')
      .select('log.keyword', 'keyword')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :startDate', { startDate })
      .andWhere('log.keyword IN (:...keywords)', { keywords })
      .andWhere('log.deletedAt IS NULL')
      .groupBy('log.keyword');

    if (endDate) {
      queryBuilder.andWhere('log.createdAt < :endDate', { endDate });
    }

    const rawResults = await queryBuilder.getRawMany<RawKeywordResult>();

    const map = new Map<string, number>();
    for (const row of rawResults) {
      map.set(row.keyword, parseInt(row.count, 10));
    }

    return map;
  }

  /**
   * 빠진 날짜를 채워서 연속적인 일별 데이터 생성
   */
  private fillMissingDates(
    rawResults: RawDailySearchResult[],
    startDate: Date,
    days: number,
  ): DailySearchItem[] {
    const resultMap = new Map<string, number>();
    for (const row of rawResults) {
      const dateValue = row.date;
      const dateStr =
        typeof dateValue === 'object' && dateValue !== null
          ? dateValue.toISOString().split('T')[0]
          : String(dateValue).split('T')[0];
      resultMap.set(dateStr, parseInt(row.count, 10));
    }

    const trendData: DailySearchItem[] = [];
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

  /**
   * 변화율 계산 (%)
   */
  private calculateChangeRate(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    const rate = ((current - previous) / previous) * 100;
    return Math.round(rate * 100) / 100;
  }

  /**
   * 트렌드 방향 결정
   */
  private determineTrend(
    firstHalf: number,
    secondHalf: number,
  ): 'up' | 'down' | 'stable' {
    const threshold = 0.1; // 10% 이상 변화 시 트렌드로 판단
    if (firstHalf === 0 && secondHalf === 0) {
      return 'stable';
    }
    if (firstHalf === 0) {
      return 'up';
    }

    const changeRate = (secondHalf - firstHalf) / firstHalf;
    if (changeRate > threshold) {
      return 'up';
    }
    if (changeRate < -threshold) {
      return 'down';
    }
    return 'stable';
  }

  /**
   * 기간을 일 수로 변환
   */
  private getPeriodDays(period: string): number {
    switch (period) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      default:
        return 30;
    }
  }

  /**
   * KST 기준 시작일 계산
   */
  private getKSTStartDate(daysAgo: number): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    kstDate.setDate(kstDate.getDate() - daysAgo);
    return new Date(kstDate.getTime() - kstOffset);
  }
}
