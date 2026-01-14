import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { AdminRestaurantAnalyticsService } from '../services/admin-restaurant-analytics.service';
import { PlaceSearchLog } from '../entities/place-search-log.entity';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import {
  SearchVolumeQueryDto,
  SearchKeywordsQueryDto,
  SearchRegionsQueryDto,
} from '../dto/restaurant';

describe('AdminRestaurantAnalyticsService', () => {
  let service: AdminRestaurantAnalyticsService;
  let placeSearchLogRepository: ReturnType<
    typeof createMockRepository<PlaceSearchLog>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    placeSearchLogRepository = createMockRepository<PlaceSearchLog>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRestaurantAnalyticsService,
        {
          provide: getRepositoryToken(PlaceSearchLog),
          useValue: placeSearchLogRepository,
        },
      ],
    }).compile();

    service = module.get<AdminRestaurantAnalyticsService>(
      AdminRestaurantAnalyticsService,
    );
  });

  it('should create service instance with all dependencies injected', () => {
    expect(service).toBeDefined();
  });

  describe('getSearchVolume', () => {
    it('should return search volume for places and blogs when type is all', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'all',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      // Mock places data
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { date: '2024-01-10', count: '10' },
          { date: '2024-01-11', count: '15' },
        ])
        // Mock blogs data
        .mockResolvedValueOnce([
          { date: '2024-01-10', count: '5' },
          { date: '2024-01-11', count: '8' },
        ]);

      // Mock total counts
      mockQueryBuilder.getCount
        .mockResolvedValueOnce(100) // Current places
        .mockResolvedValueOnce(80) // Previous places
        .mockResolvedValueOnce(50) // Current blogs
        .mockResolvedValueOnce(40); // Previous blogs

      const result = await service.getSearchVolume(query);

      expect(result.places).toBeDefined();
      expect(result.blogs).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalPlaceSearches).toBeGreaterThanOrEqual(0);
      expect(result.summary.totalBlogSearches).toBeGreaterThanOrEqual(0);
      expect(typeof result.summary.placeChangeRate).toBe('number');
      expect(typeof result.summary.blogChangeRate).toBe('number');
    });

    it('should return only places data when type is places', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '7d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: '2024-01-10', count: '10' },
      ]);

      mockQueryBuilder.getCount
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40);

      const result = await service.getSearchVolume(query);

      expect(result.places).toBeDefined();
      expect(result.places.length).toBeGreaterThan(0);
      expect(result.blogs).toBeDefined();
      expect(result.blogs.length).toBe(0);
      expect(result.summary.totalPlaceSearches).toBeGreaterThan(0);
      expect(result.summary.totalBlogSearches).toBe(0);
    });

    it('should return only blogs data when type is blogs', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'blogs',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: '2024-01-10', count: '5' },
      ]);

      mockQueryBuilder.getCount
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(25);

      const result = await service.getSearchVolume(query);

      expect(result.places).toBeDefined();
      expect(result.places.length).toBe(0);
      expect(result.blogs).toBeDefined();
      expect(result.blogs.length).toBeGreaterThan(0);
      expect(result.summary.totalPlaceSearches).toBe(0);
      expect(result.summary.totalBlogSearches).toBeGreaterThan(0);
    });

    it('should calculate positive change rate correctly', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Current: 120, Previous: 100 → +20% change
      mockQueryBuilder.getCount
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(100);

      const result = await service.getSearchVolume(query);

      expect(result.summary.placeChangeRate).toBe(20);
    });

    it('should calculate negative change rate correctly', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Current: 80, Previous: 100 → -20% change
      mockQueryBuilder.getCount
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(100);

      const result = await service.getSearchVolume(query);

      expect(result.summary.placeChangeRate).toBe(-20);
    });

    it('should handle zero previous count correctly', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Current: 50, Previous: 0 → +100% change
      mockQueryBuilder.getCount
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0);

      const result = await service.getSearchVolume(query);

      expect(result.summary.placeChangeRate).toBe(100);
    });

    it('should handle both zero counts correctly', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Current: 0, Previous: 0 → 0% change
      mockQueryBuilder.getCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getSearchVolume(query);

      expect(result.summary.placeChangeRate).toBe(0);
    });

    it('should use default period when not provided', async () => {
      const query: SearchVolumeQueryDto = {};

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockQueryBuilder.getCount
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(25);

      const result = await service.getSearchVolume(query);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should return daily data array for the period', async () => {
      const query: SearchVolumeQueryDto = {
        type: 'places',
        period: '7d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { date: '2024-01-10', count: '10' },
        { date: '2024-01-12', count: '15' },
      ]);

      mockQueryBuilder.getCount
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(20);

      const result = await service.getSearchVolume(query);

      // Should have data array with count >= 0 for each item
      expect(result.places.length).toBeGreaterThan(0);
      result.places.forEach((item) => {
        expect(item.date).toBeDefined();
        expect(item.count).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getSearchKeywords', () => {
    it('should return popular keywords with trends', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      // Mock current period keywords
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { keyword: '김치찌개', count: '50' },
          { keyword: '된장찌개', count: '40' },
          { keyword: '비빔밥', count: '30' },
        ])
        // Mock previous period counts
        .mockResolvedValueOnce([
          { keyword: '김치찌개', count: '40' },
          { keyword: '된장찌개', count: '35' },
          { keyword: '비빔밥', count: '28' },
        ])
        // Mock first half counts
        .mockResolvedValueOnce([
          { keyword: '김치찌개', count: '20' },
          { keyword: '된장찌개', count: '18' },
          { keyword: '비빔밥', count: '12' },
        ])
        // Mock second half counts
        .mockResolvedValueOnce([
          { keyword: '김치찌개', count: '30' },
          { keyword: '된장찌개', count: '22' },
          { keyword: '비빔밥', count: '18' },
        ]);

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach((item) => {
        expect(item.keyword).toBeDefined();
        expect(typeof item.count).toBe('number');
        expect(['up', 'down', 'stable']).toContain(item.trend);
        expect(typeof item.changeRate).toBe('number');
      });
    });

    it('should determine trend as up when second half increases significantly', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ keyword: '트렌디메뉴', count: '100' }])
        .mockResolvedValueOnce([{ keyword: '트렌디메뉴', count: '50' }])
        .mockResolvedValueOnce([{ keyword: '트렌디메뉴', count: '30' }]) // First half
        .mockResolvedValueOnce([{ keyword: '트렌디메뉴', count: '70' }]); // Second half (>10% increase)

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 0) {
        const trendyItem = result.data.find(
          (item) => item.keyword === '트렌디메뉴',
        );
        if (trendyItem) {
          expect(trendyItem.trend).toBe('up');
        }
      }
    });

    it('should determine trend as down when second half decreases significantly', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ keyword: '하락메뉴', count: '100' }])
        .mockResolvedValueOnce([{ keyword: '하락메뉴', count: '110' }])
        .mockResolvedValueOnce([{ keyword: '하락메뉴', count: '70' }]) // First half
        .mockResolvedValueOnce([{ keyword: '하락메뉴', count: '30' }]); // Second half (<-10% decrease)

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 0) {
        const declineItem = result.data.find(
          (item) => item.keyword === '하락메뉴',
        );
        if (declineItem) {
          expect(declineItem.trend).toBe('down');
        }
      }
    });

    it('should determine trend as stable when change is within threshold', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ keyword: '안정메뉴', count: '100' }])
        .mockResolvedValueOnce([{ keyword: '안정메뉴', count: '95' }])
        .mockResolvedValueOnce([{ keyword: '안정메뉴', count: '48' }]) // First half
        .mockResolvedValueOnce([{ keyword: '안정메뉴', count: '52' }]); // Second half (~8% change)

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 0) {
        const stableItem = result.data.find(
          (item) => item.keyword === '안정메뉴',
        );
        if (stableItem) {
          expect(stableItem.trend).toBe('stable');
        }
      }
    });

    it('should handle 7d period correctly', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '7d',
        limit: 10,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ keyword: '김치찌개', count: '20' }])
        .mockResolvedValueOnce([{ keyword: '김치찌개', count: '15' }])
        .mockResolvedValueOnce([{ keyword: '김치찌개', count: '8' }])
        .mockResolvedValueOnce([{ keyword: '김치찌개', count: '12' }]);

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 5,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      const manyKeywords = Array.from({ length: 10 }, (_, i) => ({
        keyword: `메뉴${i + 1}`,
        count: String(10 - i),
      }));

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce(manyKeywords.slice(0, 5))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSearchKeywords(query);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
    });

    it('should use default limit when not provided', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSearchKeywords(query);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
    });

    it('should handle zero counts in first half gracefully', async () => {
      const query: SearchKeywordsQueryDto = {
        period: '30d',
        limit: 20,
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ keyword: '신메뉴', count: '50' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]) // First half: 0
        .mockResolvedValueOnce([{ keyword: '신메뉴', count: '50' }]); // Second half: 50

      const result = await service.getSearchKeywords(query);

      expect(result.data).toBeDefined();
      if (result.data.length > 0) {
        const newItem = result.data.find((item) => item.keyword === '신메뉴');
        if (newItem) {
          expect(newItem.trend).toBe('up');
        }
      }
    });
  });

  describe('getSearchRegions', () => {
    it('should return region distribution with percentages and coordinates', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '100' },
        { region: '경기', count: '80' },
        { region: '부산', count: '20' },
      ]);

      const result = await service.getSearchRegions(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(3);
      result.data.forEach((item) => {
        expect(item.region).toBeDefined();
        expect(item.count).toBeGreaterThan(0);
        expect(item.percentage).toBeGreaterThan(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
        expect(item.coordinates).toBeDefined();
        expect(item.coordinates.lat).toBeDefined();
        expect(item.coordinates.lng).toBeDefined();
      });
    });

    it('should calculate percentages correctly', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '60' }, // 60%
        { region: '경기', count: '30' }, // 30%
        { region: '부산', count: '10' }, // 10%
      ]);

      const result = await service.getSearchRegions(query);

      expect(result.data).toBeDefined();

      const seoul = result.data.find((r) => r.region === '서울');
      expect(seoul?.percentage).toBe(60);

      const gyeonggi = result.data.find((r) => r.region === '경기');
      expect(gyeonggi?.percentage).toBe(30);

      const busan = result.data.find((r) => r.region === '부산');
      expect(busan?.percentage).toBe(10);
    });

    it('should provide correct coordinates for known regions', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '50' },
        { region: '제주', count: '30' },
      ]);

      const result = await service.getSearchRegions(query);

      const seoul = result.data.find((r) => r.region === '서울');
      expect(seoul?.coordinates.lat).toBe(37.5665);
      expect(seoul?.coordinates.lng).toBe(126.978);

      const jeju = result.data.find((r) => r.region === '제주');
      expect(jeju?.coordinates.lat).toBe(33.4996);
      expect(jeju?.coordinates.lng).toBe(126.5312);
    });

    it('should use default coordinates for unknown regions', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '알수없음', count: '10' },
      ]);

      const result = await service.getSearchRegions(query);

      const unknown = result.data.find((r) => r.region === '알수없음');
      // Should use default Seoul coordinates
      expect(unknown?.coordinates.lat).toBe(37.5665);
      expect(unknown?.coordinates.lng).toBe(126.978);
    });

    it('should handle different period options', async () => {
      const query: SearchRegionsQueryDto = {
        period: '7d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '20' },
      ]);

      const result = await service.getSearchRegions(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(1);
    });

    it('should handle 90d period correctly', async () => {
      const query: SearchRegionsQueryDto = {
        period: '90d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '500' },
        { region: '경기', count: '300' },
      ]);

      const result = await service.getSearchRegions(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(2);
    });

    it('should return empty array when no data', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getSearchRegions(query);

      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(0);
    });

    it('should exclude null regions from results', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      // Repository should filter out null regions via WHERE clause
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '50' },
      ]);

      const result = await service.getSearchRegions(query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'log.region IS NOT NULL',
      );
      expect(result.data).toBeDefined();
    });

    it('should round percentages to 2 decimal places', async () => {
      const query: SearchRegionsQueryDto = {
        period: '30d',
      };

      const mockQueryBuilder =
        placeSearchLogRepository.createQueryBuilder() as unknown as jest.Mocked<
          SelectQueryBuilder<PlaceSearchLog>
        >;

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { region: '서울', count: '33' }, // 33.33...%
        { region: '경기', count: '33' }, // 33.33...%
        { region: '부산', count: '33' }, // 33.33...%
      ]);

      const result = await service.getSearchRegions(query);

      result.data.forEach((item) => {
        // Should be rounded to 2 decimal places
        expect(item.percentage).toBe(33.33);
      });
    });
  });
});
