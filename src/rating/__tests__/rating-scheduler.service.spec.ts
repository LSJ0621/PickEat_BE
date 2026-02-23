import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RatingSchedulerService } from '../services/rating-scheduler.service';
import { PlaceRating } from '../entities/place-rating.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../test/mocks/repository.mock';

describe('RatingSchedulerService', () => {
  let service: RatingSchedulerService;
  let placeRatingRepository: ReturnType<
    typeof createMockRepository<PlaceRating>
  >;
  let userPlaceRepository: ReturnType<typeof createMockRepository<UserPlace>>;
  let dataSource: jest.Mocked<DataSource>;
  let mockTransactionManager: jest.Mocked<DataSource['manager']>;
  let mockQueryRunner: jest.Mocked<ReturnType<DataSource['createQueryRunner']>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    placeRatingRepository = createMockRepository<PlaceRating>();
    userPlaceRepository = createMockRepository<UserPlace>();

    // Mock transaction manager
    mockTransactionManager = {
      createQueryBuilder: jest.fn(),
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource['manager']>;

    // Mock QueryRunner for advisory lock
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReturnType<DataSource['createQueryRunner']>>;

    // Mock DataSource with advisory lock and transaction support
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
      manager: mockTransactionManager,
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingSchedulerService,
        {
          provide: getRepositoryToken(PlaceRating),
          useValue: placeRatingRepository,
        },
        {
          provide: getRepositoryToken(UserPlace),
          useValue: userPlaceRepository,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<RatingSchedulerService>(RatingSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateUserPlaceAggregates', () => {
    it('should skip update when lock is not acquired', async () => {
      // Mock advisory lock to return not acquired
      mockQueryRunner.query.mockResolvedValueOnce([
        { pg_try_advisory_lock: false },
      ]);

      const loggerWarnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'User place aggregate update: Another instance is already running.',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });

    it('should execute aggregate update when lock is acquired', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_1',
          avgRating: '4.5',
          ratingCount: '10',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      // Mock advisory lock (acquired=true) and unlock
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }]) // lock acquired
        .mockResolvedValueOnce(undefined); // unlock
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'pr.rating IS NOT NULL',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'pr.skipped = false',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "pr.placeId LIKE 'user_place_%'",
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'User place aggregate update complete: 1 places updated',
      );

      loggerLogSpy.mockRestore();
    });

    it('should skip when no rated user places found', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'No rated user places found. Skipping.',
      );
      expect(mockTransactionManager.query).not.toHaveBeenCalled();

      loggerLogSpy.mockRestore();
    });

    it('should filter out invalid user place IDs', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_123',
          avgRating: '4.5',
          ratingCount: '10',
        },
        {
          placeId: 'google_place_abc',
          avgRating: '3.0',
          ratingCount: '5',
        },
        {
          placeId: 'user_place_invalid',
          avgRating: '5.0',
          ratingCount: '2',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(mockTransactionManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_place'),
        expect.any(Array),
      );

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('WHERE id IN ($5)');
      expect(params).toEqual([123, 4.5, 123, 10, 123]);

      loggerLogSpy.mockRestore();
    });

    it('should round avgRating to one decimal place', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_1',
          avgRating: '4.567',
          ratingCount: '10',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('WHEN $1 THEN $2');
      expect(params).toEqual(expect.arrayContaining([1, 4.6]));
    });

    it('should handle multiple user places in bulk update', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_1',
          avgRating: '4.5',
          ratingCount: '10',
        },
        {
          placeId: 'user_place_2',
          avgRating: '3.8',
          ratingCount: '5',
        },
        {
          placeId: 'user_place_3',
          avgRating: '5.0',
          ratingCount: '20',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'User place aggregate update complete: 3 places updated',
      );

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('WHERE id IN ($13,$14,$15)');
      expect(queryCall).toContain('WHEN $1 THEN $2');
      expect(queryCall).toContain('WHEN $3 THEN $4');
      expect(queryCall).toContain('WHEN $5 THEN $6');
      // Parameters: [id1, avgRating1, id2, avgRating2, id3, avgRating3, id1, ratingCount1, id2, ratingCount2, id3, ratingCount3, id1, id2, id3]
      expect(params).toEqual([
        1, 4.5, 2, 3.8, 3, 5.0, 1, 10, 2, 5, 3, 20, 1, 2, 3,
      ]);

      loggerLogSpy.mockRestore();
    });

    it('should use CASE expressions for bulk update', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_100',
          avgRating: '4.3',
          ratingCount: '7',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('average_rating = CASE id');
      expect(queryCall).toContain('rating_count = CASE id');
      expect(queryCall).toContain('WHEN $1 THEN $2 END');
      expect(params).toEqual(expect.arrayContaining([100, 4.3, 7]));
    });

    it('should group by placeId in query', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('pr.placeId');
    });

    it('should select AVG and COUNT in query', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'pr.placeId',
        'placeId',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'AVG(pr.rating)',
        'avgRating',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'COUNT(pr.rating)',
        'ratingCount',
      );
    });

    it('should log error when transaction fails', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockRejectedValue(
        new Error('Database error'),
      );
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'User place aggregate update failed: Database error',
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockRejectedValue('String error');
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'User place aggregate update failed: String error',
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it('should skip when all placeIds are invalid', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'invalid_format',
          avgRating: '4.0',
          ratingCount: '5',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'No valid user place IDs to update. Skipping.',
      );
      expect(mockTransactionManager.query).not.toHaveBeenCalled();

      loggerLogSpy.mockRestore();
    });

    it('should parse integer ratingCount correctly', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_1',
          avgRating: '4.5',
          ratingCount: '123',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('WHEN $1 THEN $2');
      expect(params).toEqual(expect.arrayContaining([1, 123]));
    });

    it('should not throw error when transaction succeeds', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await expect(service.updateUserPlaceAggregates()).resolves.not.toThrow();
    });

    it('should log starting message', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      const loggerLogSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.updateUserPlaceAggregates();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Starting user_place aggregate update...',
      );

      loggerLogSpy.mockRestore();
    });

    it('should filter out ratings with skipped=true', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'pr.skipped = false',
      );
    });

    it('should use PlaceRating entity in query builder', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      expect(mockTransactionManager.createQueryBuilder).toHaveBeenCalledWith(
        PlaceRating,
        'pr',
      );
    });

    it('should handle decimal avgRating values correctly', async () => {
      const mockQueryBuilder = createMockQueryBuilder<PlaceRating>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          placeId: 'user_place_1',
          avgRating: '3.14159',
          ratingCount: '10',
        },
      ]);
      mockTransactionManager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionManager.query.mockResolvedValue(undefined);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (runInTransaction: unknown) => {
          if (typeof runInTransaction === 'function') {
            return await runInTransaction(mockTransactionManager);
          }
          return undefined;
        },
      );

      await service.updateUserPlaceAggregates();

      const queryCall = mockTransactionManager.query.mock.calls[0][0];
      const params = mockTransactionManager.query.mock.calls[0][1];
      expect(queryCall).toContain('WHEN $1 THEN $2');
      expect(params).toEqual(expect.arrayContaining([1, 3.1]));
    });
  });
});
