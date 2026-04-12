import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronJob } from 'cron';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { PreferencesBatchResultScheduler } from '../schedulers/preferences-batch-result.scheduler';
import { BatchJobService } from '../services/batch-job.service';
import { PreferenceBatchService } from '../services/preference-batch.service';
import { BatchJobStatus } from '../types/preference-batch.types';

jest.mock('@/common/utils/advisory-lock.util');

const mockWithAdvisoryLock = jest.mocked(withAdvisoryLock);

describe('PreferencesBatchResultScheduler', () => {
  let scheduler: PreferencesBatchResultScheduler;

  const mockBatchJobService = {
    findIncomplete: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockPreferenceBatchService = {
    processResults: jest.fn(),
    processErrors: jest.fn(),
  };

  const mockOpenAiBatchClient = {
    isReady: jest.fn(),
    getBatchStatus: jest.fn(),
    downloadResults: jest.fn(),
    downloadErrors: jest.fn(),
  };

  const mockMenuSelectionRepository = {
    find: jest.fn(),
    update: jest.fn(),
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

  // Helper: inject withAdvisoryLock to run the callback immediately
  const runWithLockAcquired = () => {
    mockWithAdvisoryLock.mockImplementation(async (_ds, _name, fn) => ({
      acquired: true,
      timedOut: false,
      result: await fn(),
    }));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('0 0 31 2 *');
    jest.spyOn(CronJob.prototype, 'start').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesBatchResultScheduler,
        { provide: BatchJobService, useValue: mockBatchJobService },
        { provide: PreferenceBatchService, useValue: mockPreferenceBatchService },
        { provide: OpenAiBatchClient, useValue: mockOpenAiBatchClient },
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        { provide: DataSource, useValue: {} },
        { provide: SchedulerAlertService, useValue: mockSchedulerAlertService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    scheduler = module.get(PreferencesBatchResultScheduler);
    jest
      .spyOn(
        (scheduler as unknown as { logger: { error: jest.Mock; warn: jest.Mock; log: jest.Mock } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);
    jest
      .spyOn(
        (scheduler as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    jest
      .spyOn(
        (scheduler as unknown as { logger: { log: jest.Mock } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);
  });

  describe('pollAndProcessResults — advisory lock / isReady', () => {
    it('advisory lock을 획득하지 못하면 내부 로직을 실행하지 않는다', async () => {
      mockWithAdvisoryLock.mockResolvedValue({
        acquired: false,
        timedOut: false,
      });

      await scheduler.pollAndProcessResults();

      expect(mockOpenAiBatchClient.isReady).not.toHaveBeenCalled();
      expect(mockBatchJobService.findIncomplete).not.toHaveBeenCalled();
    });

    it('timedOut=true면 error 로그를 남긴다', async () => {
      mockWithAdvisoryLock.mockResolvedValue({
        acquired: false,
        timedOut: true,
      });
      const errorSpy = jest.spyOn(
        (scheduler as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      await scheduler.pollAndProcessResults();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    });

    it('openAiBatchClient.isReady()가 false면 findIncomplete를 호출하지 않는다', async () => {
      runWithLockAcquired();
      mockOpenAiBatchClient.isReady.mockReturnValue(false);

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.findIncomplete).not.toHaveBeenCalled();
    });
  });

  describe('pollAndProcessResults — 배치 상태 분기', () => {
    beforeEach(() => {
      runWithLockAcquired();
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
    });

    it('findIncomplete 결과가 빈 배열이면 processSingleBatch를 호출하지 않는다', async () => {
      mockBatchJobService.findIncomplete.mockResolvedValue([]);

      await scheduler.pollAndProcessResults();

      expect(mockOpenAiBatchClient.getBatchStatus).not.toHaveBeenCalled();
    });

    it('openAiBatchId가 없는 batchJob은 skip된다', async () => {
      mockBatchJobService.findIncomplete.mockResolvedValue([
        { id: 1, openAiBatchId: null },
      ]);

      await scheduler.pollAndProcessResults();

      expect(mockOpenAiBatchClient.getBatchStatus).not.toHaveBeenCalled();
    });

    it('상위 catch 예외 시 alertFailure를 호출한다', async () => {
      mockBatchJobService.findIncomplete.mockRejectedValue(
        new Error('db down'),
      );

      await scheduler.pollAndProcessResults();

      expect(mockSchedulerAlertService.alertFailure).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
      );
    });
  });

  describe('processSingleBatch — 상태 분기', () => {
    beforeEach(() => {
      runWithLockAcquired();
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockResolvedValue([
        { id: 1, openAiBatchId: 'batch_abc' },
      ]);
    });

    it('status=completed이면 updateStatus 호출 후 handleCompletedBatch를 실행한다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        progress: { completed: 5, total: 5, failed: 0 },
        outputFileId: 'file_out',
        errorFileId: undefined,
      });
      mockBatchJobService.findById.mockResolvedValue({ id: 1 });
      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map(),
        errors: [],
      });
      mockPreferenceBatchService.processResults.mockResolvedValue(undefined);

      await scheduler.pollAndProcessResults();

      // First updateStatus call = progress update with PROCESSING-ish or COMPLETED
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.COMPLETED,
        expect.objectContaining({
          completedRequests: 5,
          failedRequests: 0,
        }),
      );
      expect(mockOpenAiBatchClient.downloadResults).toHaveBeenCalledWith('file_out');
      expect(mockPreferenceBatchService.processResults).toHaveBeenCalled();
      // Final COMPLETED update
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.COMPLETED,
        expect.objectContaining({ outputFileId: 'file_out' }),
      );
    });

    it('status=failed이면 handleFailedBatch (FAILED + errorMessage)을 호출한다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'failed',
        progress: { completed: 0, total: 10, failed: 10 },
      });

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'OpenAI batch failed' }),
      );
    });

    it('status=expired이면 EXPIRED 상태로 전이한다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'expired',
        progress: { completed: 0, total: 10, failed: 10 },
      });

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.EXPIRED,
        expect.objectContaining({ errorMessage: 'OpenAI batch expired' }),
      );
    });

    it('status=in_progress이면 mapStatus로 PROCESSING 전이만 수행한다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'in_progress',
        progress: { completed: 2, total: 10, failed: 0 },
      });

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.PROCESSING,
        expect.objectContaining({ completedRequests: 2 }),
      );
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledTimes(1);
      expect(mockOpenAiBatchClient.downloadResults).not.toHaveBeenCalled();
    });

    it('getBatchStatus 예외 시 에러 로그만 남기고 다음 배치로 계속된다', async () => {
      mockBatchJobService.findIncomplete.mockResolvedValue([
        { id: 1, openAiBatchId: 'batch_a' },
        { id: 2, openAiBatchId: 'batch_b' },
      ]);
      mockOpenAiBatchClient.getBatchStatus
        .mockRejectedValueOnce(new Error('net err'))
        .mockResolvedValueOnce({
          status: 'in_progress',
          progress: { completed: 1, total: 5, failed: 0 },
        });

      await scheduler.pollAndProcessResults();

      expect(mockOpenAiBatchClient.getBatchStatus).toHaveBeenCalledTimes(2);
      // alertFailure는 상위 catch에서만, 개별 실패 시는 호출 안 됨
      expect(mockSchedulerAlertService.alertFailure).not.toHaveBeenCalled();
    });
  });

  describe('handleCompletedBatch', () => {
    beforeEach(() => {
      runWithLockAcquired();
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockResolvedValue([
        { id: 1, openAiBatchId: 'batch_abc' },
      ]);
      mockBatchJobService.findById.mockResolvedValue({ id: 1 });
    });

    it('downloadResults에 errors가 있으면 handleDownloadErrors로 processErrors가 호출된다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        progress: { completed: 1, total: 1, failed: 0 },
        outputFileId: 'file_out',
      });
      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map(),
        errors: [{ customId: 'pref_1_10', reason: 'null_content' }],
      });

      await scheduler.pollAndProcessResults();

      expect(mockPreferenceBatchService.processErrors).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            customId: 'pref_1_10',
            code: 'null_content',
          }),
        ],
        expect.any(Object),
      );
    });

    it('processResults 예외 시 handleBatchProcessingFailure가 BatchJob을 FAILED로 전이하고 Selection을 리셋한다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        progress: { completed: 1, total: 1, failed: 0 },
        outputFileId: 'file_out',
      });
      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map(),
        errors: [],
      });
      mockPreferenceBatchService.processResults.mockRejectedValue(
        new Error('process fail'),
      );
      mockMenuSelectionRepository.find.mockResolvedValue([{ id: 5 }]);

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'process fail' }),
      );
      expect(mockMenuSelectionRepository.update).toHaveBeenCalled();
    });

    it('errorFileId가 있으면 downloadErrors → processErrors → updateStatus(COMPLETED)', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        progress: { completed: 0, total: 1, failed: 1 },
        errorFileId: 'file_err',
      });
      const errs = [{ customId: 'pref_1_10', code: 'E', message: 'm' }];
      mockOpenAiBatchClient.downloadErrors.mockResolvedValue(errs);

      await scheduler.pollAndProcessResults();

      expect(mockOpenAiBatchClient.downloadErrors).toHaveBeenCalledWith(
        'file_err',
      );
      expect(mockPreferenceBatchService.processErrors).toHaveBeenCalledWith(
        errs,
        expect.any(Object),
      );
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.COMPLETED,
        expect.objectContaining({ errorFileId: 'file_err' }),
      );
    });

    it('errorFileId 경로 예외 시 handleBatchProcessingFailure가 호출된다', async () => {
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        progress: { completed: 0, total: 1, failed: 1 },
        errorFileId: 'file_err',
      });
      mockOpenAiBatchClient.downloadErrors.mockRejectedValue(
        new Error('download err fail'),
      );
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      await scheduler.pollAndProcessResults();

      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'download err fail' }),
      );
    });
  });

  describe('mapStatus', () => {
    it('cancelling/cancelled는 FAILED, 기본값은 PROCESSING으로 매핑된다', () => {
      const map = (s: unknown) =>
        (
          scheduler as unknown as {
            mapStatus: (v: unknown) => BatchJobStatus;
          }
        ).mapStatus(s);

      expect(map('cancelling')).toBe(BatchJobStatus.FAILED);
      expect(map('cancelled')).toBe(BatchJobStatus.FAILED);
      expect(map('unknown_weird')).toBe(BatchJobStatus.PROCESSING);
      expect(map('validating')).toBe(BatchJobStatus.PROCESSING);
      expect(map('finalizing')).toBe(BatchJobStatus.PROCESSING);
      expect(map('completed')).toBe(BatchJobStatus.COMPLETED);
    });
  });
});
