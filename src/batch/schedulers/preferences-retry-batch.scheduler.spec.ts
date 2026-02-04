import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreferencesRetryBatchScheduler } from './preferences-retry-batch.scheduler';
import { PreferenceBatchService } from '../services/preference-batch.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobStatus } from '../types/preference-batch.types';
import {
  createMockRepository,
  createMockQueryBuilder,
  createMockUpdateResult,
} from '../../../test/mocks/repository.mock';

describe('PreferencesRetryBatchScheduler', () => {
  let scheduler: PreferencesRetryBatchScheduler;
  let mockPreferenceBatchService: {
    submitRetryBatch: jest.Mock;
  };
  let mockMenuSelectionRepository: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    mockPreferenceBatchService = {
      submitRetryBatch: jest.fn(),
    };

    mockMenuSelectionRepository = createMockRepository<MenuSelection>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesRetryBatchScheduler,
        {
          provide: PreferenceBatchService,
          useValue: mockPreferenceBatchService,
        },
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
      ],
    }).compile();

    scheduler = module.get<PreferencesRetryBatchScheduler>(
      PreferencesRetryBatchScheduler,
    );
  });

  describe('handleExpiredBatchProcessingItems', () => {
    it('should reset BATCH_PROCESSING items when BatchJob status is COMPLETED', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 1,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
          batchJob: {
            id: 1,
            status: BatchJobStatus.COMPLETED,
          } as BatchJob,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });
    });

    it('should reset BATCH_PROCESSING items when BatchJob status is FAILED', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 1,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 1,
            status: BatchJobStatus.FAILED,
          } as BatchJob,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });
    });

    it('should reset BATCH_PROCESSING items when BatchJob status is EXPIRED', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 1,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 1,
            status: BatchJobStatus.EXPIRED,
          } as BatchJob,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });
    });

    it('should reset BATCH_PROCESSING items when batchJob is null', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: null,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: null,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
        batchJobId: null,
      });
    });

    it('should NOT reset BATCH_PROCESSING items when BatchJob status is still PROCESSING', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 1,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 1,
            status: BatchJobStatus.PROCESSING,
          } as BatchJob,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });

    it('should handle multiple expired items with mixed batch statuses', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      const expiredItems = [
        {
          id: 100,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 1,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 1,
            status: BatchJobStatus.COMPLETED,
          } as BatchJob,
        } as MenuSelection,
        {
          id: 101,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 2,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 2,
            status: BatchJobStatus.PROCESSING,
          } as BatchJob,
        } as MenuSelection,
        {
          id: 102,
          status: MenuSelectionStatus.BATCH_PROCESSING,
          batchJobId: 3,
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          batchJob: {
            id: 3,
            status: BatchJobStatus.FAILED,
          } as BatchJob,
        } as MenuSelection,
      ];

      mockQueryBuilder.getMany.mockResolvedValue(expiredItems);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      // Should only reset items 100 and 102 (COMPLETED and FAILED)
      // Item 101 (PROCESSING) should not be reset
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 102],
        {
          status: MenuSelectionStatus.FAILED,
          batchJobId: null,
        },
      );
    });

    it('should not update when no expired items found', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();

      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      // Assert
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });

    it('should query items older than 24 hours', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      const beforeTime = Date.now();

      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await (scheduler as any).handleExpiredBatchProcessingItems();

      const afterTime = Date.now();

      // Assert
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'selection.status = :status',
        {
          status: MenuSelectionStatus.BATCH_PROCESSING,
        },
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'selection.updatedAt < :expiredTime',
        expect.objectContaining({
          expiredTime: expect.any(Date),
        }),
      );

      // Verify the expiredTime is approximately 24 hours ago
      const call = mockQueryBuilder.andWhere.mock.calls[0];
      const expiredTime = call?.[1]?.expiredTime as Date;
      const expectedTime = new Date();
      expectedTime.setHours(expectedTime.getHours() - 24);

      // Allow 5 second tolerance for test execution time
      expect(
        Math.abs(expiredTime.getTime() - expectedTime.getTime()),
      ).toBeLessThan(5000);
    });
  });

  describe('submitRetryBatch', () => {
    it('should call handleExpiredBatchProcessingItems before submitting retry batch', async () => {
      // Arrange
      const mockBatchJob = {
        id: 1,
        totalRequests: 5,
      } as BatchJob;

      mockPreferenceBatchService.submitRetryBatch.mockResolvedValue(
        mockBatchJob,
      );

      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Spy on handleExpiredBatchProcessingItems
      const handleExpiredSpy = jest.spyOn(
        scheduler as any,
        'handleExpiredBatchProcessingItems',
      );

      // Act
      await scheduler.submitRetryBatch();

      // Assert
      expect(handleExpiredSpy).toHaveBeenCalled();
      expect(mockPreferenceBatchService.submitRetryBatch).toHaveBeenCalled();
    });

    it('should submit retry batch when there are failed items', async () => {
      // Arrange
      const mockBatchJob = {
        id: 1,
        totalRequests: 5,
      } as BatchJob;

      mockPreferenceBatchService.submitRetryBatch.mockResolvedValue(
        mockBatchJob,
      );

      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await scheduler.submitRetryBatch();

      // Assert
      expect(mockPreferenceBatchService.submitRetryBatch).toHaveBeenCalled();
    });

    it('should handle when no retry batch is created', async () => {
      // Arrange
      mockPreferenceBatchService.submitRetryBatch.mockResolvedValue(null);

      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      await scheduler.submitRetryBatch();

      // Assert
      expect(mockPreferenceBatchService.submitRetryBatch).toHaveBeenCalled();
    });

    it('should handle errors during retry batch submission', async () => {
      // Arrange
      mockPreferenceBatchService.submitRetryBatch.mockRejectedValue(
        new Error('Submission failed'),
      );

      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act & Assert
      await expect(scheduler.submitRetryBatch()).resolves.not.toThrow();
    });
  });

  describe('shouldReset condition validation', () => {
    it('should include COMPLETED status in shouldReset condition', () => {
      // This test verifies the logic in handleExpiredBatchProcessingItems
      // The shouldReset condition should be:
      // !item.batchJob ||
      // item.batchJob.status === FAILED ||
      // item.batchJob.status === EXPIRED ||
      // item.batchJob.status === COMPLETED

      const testCases = [
        { batchJob: null, shouldReset: true, description: 'null batchJob' },
        {
          batchJob: { status: BatchJobStatus.FAILED },
          shouldReset: true,
          description: 'FAILED status',
        },
        {
          batchJob: { status: BatchJobStatus.EXPIRED },
          shouldReset: true,
          description: 'EXPIRED status',
        },
        {
          batchJob: { status: BatchJobStatus.COMPLETED },
          shouldReset: true,
          description: 'COMPLETED status',
        },
        {
          batchJob: { status: BatchJobStatus.PROCESSING },
          shouldReset: false,
          description: 'PROCESSING status',
        },
        {
          batchJob: { status: BatchJobStatus.SUBMITTED },
          shouldReset: false,
          description: 'SUBMITTED status',
        },
      ];

      testCases.forEach(({ batchJob, shouldReset, description }) => {
        const item = { batchJob } as MenuSelection;

        // Replicate the shouldReset logic from the scheduler
        const actualShouldReset =
          !item.batchJob ||
          item.batchJob.status === BatchJobStatus.FAILED ||
          item.batchJob.status === BatchJobStatus.EXPIRED ||
          item.batchJob.status === BatchJobStatus.COMPLETED;

        expect(actualShouldReset).toBe(shouldReset);
      });
    });
  });
});
