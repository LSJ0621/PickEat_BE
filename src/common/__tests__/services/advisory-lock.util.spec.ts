import { DataSource, QueryRunner } from 'typeorm';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';

describe('withAdvisoryLock', () => {
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    jest.useFakeTimers();

    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<QueryRunner>;

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('lock acquisition', () => {
    it('should execute fn and return result when lock is acquired', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fn = jest.fn().mockResolvedValue('result-value');

      const result = await withAdvisoryLock(mockDataSource, 'test-lock', fn);

      expect(result).toEqual({ acquired: true, result: 'result-value' });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.connect).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('should return acquired: false when lock is not acquired', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { pg_try_advisory_lock: false },
      ]);

      const fn = jest.fn();

      const result = await withAdvisoryLock(mockDataSource, 'test-lock', fn);

      expect(result).toEqual({ acquired: false });
      expect(fn).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout handling', () => {
    it('should return timedOut: true when fn execution exceeds timeoutMs', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fn = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('delayed-result'), 5000);
          }),
      );

      const options = { timeoutMs: 100 };
      const resultPromise = withAdvisoryLock(
        mockDataSource,
        'test-lock',
        fn,
        options,
      );

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ acquired: true, timedOut: true });
    });

    it('should return result when fn completes before timeout', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fn = jest.fn().mockResolvedValue('fast-result');

      const options = { timeoutMs: 5000 };
      const result = await withAdvisoryLock(
        mockDataSource,
        'test-lock',
        fn,
        options,
      );

      expect(result).toEqual({ acquired: true, result: 'fast-result' });
    });

    it('should rethrow non-timeout errors when timeoutMs is set', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const businessError = new Error('Business logic error');
      const fn = jest.fn().mockRejectedValue(businessError);

      const options = { timeoutMs: 5000 };

      await expect(
        withAdvisoryLock(mockDataSource, 'test-lock', fn, options),
      ).rejects.toThrow('Business logic error');
    });
  });

  describe('error propagation without timeout', () => {
    it('should rethrow errors thrown by fn when no timeout', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fnError = new Error('Function failed');
      const fn = jest.fn().mockRejectedValue(fnError);

      await expect(
        withAdvisoryLock(mockDataSource, 'test-lock', fn),
      ).rejects.toThrow('Function failed');

      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('finally block', () => {
    it('should always release the query runner and unlock even when fn fails', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fn = jest.fn().mockRejectedValue(new Error('Error in fn'));

      try {
        await withAdvisoryLock(mockDataSource, 'test-lock', fn);
      } catch {
        // expected
      }

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_unlock($1)',
        expect.any(Array),
      );
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('should always release the query runner when lock is not acquired', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { pg_try_advisory_lock: false },
      ]);

      const fn = jest.fn();

      await withAdvisoryLock(mockDataSource, 'test-lock', fn);

      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('different lock names', () => {
    it('should hash different lock names to consistent integer keys', async () => {
      // Each withAdvisoryLock call makes 2 query calls: pg_try_advisory_lock + pg_advisory_unlock
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }]) // first lock acquire
        .mockResolvedValueOnce(undefined) // first lock release
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }]) // second lock acquire
        .mockResolvedValueOnce(undefined); // second lock release

      const fn = jest.fn().mockResolvedValue('ok');

      await withAdvisoryLock(mockDataSource, 'lock-name-one', fn);
      await withAdvisoryLock(mockDataSource, 'lock-name-two', fn);

      const firstLockKey = (
        mockQueryRunner.query.mock.calls[0] as unknown[][]
      )[1][0];
      const secondLockKey = (
        mockQueryRunner.query.mock.calls[2] as unknown[][]
      )[1][0];

      expect(typeof firstLockKey).toBe('number');
      expect(typeof secondLockKey).toBe('number');
      expect(firstLockKey).not.toBe(secondLockKey);
    });

    it('should use non-negative integer as lock key', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce(undefined);

      const fn = jest.fn().mockResolvedValue('ok');

      await withAdvisoryLock(mockDataSource, 'any-lock-name', fn);

      const lockKey = (
        mockQueryRunner.query.mock.calls[0] as unknown[][]
      )[1][0];
      expect(lockKey).toBeGreaterThanOrEqual(0);
    });
  });
});
