import { Test, TestingModule } from '@nestjs/testing';
import { PreferenceBatchService } from '../services/preference-batch.service';
import { SelectionGroupingService } from '../services/selection-grouping.service';
import { BatchRequestBuilderService } from '../services/batch-request-builder.service';
import { PreferenceBatchResultProcessorService } from '../services/preference-batch-result-processor.service';
import { BatchJobService } from '../services/batch-job.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobStatus, BatchJobType } from '../types/preference-batch.types';
import { UserFactory } from '../../../test/factories/entity.factory';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';

describe('PreferenceBatchService', () => {
  let service: PreferenceBatchService;

  const mockGroupingService = {
    collectPendingSelections: jest.fn(),
    collectFailedSelectionsForRetry: jest.fn(),
  };

  const mockRequestBuilder = {
    buildBatchRequests: jest.fn(),
    buildOpenAiBatchRequests: jest.fn(),
  };

  const mockResultProcessor = {
    markSelectionsBatchProcessing: jest.fn(),
    markSelectionsSucceeded: jest.fn(),
    incrementRetryCount: jest.fn(),
    processResults: jest.fn(),
    processErrors: jest.fn(),
  };

  const mockBatchJobService = {
    create: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockBatchClient = {
    isReady: jest.fn(),
    createBatchContent: jest.fn(),
    uploadBatchContent: jest.fn(),
    createBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchService,
        { provide: SelectionGroupingService, useValue: mockGroupingService },
        { provide: BatchRequestBuilderService, useValue: mockRequestBuilder },
        { provide: PreferenceBatchResultProcessorService, useValue: mockResultProcessor },
        { provide: BatchJobService, useValue: mockBatchJobService },
        { provide: OpenAiBatchClient, useValue: mockBatchClient },
      ],
    }).compile();

    service = module.get<PreferenceBatchService>(PreferenceBatchService);
  });

  describe('submitBatch', () => {
    it('OpenAI Client가 준비되지 않으면 null을 반환한다', async () => {
      mockBatchClient.isReady.mockReturnValue(false);

      const result = await service.submitBatch();

      expect(result).toBeNull();
    });

    it('PENDING selection이 없으면 null을 반환한다', async () => {
      mockBatchClient.isReady.mockReturnValue(true);
      mockGroupingService.collectPendingSelections.mockResolvedValue([]);

      const result = await service.submitBatch();

      expect(result).toBeNull();
    });

    it('유효한 요청이 있으면 배치를 제출하고 BatchJob을 반환한다', async () => {
      const user = UserFactory.create({ id: 1 });
      const mockJob = { id: 1, status: BatchJobStatus.PENDING } as BatchJob;

      mockBatchClient.isReady.mockReturnValue(true);
      mockGroupingService.collectPendingSelections.mockResolvedValue([
        {
          user,
          selections: [{ id: 1 } as MenuSelection],
          slotMenus: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ]);
      mockRequestBuilder.buildBatchRequests.mockResolvedValue([
        { customId: 'pref_1_1', userId: 1, selectionIds: [1], systemPrompt: 's', userPrompt: 'u' },
      ]);
      mockRequestBuilder.buildOpenAiBatchRequests.mockReturnValue([{ custom_id: 'pref_1_1' }]);
      mockBatchJobService.create.mockResolvedValue(mockJob);
      mockBatchClient.createBatchContent.mockReturnValue('{}');
      mockBatchClient.uploadBatchContent.mockResolvedValue('file_123');
      mockBatchClient.createBatch.mockResolvedValue('batch_123');

      const result = await service.submitBatch();

      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
    });

    it('빈 메뉴만 있는 요청이면 selection을 성공으로 표시하고 null을 반환한다', async () => {
      const user = UserFactory.create({ id: 1 });

      mockBatchClient.isReady.mockReturnValue(true);
      mockGroupingService.collectPendingSelections.mockResolvedValue([
        {
          user,
          selections: [{ id: 1 } as MenuSelection],
          slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
        },
      ]);
      mockRequestBuilder.buildBatchRequests.mockResolvedValue([]);

      const result = await service.submitBatch();

      expect(result).toBeNull();
    });

    it('OpenAI 제출 실패 시 BatchJob 상태를 FAILED로 업데이트하고 null을 반환한다', async () => {
      const user = UserFactory.create({ id: 1 });
      const mockJob = { id: 1, status: BatchJobStatus.PENDING } as BatchJob;

      mockBatchClient.isReady.mockReturnValue(true);
      mockGroupingService.collectPendingSelections.mockResolvedValue([
        {
          user,
          selections: [{ id: 1 } as MenuSelection],
          slotMenus: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ]);
      mockRequestBuilder.buildBatchRequests.mockResolvedValue([
        { customId: 'pref_1_1', userId: 1, selectionIds: [1], systemPrompt: 's', userPrompt: 'u' },
      ]);
      mockRequestBuilder.buildOpenAiBatchRequests.mockReturnValue([{}]);
      mockBatchJobService.create.mockResolvedValue(mockJob);
      mockBatchClient.createBatchContent.mockReturnValue('{}');
      mockBatchClient.uploadBatchContent.mockRejectedValue(new Error('Upload failed'));

      const result = await service.submitBatch();

      expect(result).toBeNull();
    });
  });

  describe('submitRetryBatch', () => {
    it('실패한 selection이 없으면 null을 반환한다', async () => {
      mockBatchClient.isReady.mockReturnValue(true);
      mockGroupingService.collectFailedSelectionsForRetry.mockResolvedValue([]);

      const result = await service.submitRetryBatch();

      expect(result).toBeNull();
    });
  });
});
