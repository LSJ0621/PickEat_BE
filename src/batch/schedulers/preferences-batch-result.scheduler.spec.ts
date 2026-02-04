import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreferencesBatchResultScheduler } from './preferences-batch-result.scheduler';
import { BatchJobService } from '../services/batch-job.service';
import { PreferenceBatchService } from '../services/preference-batch.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobStatus } from '../types/preference-batch.types';
import {
  createMockRepository,
  createMockUpdateResult,
} from '../../../test/mocks/repository.mock';

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
  });
});
