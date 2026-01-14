import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  PlaceSearchLogService,
  CreatePlaceSearchLogData,
} from '../services/place-search-log.service';
import { PlaceSearchLog } from '../entities/place-search-log.entity';
import { createMockRepository } from '../../../../test/mocks/repository.mock';

describe('PlaceSearchLogService', () => {
  let service: PlaceSearchLogService;
  let placeSearchLogRepository: ReturnType<
    typeof createMockRepository<PlaceSearchLog>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    placeSearchLogRepository = createMockRepository<PlaceSearchLog>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceSearchLogService,
        {
          provide: getRepositoryToken(PlaceSearchLog),
          useValue: placeSearchLogRepository,
        },
      ],
    }).compile();

    service = module.get<PlaceSearchLogService>(PlaceSearchLogService);
  });

  it('should create service instance with all dependencies injected', () => {
    expect(service).toBeDefined();
  });

  describe('createLog', () => {
    it('should create a search log with all fields', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '강남역 김치찌개',
        latitude: 37.4979,
        longitude: 127.0276,
        region: '서울',
        resultCount: 15,
        searchType: 'places',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-123',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: data.searchType,
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(placeSearchLogRepository.create).toHaveBeenCalledWith({
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: data.searchType,
      });
      expect(placeSearchLogRepository.save).toHaveBeenCalledWith(createdLog);
      expect(result).toEqual(createdLog);
    });

    it('should create a search log with null userId for guest users', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: null,
        keyword: '홍대 파스타',
        latitude: 37.5563,
        longitude: 126.9246,
        region: '서울',
        resultCount: 20,
        searchType: 'places',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-456',
        userId: null,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: data.searchType,
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(placeSearchLogRepository.create).toHaveBeenCalledWith({
        userId: null,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: data.searchType,
      });
      expect(result.userId).toBeNull();
    });

    it('should create a search log with null region when not provided', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '불고기',
        latitude: 35.1796,
        longitude: 129.0756,
        region: null,
        resultCount: 10,
        searchType: 'places',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-789',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: null,
        resultCount: data.resultCount,
        searchType: data.searchType,
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(result.region).toBeNull();
    });

    it('should use default searchType as places when not provided', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '스테이크',
        latitude: 37.5665,
        longitude: 126.978,
        region: '서울',
        resultCount: 12,
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-101',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: 'places',
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(placeSearchLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'places',
        }),
      );
      expect(result.searchType).toBe('places');
    });

    it('should create a search log for blogs search type', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '맛집 추천',
        latitude: 37.5665,
        longitude: 126.978,
        region: '서울',
        resultCount: 50,
        searchType: 'blogs',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-202',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: 'blogs',
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(result.searchType).toBe('blogs');
    });

    it('should handle zero result count', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '희귀메뉴',
        latitude: 37.5665,
        longitude: 126.978,
        region: '서울',
        resultCount: 0,
        searchType: 'places',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-303',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: 0,
        searchType: data.searchType,
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(result.resultCount).toBe(0);
    });

    it('should handle decimal coordinates correctly', async () => {
      const data: CreatePlaceSearchLogData = {
        userId: 'user-123',
        keyword: '커피숍',
        latitude: 37.123456789,
        longitude: 127.987654321,
        region: '서울',
        resultCount: 25,
        searchType: 'places',
      };

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-404',
        userId: data.userId,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region,
        resultCount: data.resultCount,
        searchType: data.searchType,
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockReturnValue(
        createdLog as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLog as PlaceSearchLog,
      );

      const result = await service.createLog(data);

      expect(result.latitude).toBe(37.123456789);
      expect(result.longitude).toBe(127.987654321);
    });
  });

  describe('createLogs', () => {
    it('should create multiple search logs at once', async () => {
      const dataList: CreatePlaceSearchLogData[] = [
        {
          userId: 'user-123',
          keyword: '김치찌개',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 15,
          searchType: 'places',
        },
        {
          userId: 'user-456',
          keyword: '된장찌개',
          latitude: 37.4979,
          longitude: 127.0276,
          region: '경기',
          resultCount: 20,
          searchType: 'places',
        },
        {
          userId: null,
          keyword: '비빔밥',
          latitude: 35.1796,
          longitude: 129.0756,
          region: '부산',
          resultCount: 10,
          searchType: 'blogs',
        },
      ];

      const createdLogs: Partial<PlaceSearchLog>[] = dataList.map(
        (data, index) => ({
          id: `log-uuid-${index}`,
          userId: data.userId,
          keyword: data.keyword,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          resultCount: data.resultCount,
          searchType: data.searchType ?? 'places',
          createdAt: new Date(),
          deletedAt: null,
        }),
      );

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) => data as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLogs as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(placeSearchLogRepository.create).toHaveBeenCalledTimes(3);
      expect(placeSearchLogRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ keyword: '김치찌개' }),
          expect.objectContaining({ keyword: '된장찌개' }),
          expect.objectContaining({ keyword: '비빔밥' }),
        ]),
      );
      expect(result).toEqual(createdLogs);
    });

    it('should handle empty array input', async () => {
      const dataList: CreatePlaceSearchLogData[] = [];

      placeSearchLogRepository.save.mockResolvedValue(
        [] as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(placeSearchLogRepository.create).not.toHaveBeenCalled();
      expect(placeSearchLogRepository.save).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('should create logs with mixed userId values', async () => {
      const dataList: CreatePlaceSearchLogData[] = [
        {
          userId: 'user-123',
          keyword: '피자',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 30,
          searchType: 'places',
        },
        {
          userId: null,
          keyword: '치킨',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 40,
          searchType: 'places',
        },
      ];

      const createdLogs: Partial<PlaceSearchLog>[] = dataList.map(
        (data, index) => ({
          id: `log-uuid-${index}`,
          userId: data.userId,
          keyword: data.keyword,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          resultCount: data.resultCount,
          searchType: data.searchType ?? 'places',
          createdAt: new Date(),
          deletedAt: null,
        }),
      );

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) => data as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLogs as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(result[0].userId).toBe('user-123');
      expect(result[1].userId).toBeNull();
    });

    it('should create logs with mixed searchType values', async () => {
      const dataList: CreatePlaceSearchLogData[] = [
        {
          userId: 'user-123',
          keyword: '카페',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 25,
          searchType: 'places',
        },
        {
          userId: 'user-123',
          keyword: '카페 추천',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 100,
          searchType: 'blogs',
        },
      ];

      const createdLogs: Partial<PlaceSearchLog>[] = dataList.map(
        (data, index) => ({
          id: `log-uuid-${index}`,
          userId: data.userId,
          keyword: data.keyword,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          resultCount: data.resultCount,
          searchType: data.searchType ?? 'places',
          createdAt: new Date(),
          deletedAt: null,
        }),
      );

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) => data as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLogs as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(result[0].searchType).toBe('places');
      expect(result[1].searchType).toBe('blogs');
    });

    it('should apply default searchType to logs without explicit type', async () => {
      const dataList: CreatePlaceSearchLogData[] = [
        {
          userId: 'user-123',
          keyword: '햄버거',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 18,
        },
      ];

      const createdLog: Partial<PlaceSearchLog> = {
        id: 'log-uuid-100',
        userId: dataList[0].userId,
        keyword: dataList[0].keyword,
        latitude: dataList[0].latitude,
        longitude: dataList[0].longitude,
        region: dataList[0].region,
        resultCount: dataList[0].resultCount,
        searchType: 'places',
        createdAt: new Date(),
        deletedAt: null,
      };

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) =>
          ({
            ...data,
            searchType: data.searchType ?? 'places',
          }) as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue([
        createdLog,
      ] as unknown as PlaceSearchLog);

      const result = await service.createLogs(dataList);

      expect(result[0].searchType).toBe('places');
    });

    it('should create logs with various regions', async () => {
      const dataList: CreatePlaceSearchLogData[] = [
        {
          userId: 'user-123',
          keyword: '냉면',
          latitude: 37.5665,
          longitude: 126.978,
          region: '서울',
          resultCount: 20,
          searchType: 'places',
        },
        {
          userId: 'user-456',
          keyword: '냉면',
          latitude: 35.1796,
          longitude: 129.0756,
          region: '부산',
          resultCount: 15,
          searchType: 'places',
        },
        {
          userId: 'user-789',
          keyword: '냉면',
          latitude: 33.4996,
          longitude: 126.5312,
          region: '제주',
          resultCount: 10,
          searchType: 'places',
        },
      ];

      const createdLogs: Partial<PlaceSearchLog>[] = dataList.map(
        (data, index) => ({
          id: `log-uuid-${index}`,
          userId: data.userId,
          keyword: data.keyword,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          resultCount: data.resultCount,
          searchType: data.searchType ?? 'places',
          createdAt: new Date(),
          deletedAt: null,
        }),
      );

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) => data as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLogs as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(result[0].region).toBe('서울');
      expect(result[1].region).toBe('부산');
      expect(result[2].region).toBe('제주');
    });

    it('should handle large batch of logs efficiently', async () => {
      const dataList: CreatePlaceSearchLogData[] = Array.from(
        { length: 100 },
        (_, i) => ({
          userId: `user-${i}`,
          keyword: `메뉴-${i}`,
          latitude: 37.5665 + i * 0.001,
          longitude: 126.978 + i * 0.001,
          region: '서울',
          resultCount: i,
          searchType: 'places',
        }),
      );

      const createdLogs: Partial<PlaceSearchLog>[] = dataList.map(
        (data, index) => ({
          id: `log-uuid-${index}`,
          userId: data.userId,
          keyword: data.keyword,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          resultCount: data.resultCount,
          searchType: data.searchType ?? 'places',
          createdAt: new Date(),
          deletedAt: null,
        }),
      );

      placeSearchLogRepository.create.mockImplementation(
        (data: Partial<PlaceSearchLog>) => data as PlaceSearchLog,
      );
      placeSearchLogRepository.save.mockResolvedValue(
        createdLogs as unknown as PlaceSearchLog,
      );

      const result = await service.createLogs(dataList);

      expect(placeSearchLogRepository.create).toHaveBeenCalledTimes(100);
      expect(placeSearchLogRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(100);
    });
  });
});
