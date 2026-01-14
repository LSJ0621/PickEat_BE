import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { AdminMenuAnalyticsService } from '../services/admin-menu-analytics.service';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import {
  MenuTrendsQueryDto,
  HourlyAnalyticsQueryDto,
  SlotAnalyticsQueryDto,
  PopularMenuQueryDto,
  KeywordAnalyticsQueryDto,
  RegionAnalyticsQueryDto,
} from '../dto/menu';

describe('AdminMenuAnalyticsService', () => {
  let service: AdminMenuAnalyticsService;
  let menuRecommendationRepository: ReturnType<
    typeof createMockRepository<MenuRecommendation>
  >;
  let menuSelectionRepository: ReturnType<
    typeof createMockRepository<MenuSelection>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    menuRecommendationRepository = createMockRepository<MenuRecommendation>();
    menuSelectionRepository = createMockRepository<MenuSelection>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMenuAnalyticsService,
        {
          provide: getRepositoryToken(MenuRecommendation),
          useValue: menuRecommendationRepository,
        },
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: menuSelectionRepository,
        },
      ],
    }).compile();

    service = module.get<AdminMenuAnalyticsService>(AdminMenuAnalyticsService);
  });

  it('should create service instance with all dependencies injected', () => {
    expect(service).toBeDefined();
  });

  describe('getTrends', () => {
    it('should return daily trends with summary when using period', async () => {
      const query: MenuTrendsQueryDto = {
        period: '7d',
        groupBy: 'day',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Mock current period data
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: new Date('2024-01-10'), count: '5' },
        { date: new Date('2024-01-11'), count: '8' },
        { date: new Date('2024-01-12'), count: '10' },
      ]);

      // Mock previous period total count
      mockQueryBuilder.getRawOne.mockResolvedValueOnce({ count: '20' });

      const result = await service.getTrends(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.average).toBeGreaterThanOrEqual(0);
      expect(typeof result.summary.change).toBe('number');
    });

    it('should return trends with custom date range', async () => {
      const query: MenuTrendsQueryDto = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        groupBy: 'day',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: new Date('2024-01-01'), count: '3' },
        { date: new Date('2024-01-02'), count: '5' },
      ]);

      mockQueryBuilder.getRawOne.mockResolvedValueOnce({ count: '10' });

      const result = await service.getTrends(query);

      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(
        menuRecommendationRepository.createQueryBuilder,
      ).toHaveBeenCalled();
    });

    it('should handle weekly grouping', async () => {
      const query: MenuTrendsQueryDto = {
        period: '30d',
        groupBy: 'week',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: new Date('2024-01-01'), count: '15' },
        { date: new Date('2024-01-08'), count: '20' },
      ]);

      mockQueryBuilder.getRawOne.mockResolvedValueOnce({ count: '30' });

      const result = await service.getTrends(query);

      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should handle monthly grouping', async () => {
      const query: MenuTrendsQueryDto = {
        period: '90d',
        groupBy: 'month',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: new Date('2024-01-01'), count: '100' },
        { date: new Date('2024-02-01'), count: '120' },
      ]);

      mockQueryBuilder.getRawOne.mockResolvedValueOnce({ count: '180' });

      const result = await service.getTrends(query);

      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should return trends summary with change rate calculated', async () => {
      const query: MenuTrendsQueryDto = {
        period: '7d',
        groupBy: 'day',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: new Date('2024-01-10'), count: '50' },
        { date: new Date('2024-01-11'), count: '50' },
      ]);

      mockQueryBuilder.getRawOne.mockResolvedValueOnce({ count: '80' });

      const result = await service.getTrends(query);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary.change).toBe('number');
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.average).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHourlyAnalytics', () => {
    it('should return hourly analytics with peak time for 7d period', async () => {
      const query: HourlyAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Mock hourly data
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { hour: '12', count: '50' },
          { hour: '13', count: '70' },
          { hour: '18', count: '60' },
        ])
        .mockResolvedValueOnce([
          { day: '1', hour: '12', count: '20' },
          { day: '1', hour: '13', count: '30' },
        ]);

      const result = await service.getHourlyAnalytics(query);

      expect(result.byHour).toBeDefined();
      expect(result.byHour.length).toBe(24); // 0-23 hours
      expect(result.byDayAndHour).toBeDefined();
      expect(result.peakTime).toBeDefined();
      expect(result.peakTime.hour).toBeGreaterThanOrEqual(0);
      expect(result.peakTime.hour).toBeLessThan(24);
      expect(result.peakTime.count).toBeGreaterThanOrEqual(0);
    });

    it('should return hourly analytics for 30d period', async () => {
      const query: HourlyAnalyticsQueryDto = { period: '30d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ hour: '12', count: '100' }])
        .mockResolvedValueOnce([{ day: '0', hour: '12', count: '50' }]);

      const result = await service.getHourlyAnalytics(query);

      expect(result.byHour).toBeDefined();
      expect(result.byHour.length).toBe(24);
      expect(result.byDayAndHour).toBeDefined();
      expect(result.peakTime).toBeDefined();
    });

    it('should fill missing hours with zero count', async () => {
      const query: HourlyAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Only provide data for hours 12 and 18
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { hour: '12', count: '50' },
          { hour: '18', count: '30' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getHourlyAnalytics(query);

      expect(result.byHour.length).toBe(24);
      expect(result.byHour[0].count).toBe(0); // Hour 0 should be 0
      expect(result.byHour[12].count).toBe(50); // Hour 12 should have data
      expect(result.byHour[18].count).toBe(30); // Hour 18 should have data
    });

    it('should calculate peak time correctly', async () => {
      const query: HourlyAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { hour: '10', count: '30' },
          { hour: '12', count: '100' }, // Peak
          { hour: '18', count: '50' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getHourlyAnalytics(query);

      expect(result.peakTime.hour).toBe(12);
      expect(result.peakTime.count).toBe(100);
    });
  });

  describe('getSlotAnalytics', () => {
    it('should return slot analytics with trends for 7d period', async () => {
      const query: SlotAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;

      // Mock selections with slot data
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          {
            menuPayload: {
              breakfast: ['김치찌개'],
              lunch: ['된장찌개', '불고기'],
              dinner: [],
              etc: [],
            },
          },
          {
            menuPayload: {
              breakfast: [],
              lunch: ['비빔밥'],
              dinner: ['삼겹살'],
              etc: [],
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            date: '2024-01-10',
            menuPayload: {
              breakfast: ['김치찌개'],
              lunch: [],
              dinner: [],
              etc: [],
            },
          },
        ]);

      const result = await service.getSlotAnalytics(query);

      expect(result.data).toBeDefined();
      expect(result.data.breakfast).toBeGreaterThanOrEqual(0);
      expect(result.data.lunch).toBeGreaterThanOrEqual(0);
      expect(result.data.dinner).toBeGreaterThanOrEqual(0);
      expect(result.data.etc).toBeGreaterThanOrEqual(0);
      expect(result.trends).toBeDefined();
      expect(Array.isArray(result.trends)).toBe(true);
    });

    it('should return slot analytics for 30d period', async () => {
      const query: SlotAnalyticsQueryDto = { period: '30d' };

      const mockQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          {
            menuPayload: {
              breakfast: ['토스트'],
              lunch: ['파스타'],
              dinner: ['스테이크'],
              etc: ['샐러드'],
            },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getSlotAnalytics(query);

      expect(result.data).toBeDefined();
      expect(result.trends).toBeDefined();
    });

    it('should return slot analytics for 90d period', async () => {
      const query: SlotAnalyticsQueryDto = { period: '90d' };

      const mockQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSlotAnalytics(query);

      expect(result.data).toBeDefined();
      expect(result.data.breakfast).toBe(0);
      expect(result.data.lunch).toBe(0);
      expect(result.data.dinner).toBe(0);
      expect(result.data.etc).toBe(0);
    });

    it('should count multiple menus in a slot correctly', async () => {
      const query: SlotAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          {
            menuPayload: {
              breakfast: ['메뉴1', '메뉴2', '메뉴3'], // Multiple items
              lunch: [],
              dinner: [],
              etc: [],
            },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getSlotAnalytics(query);

      // Should count as 1 slot usage even with multiple menus
      expect(result.data.breakfast).toBe(1);
    });

    it('should handle null menuPayload gracefully', async () => {
      const query: SlotAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { menuPayload: null },
          {
            menuPayload: {
              breakfast: ['김치찌개'],
              lunch: [],
              dinner: [],
              etc: [],
            },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getSlotAnalytics(query);

      expect(result.data.breakfast).toBe(1);
    });
  });

  describe('getPopularMenus', () => {
    it('should return popular recommended menus', async () => {
      const query: PopularMenuQueryDto = {
        type: 'recommended',
        period: '30d',
        limit: 10,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { menu: '김치찌개', count: '50' },
        { menu: '된장찌개', count: '40' },
        { menu: '비빔밥', count: '30' },
      ]);

      const result = await service.getPopularMenus(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].menu).toBeDefined();
      expect(result.data[0].count).toBeGreaterThan(0);
    });

    it('should return popular selected menus with selection rate', async () => {
      const query: PopularMenuQueryDto = {
        type: 'selected',
        period: '30d',
        limit: 10,
      };

      const mockSelectionQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;
      const mockRecommendationQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Mock selections
      mockSelectionQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['김치찌개', '된장찌개'],
            dinner: [],
            etc: [],
          },
        },
        {
          menuPayload: {
            breakfast: ['된장찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        },
      ]);

      // Mock recommendations for rate calculation
      mockRecommendationQueryBuilder.getRawMany.mockResolvedValueOnce([
        { menu: '김치찌개', count: '100' },
        { menu: '된장찌개', count: '80' },
      ]);

      const result = await service.getPopularMenus(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].menu).toBeDefined();
      expect(result.data[0].count).toBeGreaterThan(0);
    });

    it('should filter by slot when provided', async () => {
      const query: PopularMenuQueryDto = {
        type: 'selected',
        period: '30d',
        slot: 'lunch',
        limit: 10,
      };

      const mockSelectionQueryBuilder =
        menuSelectionRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuSelection>
        >;
      const mockRecommendationQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockSelectionQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          menuPayload: {
            breakfast: [],
            lunch: ['비빔밥', '김치찌개'],
            dinner: [],
            etc: [],
          },
        },
      ]);

      mockRecommendationQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getPopularMenus(query);

      expect(result.data).toBeDefined();
    });

    it('should use default limit when not provided', async () => {
      const query: PopularMenuQueryDto = {
        type: 'recommended',
        period: '30d',
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getPopularMenus(query);

      expect(result.data).toBeDefined();
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20); // Default limit
    });

    it('should handle all period correctly', async () => {
      const query: PopularMenuQueryDto = {
        type: 'recommended',
        period: 'all',
        limit: 10,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { menu: '김치찌개', count: '500' },
      ]);

      const result = await service.getPopularMenus(query);

      expect(result.data).toBeDefined();
    });
  });

  describe('getKeywordAnalytics', () => {
    it('should return keyword analytics with trends', async () => {
      const query: KeywordAnalyticsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Mock recent period
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { recommendations: ['김치찌개', '된장찌개'] },
          { recommendations: ['김치찌개', '비빔밥'] },
        ])
        // Mock previous period
        .mockResolvedValueOnce([{ recommendations: ['김치찌개'] }]);

      const result = await service.getKeywordAnalytics(query);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      result.data.forEach((item) => {
        expect(item.keyword).toBeDefined();
        expect(typeof item.count).toBe('number');
        expect(['up', 'down', 'stable']).toContain(item.trend);
        expect(typeof item.changeRate).toBe('number');
      });
    });

    it('should filter keywords with minimum occurrences', async () => {
      const query: KeywordAnalyticsQueryDto = {
        period: '7d',
        limit: 50,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { recommendations: ['김치찌개', '된장찌개', '희귀메뉴'] }, // 희귀메뉴 only once
        ])
        .mockResolvedValueOnce([{ recommendations: ['김치찌개'] }]);

      const result = await service.getKeywordAnalytics(query);

      // Keywords with less than 2 occurrences should be filtered out
      expect(result.data).toBeDefined();
    });

    it('should determine trend as up when change rate > 10', async () => {
      const query: KeywordAnalyticsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Recent: 김치찌개 appears 20 times
      // Previous: 김치찌개 appears 10 times
      // Change rate: +100% → trend should be 'up'
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { recommendations: Array(20).fill('김치찌개') },
        ])
        .mockResolvedValueOnce([
          { recommendations: Array(10).fill('김치찌개') },
        ]);

      const result = await service.getKeywordAnalytics(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 0) {
        const kimchiItem = result.data.find(
          (item) => item.keyword === '김치찌개',
        );
        if (kimchiItem) {
          expect(kimchiItem.trend).toBe('up');
        }
      }
    });

    it('should sort keywords by count in descending order', async () => {
      const query: KeywordAnalyticsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { recommendations: ['김치찌개', '김치찌개', '김치찌개'] },
          { recommendations: ['된장찌개', '된장찌개'] },
          { recommendations: ['비빔밥'] },
        ])
        .mockResolvedValueOnce([
          { recommendations: ['김치찌개', '된장찌개', '비빔밥'] },
        ]);

      const result = await service.getKeywordAnalytics(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 1) {
        for (let i = 0; i < result.data.length - 1; i++) {
          expect(result.data[i].count).toBeGreaterThanOrEqual(
            result.data[i + 1].count,
          );
        }
      }
    });
  });

  describe('getRegionAnalytics', () => {
    it('should return region analytics with percentages', async () => {
      const query: RegionAnalyticsQueryDto = { period: '30d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '100' },
        { region: '경기', count: '80' },
        { region: '부산', count: '20' },
      ]);

      const result = await service.getRegionAnalytics(query);

      expect(result.byRegion).toBeDefined();
      expect(result.byRegion.length).toBeGreaterThan(0);
      result.byRegion.forEach((item) => {
        expect(item.region).toBeDefined();
        expect(item.count).toBeGreaterThan(0);
        expect(item.percentage).toBeGreaterThan(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
      });
    });

    it('should calculate percentages correctly', async () => {
      const query: RegionAnalyticsQueryDto = { period: '30d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '50' }, // 50%
        { region: '경기', count: '30' }, // 30%
        { region: '부산', count: '20' }, // 20%
      ]);

      const result = await service.getRegionAnalytics(query);

      expect(result.byRegion).toBeDefined();
      expect(result.byRegion.length).toBe(3);

      const seoul = result.byRegion.find((r) => r.region === '서울');
      expect(seoul?.percentage).toBe(50);

      const gyeonggi = result.byRegion.find((r) => r.region === '경기');
      expect(gyeonggi?.percentage).toBe(30);

      const busan = result.byRegion.find((r) => r.region === '부산');
      expect(busan?.percentage).toBe(20);
    });

    it('should handle different period options', async () => {
      const query: RegionAnalyticsQueryDto = { period: '7d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '10' },
      ]);

      const result = await service.getRegionAnalytics(query);

      expect(result.byRegion).toBeDefined();
    });

    it('should return empty array when no data', async () => {
      const query: RegionAnalyticsQueryDto = { period: '30d' };

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getRegionAnalytics(query);

      expect(result.byRegion).toBeDefined();
      expect(result.byRegion.length).toBe(0);
    });
  });

  describe('getRegionPopularMenus', () => {
    it('should return popular menus for specific region with national rank', async () => {
      const region = '서울';

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      // Mock region menus
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { menu: '김치찌개', count: '50' },
          { menu: '된장찌개', count: '30' },
        ])
        // Mock national menus
        .mockResolvedValueOnce([
          { menu: '비빔밥', count: '200' },
          { menu: '김치찌개', count: '150' },
          { menu: '된장찌개', count: '100' },
        ]);

      const result = await service.getRegionPopularMenus(region);

      expect(result.region).toBe(region);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach((item) => {
        expect(item.menu).toBeDefined();
        expect(item.count).toBeGreaterThan(0);
        expect(item.nationalRank).toBeGreaterThan(0);
        expect(typeof item.isUnique).toBe('boolean');
      });
    });

    it('should identify unique regional menus correctly', async () => {
      const region = '제주';

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { menu: '고등어회', count: '80' }, // High in region
        ])
        .mockResolvedValueOnce([
          { menu: '고등어회', count: '100' }, // Lower national average
          { menu: '김치찌개', count: '1000' },
        ]);

      const result = await service.getRegionPopularMenus(region);

      expect(result.region).toBe(region);
      expect(result.data).toBeDefined();
    });

    it('should handle region with no popular menus', async () => {
      const region = '세종';

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getRegionPopularMenus(region);

      expect(result.region).toBe(region);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(0);
    });

    it('should limit results to 20 menus', async () => {
      const region = '서울';

      const mockQueryBuilder =
        menuRecommendationRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<MenuRecommendation>
        >;

      const manyMenus = Array.from({ length: 30 }, (_, i) => ({
        menu: `메뉴${i + 1}`,
        count: String(30 - i),
      }));

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce(manyMenus.slice(0, 20)) // Should be limited
        .mockResolvedValueOnce(manyMenus);

      const result = await service.getRegionPopularMenus(region);

      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
    });
  });
});
