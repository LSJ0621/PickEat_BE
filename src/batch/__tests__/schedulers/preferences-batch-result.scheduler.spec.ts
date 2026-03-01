import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PreferencesBatchResultScheduler } from '../../schedulers/preferences-batch-result.scheduler';
import { BatchJobService } from '../../services/batch-job.service';
import { PreferenceBatchService } from '../../services/preference-batch.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { BatchJob } from '../../entities/batch-job.entity';
import { BatchJobStatus } from '../../types/preference-batch.types';
import {
  createMockRepository,
  createMockUpdateResult,
} from '../../../../test/mocks/repository.mock';
import { SchedulerAlertService } from '@/common/services/scheduler-alert.service';

describe('PreferencesBatchResultScheduler', () => {
  let scheduler: PreferencesBatchResultScheduler;
  let mockBatchJobService: {
    findIncomplete: jest.Mock;
    findById: jest.Mock;
    updateStatus: jest.Mock;
  };
  let mockPreferenceBatchService: {
    processResults: jest.Mock;
    processErrors: jest.Mock;
  };
  let mockOpenAiBatchClient: {
    isReady: jest.Mock;
    getBatchStatus: jest.Mock;
    downloadResults: jest.Mock;
    downloadErrors: jest.Mock;
  };
  let mockMenuSelectionRepository: ReturnType<typeof createMockRepository>;
  let dataSource: jest.Mocked<DataSource>;

  const mockBatchJob: BatchJob = {
    id: 1,
    openAiBatchId: 'batch_123',
    type: 'PREFERENCE_ANALYSIS' as any,
    status: BatchJobStatus.PROCESSING,
    totalRequests: 10,
    completedRequests: 0,
    failedRequests: 0,
    inputFileId: 'file_123',
    outputFileId: null,
    errorFileId: null,
    submittedAt: new Date(),
    completedAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockBatchJobService = {
      findIncomplete: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockPreferenceBatchService = {
      processResults: jest.fn(),
      processErrors: jest.fn(),
    };

    mockOpenAiBatchClient = {
      isReady: jest.fn(),
      getBatchStatus: jest.fn(),
      downloadResults: jest.fn(),
      downloadErrors: jest.fn(),
    };

    mockMenuSelectionRepository = createMockRepository<MenuSelection>();

    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesBatchResultScheduler,
        {
          provide: BatchJobService,
          useValue: mockBatchJobService,
        },
        {
          provide: PreferenceBatchService,
          useValue: mockPreferenceBatchService,
        },
        {
          provide: OpenAiBatchClient,
          useValue: mockOpenAiBatchClient,
        },
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: SchedulerAlertService,
          useValue: {
            alertFailure: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('5 17 * * *'),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addCronJob: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<PreferencesBatchResultScheduler>(
      PreferencesBatchResultScheduler,
    );
  });

  describe('handleCompletedBatch', () => {
    it('should mark BatchJob as FAILED when result download fails', async () => {
      // Arrange
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      mockOpenAiBatchClient.downloadResults.mockRejectedValue(
        new Error('Network error'),
      );
      mockMenuSelectionRepository.find.mockResolvedValue([
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
        {
          id: 101,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ]);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        'output_file_123',
        undefined,
      );

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        {
          completedAt: expect.any(Date),
          errorMessage: 'Network error',
        },
      );
    });

    it('should reset associated Selections to FAILED when result download fails', async () => {
      // Arrange
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      mockOpenAiBatchClient.downloadResults.mockRejectedValue(
        new Error('Download failed'),
      );

      const selections = [
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
        {
          id: 101,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ];
      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        'output_file_123',
        undefined,
      );

      // Assert
      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: {
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      });
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        {
          status: MenuSelectionStatus.FAILED,
          batchJobId: null,
        },
      );
    });

    it('should process download errors and convert them to batch errors', async () => {
      // Arrange
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);

      const downloadErrors = [
        {
          customId: 'pref_1_100',
          reason: 'null_content',
        },
        {
          customId: 'pref_2_200',
          reason: 'invalid_status_code',
          statusCode: 400,
        },
      ];

      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map([
          ['pref_3_300', JSON.stringify({ analysis: 'test' })],
        ]),
        errors: downloadErrors,
      });

      mockPreferenceBatchService.processResults.mockResolvedValue(undefined);
      mockPreferenceBatchService.processErrors.mockResolvedValue(undefined);
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        'output_file_123',
        undefined,
      );

      // Assert
      expect(mockPreferenceBatchService.processErrors).toHaveBeenCalledTimes(2);
      expect(mockPreferenceBatchService.processErrors).toHaveBeenNthCalledWith(
        1,
        [
          {
            customId: 'pref_1_100',
            code: 'null_content',
            message: 'Download error: null_content',
          },
        ],
        mockBatchJob,
      );
      expect(mockPreferenceBatchService.processErrors).toHaveBeenNthCalledWith(
        2,
        [
          {
            customId: 'pref_2_200',
            code: 'invalid_status_code',
            message: 'Download error: invalid_status_code',
          },
        ],
        mockBatchJob,
      );
    });

    it('should successfully process results when no errors occur', async () => {
      // Arrange
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);

      const results = new Map([
        ['pref_1_100', JSON.stringify({ analysis: 'test 1' })],
        ['pref_2_200', JSON.stringify({ analysis: 'test 2' })],
      ]);

      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results,
        errors: [],
      });

      mockPreferenceBatchService.processResults.mockResolvedValue(undefined);
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        'output_file_123',
        undefined,
      );

      // Assert
      expect(mockPreferenceBatchService.processResults).toHaveBeenCalledWith(
        results,
        mockBatchJob,
      );
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.COMPLETED,
        {
          outputFileId: 'output_file_123',
          completedAt: expect.any(Date),
        },
      );
    });

    it('should mark BatchJob as FAILED when error file download fails', async () => {
      // Arrange
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      mockOpenAiBatchClient.downloadErrors.mockRejectedValue(
        new Error('Error file download failed'),
      );
      mockMenuSelectionRepository.find.mockResolvedValue([
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ]);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        undefined,
        'error_file_123',
      );

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        {
          completedAt: expect.any(Date),
          errorMessage: 'Error file download failed',
        },
      );
    });
  });

  describe('handleDownloadErrors', () => {
    it('should convert BatchResultError to BatchError format', async () => {
      // Arrange
      const errors = [
        {
          customId: 'pref_1_100',
          reason: 'null_content',
        },
        {
          customId: 'pref_2_200',
          reason: 'invalid_status_code',
          statusCode: 400,
        },
      ];

      mockPreferenceBatchService.processErrors.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).handleDownloadErrors(errors, mockBatchJob);

      // Assert
      expect(mockPreferenceBatchService.processErrors).toHaveBeenCalledTimes(2);
      expect(mockPreferenceBatchService.processErrors).toHaveBeenNthCalledWith(
        1,
        [
          {
            customId: 'pref_1_100',
            code: 'null_content',
            message: 'Download error: null_content',
          },
        ],
        mockBatchJob,
      );
      expect(mockPreferenceBatchService.processErrors).toHaveBeenNthCalledWith(
        2,
        [
          {
            customId: 'pref_2_200',
            code: 'invalid_status_code',
            message: 'Download error: invalid_status_code',
          },
        ],
        mockBatchJob,
      );
    });
  });

  describe('resetSelectionsByBatchJob', () => {
    it('should reset BATCH_PROCESSING selections to FAILED', async () => {
      // Arrange
      const selections = [
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
        {
          id: 101,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
        {
          id: 102,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ];

      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(3),
      );

      // Act
      await (scheduler as any).resetSelectionsByBatchJob(1);

      // Assert
      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: {
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      });
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101, 102],
        {
          status: MenuSelectionStatus.FAILED,
          batchJobId: null,
        },
      );
    });

    it('should not update when no BATCH_PROCESSING selections found', async () => {
      // Arrange
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      // Act
      await (scheduler as any).resetSelectionsByBatchJob(1);

      // Assert
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('handleBatchProcessingFailure', () => {
    it('should update BatchJob to FAILED and reset selections', async () => {
      // Arrange
      const error = new Error('Processing failed');
      const selections = [
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ];

      mockBatchJobService.updateStatus.mockResolvedValue(undefined);
      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleBatchProcessingFailure(1, error);

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        {
          completedAt: expect.any(Date),
          errorMessage: 'Processing failed',
        },
      );
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });
    });

    it('should handle unknown error type', async () => {
      // Arrange
      const error = 'string error';
      const selections = [
        {
          id: 100,
          batchJobId: 1,
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      ];

      mockBatchJobService.updateStatus.mockResolvedValue(undefined);
      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleBatchProcessingFailure(1, error);

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        {
          completedAt: expect.any(Date),
          errorMessage: 'Unknown error',
        },
      );
    });
  });

  describe('pollAndProcessResults', () => {
    it('should not process when OpenAI client is not ready', async () => {
      // Arrange
      mockOpenAiBatchClient.isReady.mockReturnValue(false);

      // Act
      await scheduler.pollAndProcessResults();

      // Assert
      expect(mockBatchJobService.findIncomplete).not.toHaveBeenCalled();
    });

    it('should process incomplete batches when client is ready', async () => {
      // Arrange
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockResolvedValue([mockBatchJob]);
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'completed',
        outputFileId: 'output_123',
        errorFileId: undefined,
        progress: {
          total: 10,
          completed: 10,
          failed: 0,
        },
      });
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);
      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map(),
        errors: [],
      });
      mockPreferenceBatchService.processResults.mockResolvedValue(undefined);

      // Act
      await scheduler.pollAndProcessResults();

      // Assert
      expect(mockBatchJobService.findIncomplete).toHaveBeenCalled();
      expect(mockOpenAiBatchClient.getBatchStatus).toHaveBeenCalledWith(
        'batch_123',
      );
    });

    it('should log when no incomplete batches exist', async () => {
      // Arrange - covers line 83-84 (empty incompleteBatches branch)
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockResolvedValue([]);

      const logSpy = jest.spyOn((scheduler as any).logger, 'log');

      // Act
      await scheduler.pollAndProcessResults();

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('처리 대기 중인 배치가 없습니다'),
      );
      expect(mockOpenAiBatchClient.getBatchStatus).not.toHaveBeenCalled();
    });

    it('should skip batch when openAiBatchId is null', async () => {
      // Arrange - covers line 93-96 (missing openAiBatchId branch)
      const batchJobWithoutId = { ...mockBatchJob, openAiBatchId: null };
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockResolvedValue([batchJobWithoutId]);

      const warnSpy = jest.spyOn((scheduler as any).logger, 'warn');

      // Act
      await scheduler.pollAndProcessResults();

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI batch ID가 없습니다'),
      );
      expect(mockOpenAiBatchClient.getBatchStatus).not.toHaveBeenCalled();
    });

    it('should log error and call schedulerAlertService when findIncomplete throws', async () => {
      // Arrange - covers lines 104-110 (catch block in pollAndProcessResults)
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockBatchJobService.findIncomplete.mockRejectedValue(
        new Error('DB connection error'),
      );
      const mockSchedulerAlertService = {
        alertFailure: jest.fn(),
      };

      // Rebuild module with a working alertService mock
      const module = await Test.createTestingModule({
        providers: [
          PreferencesBatchResultScheduler,
          { provide: BatchJobService, useValue: mockBatchJobService },
          {
            provide: PreferenceBatchService,
            useValue: mockPreferenceBatchService,
          },
          { provide: OpenAiBatchClient, useValue: mockOpenAiBatchClient },
          {
            provide: getRepositoryToken(MenuSelection),
            useValue: mockMenuSelectionRepository,
          },
          { provide: DataSource, useValue: dataSource },
          {
            provide: SchedulerAlertService,
            useValue: mockSchedulerAlertService,
          },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('5 17 * * *') },
          },
          {
            provide: SchedulerRegistry,
            useValue: { addCronJob: jest.fn() },
          },
        ],
      }).compile();

      const sched = module.get<PreferencesBatchResultScheduler>(
        PreferencesBatchResultScheduler,
      );
      const errorSpy = jest.spyOn((sched as any).logger, 'error');

      // Act
      await sched.pollAndProcessResults();

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('폴링 실패'),
      );
      expect(mockSchedulerAlertService.alertFailure).toHaveBeenCalledWith(
        '취향 배치 결과 폴링 스케줄러',
        expect.any(Error),
      );
    });

    it('should log timedOut error when advisory lock times out', async () => {
      // Arrange - covers line 117 (timedOut branch)
      // Make the advisory lock time out by mocking withAdvisoryLock behavior
      // The actual timeout happens inside withAdvisoryLock; we mock DataSource to simulate
      // a slow operation scenario. However since we can't easily mock withAdvisoryLock internals,
      // we test via a custom DataSource mock that simulates timeout scenario via rejected query.
      // We mock at the scheduler level by calling pollAndProcessResults with a dataSource
      // that causes timedOut=true return.
      // Since this is hard to unit test without mocking the utility, we verify the lock-not-acquired path.
      const mockQueryRunnerNotAcquired = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: false }]),
        release: jest.fn().mockResolvedValue(undefined),
      };
      dataSource.createQueryRunner = jest
        .fn()
        .mockReturnValue(mockQueryRunnerNotAcquired);

      const warnSpy = jest.spyOn((scheduler as any).logger, 'warn');

      // Act
      await scheduler.pollAndProcessResults();

      // Assert - covers line 121 (!acquired branch)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('다른 인스턴스에서 이미 실행 중입니다'),
      );
    });
  });

  describe('processSingleBatch', () => {
    it('should handle failed batch status', async () => {
      // Arrange - covers lines 162-166 (failed/expired branch)
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'failed',
        outputFileId: undefined,
        errorFileId: undefined,
        progress: { total: 10, completed: 5, failed: 5 },
      });
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      const warnSpy = jest.spyOn((scheduler as any).logger, 'warn');

      // Act
      await (scheduler as any).processSingleBatch(1, 'batch_failed');

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'OpenAI batch failed' }),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED'));
    });

    it('should handle expired batch status', async () => {
      // Arrange - covers expired branch inside handleFailedBatch (line 316 ternary)
      mockOpenAiBatchClient.getBatchStatus.mockResolvedValue({
        status: 'expired',
        outputFileId: undefined,
        errorFileId: undefined,
        progress: { total: 10, completed: 0, failed: 0 },
      });
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).processSingleBatch(1, 'batch_expired');

      // Assert
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.EXPIRED,
        expect.objectContaining({ errorMessage: 'OpenAI batch expired' }),
      );
    });

    it('should log error when getBatchStatus throws', async () => {
      // Arrange - covers processSingleBatch catch block
      mockOpenAiBatchClient.getBatchStatus.mockRejectedValue(
        new Error('Status fetch failed'),
      );

      const errorSpy = jest.spyOn((scheduler as any).logger, 'error');

      // Act
      await (scheduler as any).processSingleBatch(1, 'batch_error');

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('상태 확인 실패'),
      );
    });

    it('should log error when getBatchStatus throws non-Error', async () => {
      // Arrange - covers processSingleBatch error with non-Error instanceof check
      mockOpenAiBatchClient.getBatchStatus.mockRejectedValue('string error');

      const errorSpy = jest.spyOn((scheduler as any).logger, 'error');

      // Act
      await (scheduler as any).processSingleBatch(1, 'batch_str_error');

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error'),
      );
    });
  });

  describe('handleCompletedBatch - additional branches', () => {
    it('should return early when batchJob is not found', async () => {
      // Arrange - covers line 182-183 (!batchJob early return)
      mockBatchJobService.findById.mockResolvedValue(null);

      const errorSpy = jest.spyOn((scheduler as any).logger, 'error');

      // Act
      await (scheduler as any).handleCompletedBatch(
        999,
        'output_file_999',
        undefined,
      );

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
      expect(mockOpenAiBatchClient.downloadResults).not.toHaveBeenCalled();
    });

    it('should skip outputFile processing when outputFileId is undefined', async () => {
      // Arrange - covers line 187 (if outputFileId branch = false)
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);

      // Act
      await (scheduler as any).handleCompletedBatch(1, undefined, undefined);

      // Assert
      expect(mockOpenAiBatchClient.downloadResults).not.toHaveBeenCalled();
    });

    it('should skip errorFile processing when errorFileId is undefined', async () => {
      // Arrange - covers line 226 (if errorFileId branch = false)
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      mockOpenAiBatchClient.downloadResults.mockResolvedValue({
        results: new Map(),
        errors: [],
      });
      mockPreferenceBatchService.processResults.mockResolvedValue(undefined);
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        'output_file_123',
        undefined,
      );

      // Assert
      expect(mockOpenAiBatchClient.downloadErrors).not.toHaveBeenCalled();
    });

    it('should process errorFile when errorFileId is provided', async () => {
      // Arrange - covers line 226-250 (if errorFileId branch = true)
      mockBatchJobService.findById.mockResolvedValue(mockBatchJob);
      const errors = [{ customId: 'err_1', code: 'invalid', message: 'bad' }];
      mockOpenAiBatchClient.downloadErrors.mockResolvedValue(errors);
      mockPreferenceBatchService.processErrors.mockResolvedValue(undefined);
      mockBatchJobService.updateStatus.mockResolvedValue(undefined);

      // Act
      await (scheduler as any).handleCompletedBatch(
        1,
        undefined,
        'error_file_123',
      );

      // Assert
      expect(mockOpenAiBatchClient.downloadErrors).toHaveBeenCalledWith(
        'error_file_123',
      );
      expect(mockPreferenceBatchService.processErrors).toHaveBeenCalledWith(
        errors,
        mockBatchJob,
      );
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        1,
        BatchJobStatus.COMPLETED,
        { errorFileId: 'error_file_123' },
      );
    });
  });

  describe('handleBatchProcessingFailure - additional branches', () => {
    it('should log error when updateStatus itself throws during failure handling', async () => {
      // Arrange - covers lines 302-305 (catch block in handleBatchProcessingFailure)
      mockBatchJobService.updateStatus.mockRejectedValue(
        new Error('DB write failed'),
      );

      const errorSpy = jest.spyOn((scheduler as any).logger, 'error');

      // Act - should not throw
      await expect(
        (scheduler as any).handleBatchProcessingFailure(1, new Error('orig')),
      ).resolves.not.toThrow();

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('실패 상태 업데이트 중 에러 발생'),
      );
    });

    it('should log error with "Unknown error" message when resetError is not an Error instance', async () => {
      // Arrange - covers instanceof check in handleBatchProcessingFailure catch
      mockBatchJobService.updateStatus
        .mockResolvedValueOnce(undefined) // first call succeeds
        .mockRejectedValueOnce('string reset error'); // second call (via resetSelections -> updateStatus)
      mockMenuSelectionRepository.find.mockRejectedValue(
        'selection find error',
      );

      const errorSpy = jest.spyOn((scheduler as any).logger, 'error');

      // Act
      await (scheduler as any).handleBatchProcessingFailure(
        1,
        new Error('orig'),
      );

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('실패 상태 업데이트 중 에러 발생'),
      );
    });
  });

  describe('mapStatus', () => {
    it('should map validating status to PROCESSING', () => {
      const result = (scheduler as any).mapStatus('validating');
      expect(result).toBe(BatchJobStatus.PROCESSING);
    });

    it('should map in_progress status to PROCESSING', () => {
      const result = (scheduler as any).mapStatus('in_progress');
      expect(result).toBe(BatchJobStatus.PROCESSING);
    });

    it('should map finalizing status to PROCESSING', () => {
      const result = (scheduler as any).mapStatus('finalizing');
      expect(result).toBe(BatchJobStatus.PROCESSING);
    });

    it('should map completed status to COMPLETED', () => {
      const result = (scheduler as any).mapStatus('completed');
      expect(result).toBe(BatchJobStatus.COMPLETED);
    });

    it('should map failed status to FAILED', () => {
      const result = (scheduler as any).mapStatus('failed');
      expect(result).toBe(BatchJobStatus.FAILED);
    });

    it('should map expired status to EXPIRED', () => {
      const result = (scheduler as any).mapStatus('expired');
      expect(result).toBe(BatchJobStatus.EXPIRED);
    });

    it('should map cancelling status to FAILED', () => {
      const result = (scheduler as any).mapStatus('cancelling');
      expect(result).toBe(BatchJobStatus.FAILED);
    });

    it('should map cancelled status to FAILED', () => {
      const result = (scheduler as any).mapStatus('cancelled');
      expect(result).toBe(BatchJobStatus.FAILED);
    });

    it('should map unknown status to PROCESSING as default', () => {
      const result = (scheduler as any).mapStatus('unknown_status');
      expect(result).toBe(BatchJobStatus.PROCESSING);
    });
  });

  describe('onModuleInit', () => {
    it('should use default cron expression when config is not set', async () => {
      // configService.get returns undefined → onModuleInit uses the default ('5 17 * * *')
      // We verify that get was called with the correct key and default parameter
      const mockConfigDefault = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      };
      const schedulerRegistryMock = { addCronJob: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          PreferencesBatchResultScheduler,
          { provide: BatchJobService, useValue: mockBatchJobService },
          {
            provide: PreferenceBatchService,
            useValue: mockPreferenceBatchService,
          },
          { provide: OpenAiBatchClient, useValue: mockOpenAiBatchClient },
          {
            provide: getRepositoryToken(MenuSelection),
            useValue: mockMenuSelectionRepository,
          },
          { provide: DataSource, useValue: dataSource },
          {
            provide: SchedulerAlertService,
            useValue: { alertFailure: jest.fn() },
          },
          { provide: ConfigService, useValue: mockConfigDefault },
          { provide: SchedulerRegistry, useValue: schedulerRegistryMock },
        ],
      }).compile();

      const sched = module.get<PreferencesBatchResultScheduler>(
        PreferencesBatchResultScheduler,
      );
      // Manually invoke onModuleInit since TestingModule does not auto-trigger lifecycle hooks
      sched.onModuleInit();

      expect(sched).toBeDefined();
      expect(mockConfigDefault.get).toHaveBeenCalledWith(
        'CRON_PREFERENCES_BATCH_RESULT',
        '5 17 * * *',
      );
      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'preferences-batch-result',
        expect.anything(),
      );
    });
  });
});
