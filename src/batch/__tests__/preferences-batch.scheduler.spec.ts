import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronJob } from 'cron';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';
import { PreferencesBatchScheduler } from '../schedulers/preferences-batch.scheduler';
import { PreferencesRetryBatchScheduler } from '../schedulers/preferences-retry-batch.scheduler';
import { PreferenceBatchService } from '../services/preference-batch.service';
import { BatchJobStatus } from '../types/preference-batch.types';
import { MenuSelection, MenuSelectionStatus } from '@/menu/entities/menu-selection.entity';

jest.mock('@/common/utils/advisory-lock.util');

const mockWithAdvisoryLock = jest.mocked(withAdvisoryLock);

// ─── PreferencesBatchScheduler ────────────────────────────────────────────────

describe('PreferencesBatchScheduler', () => {
  let scheduler: PreferencesBatchScheduler;

  const mockPreferenceBatchService = {
    submitBatch: jest.fn(),
  };

  const mockSchedulerAlertService = {
    alertFailure: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('0 0 31 2 *'), // Never-firing cron
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockConfigService.get.mockReturnValue('0 0 31 2 *');
    jest.spyOn(CronJob.prototype, 'start').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesBatchScheduler,
        { provide: PreferenceBatchService, useValue: mockPreferenceBatchService },
        { provide: DataSource, useValue: {} },
        { provide: SchedulerAlertService, useValue: mockSchedulerAlertService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    scheduler = module.get<PreferencesBatchScheduler>(PreferencesBatchScheduler);
  });

  describe('submitDailyBatch', () => {
    it('should call submitBatch when advisory lock is successfully acquired', async () => {
      mockWithAdvisoryLock.mockImplementation(async (_ds, _name, fn) => ({
        acquired: true,
        result: await fn(),
      }));
      mockPreferenceBatchService.submitBatch.mockResolvedValue({
        id: 1,
        totalRequests: 10,
        openAiBatchId: 'batch_abc123',
      });

      await scheduler.submitDailyBatch();

      expect(mockPreferenceBatchService.submitBatch).toHaveBeenCalledTimes(1);
    });

    it('should NOT call submitBatch when advisory lock is already held by another instance', async () => {
      mockWithAdvisoryLock.mockResolvedValue({ acquired: false });

      await scheduler.submitDailyBatch();

      expect(mockPreferenceBatchService.submitBatch).not.toHaveBeenCalled();
    });

    it('should call schedulerAlertService.alertFailure with the error when submitBatch throws', async () => {
      const batchError = new Error('OpenAI API unavailable');
      mockWithAdvisoryLock.mockImplementation(async (_ds, _name, fn) => ({
        acquired: true,
        result: await fn(),
      }));
      mockPreferenceBatchService.submitBatch.mockRejectedValue(batchError);
      mockSchedulerAlertService.alertFailure.mockResolvedValue(undefined);

      await scheduler.submitDailyBatch();

      expect(mockSchedulerAlertService.alertFailure).toHaveBeenCalledWith(
        expect.any(String),
        batchError,
      );
    });
  });
});

// ─── PreferencesRetryBatchScheduler (배치 실패 시 재시도 로직) ──────────────────

describe('PreferencesRetryBatchScheduler — handleExpiredBatchProcessingItems', () => {
  let scheduler: PreferencesRetryBatchScheduler;

  const mockMenuSelectionRepository = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  };

  const mockPreferenceBatchService = {
    submitRetryBatch: jest.fn(),
  };

  const mockSchedulerAlertService = {
    alertFailure: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('0 0 31 2 *'),
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockConfigService.get.mockReturnValue('0 0 31 2 *');
    jest.spyOn(CronJob.prototype, 'start').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesRetryBatchScheduler,
        { provide: PreferenceBatchService, useValue: mockPreferenceBatchService },
        { provide: getRepositoryToken(MenuSelection), useValue: mockMenuSelectionRepository },
        { provide: DataSource, useValue: {} },
        { provide: SchedulerAlertService, useValue: mockSchedulerAlertService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    scheduler = module.get<PreferencesRetryBatchScheduler>(PreferencesRetryBatchScheduler);
  });

  it('should reset expired BATCH_PROCESSING items with failed batch jobs to FAILED status', async () => {
    const expiredItem = {
      id: 7,
      status: MenuSelectionStatus.BATCH_PROCESSING,
      batchJob: { id: 3, status: BatchJobStatus.FAILED },
    };

    const mockQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([expiredItem]),
    };

    mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(mockQb);
    mockMenuSelectionRepository.update.mockResolvedValue(undefined);

    // Access private method via type cast
    await (
      scheduler as unknown as {
        handleExpiredBatchProcessingItems(): Promise<void>;
      }
    ).handleExpiredBatchProcessingItems();

    expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
      [expiredItem.id],
      expect.objectContaining({ status: MenuSelectionStatus.FAILED }),
    );
  });

  it('should call alertFailure when submitRetryBatch throws an error', async () => {
    const retryError = new Error('OpenAI retry batch failed');
    mockWithAdvisoryLock.mockImplementation(async (_ds, _name, fn) => ({
      acquired: true,
      result: await fn(),
    }));

    // handleExpiredBatchProcessingItems returns no expired items
    const mockQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(mockQb);

    // submitRetryBatch fails
    mockPreferenceBatchService.submitRetryBatch.mockRejectedValue(retryError);
    mockSchedulerAlertService.alertFailure.mockResolvedValue(undefined);

    await scheduler.submitRetryBatch();

    expect(mockSchedulerAlertService.alertFailure).toHaveBeenCalledWith(
      expect.any(String),
      retryError,
    );
  });
});
