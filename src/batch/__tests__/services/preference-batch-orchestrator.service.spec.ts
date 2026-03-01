import { Test, TestingModule } from '@nestjs/testing';
import { PreferenceBatchService } from '../../services/preference-batch.service';
import { SelectionGroupingService } from '../../services/selection-grouping.service';
import { BatchRequestBuilderService } from '../../services/batch-request-builder.service';
import { PreferenceBatchResultProcessorService } from '../../services/preference-batch-result-processor.service';
import { BatchJobService } from '../../services/batch-job.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { BatchJob } from '../../entities/batch-job.entity';
import {
  BatchJobStatus,
  BatchJobType,
  BatchError,
} from '../../types/preference-batch.types';
import { UserSelectionGroup } from '../../interfaces/preference-batch.interface';
import {
  UserFactory,
  MenuSelectionFactory,
} from '../../../../test/factories/entity.factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockBatchJob(overrides?: Partial<BatchJob>): BatchJob {
  return {
    id: 1,
    openAiBatchId: 'batch_openai_001',
    type: BatchJobType.PREFERENCE_ANALYSIS,
    status: BatchJobStatus.PENDING,
    totalRequests: 5,
    completedRequests: 0,
    failedRequests: 0,
    inputFileId: null,
    outputFileId: null,
    errorFileId: null,
    submittedAt: null,
    completedAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildUserGroup(userId: number = 1): UserSelectionGroup {
  const user = UserFactory.create({ id: userId });
  const selection = MenuSelectionFactory.createPending(user);
  selection.id = userId * 10;
  return {
    user,
    selections: [selection],
    slotMenus: {
      breakfast: ['토스트'],
      lunch: ['된장찌개'],
      dinner: ['삼겹살'],
      etc: [],
    },
  };
}

describe('PreferenceBatchService', () => {
  let service: PreferenceBatchService;
  let mockSelectionGroupingService: jest.Mocked<
    Pick<
      SelectionGroupingService,
      'collectPendingSelections' | 'collectFailedSelectionsForRetry'
    >
  >;
  let mockBatchRequestBuilderService: jest.Mocked<
    Pick<
      BatchRequestBuilderService,
      'buildBatchRequests' | 'buildOpenAiBatchRequests'
    >
  >;
  let mockResultProcessorService: jest.Mocked<
    Pick<
      PreferenceBatchResultProcessorService,
      | 'processResults'
      | 'processErrors'
      | 'markSelectionsBatchProcessing'
      | 'markSelectionsSucceeded'
      | 'incrementRetryCount'
    >
  >;
  let mockBatchJobService: jest.Mocked<
    Pick<BatchJobService, 'create' | 'updateStatus'>
  >;
  let mockOpenAiBatchClient: jest.Mocked<
    Pick<
      OpenAiBatchClient,
      'isReady' | 'createBatchContent' | 'uploadBatchContent' | 'createBatch'
    >
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSelectionGroupingService = {
      collectPendingSelections: jest.fn(),
      collectFailedSelectionsForRetry: jest.fn(),
    };

    mockBatchRequestBuilderService = {
      buildBatchRequests: jest.fn(),
      buildOpenAiBatchRequests: jest.fn(),
    };

    mockResultProcessorService = {
      processResults: jest.fn().mockResolvedValue(undefined),
      processErrors: jest.fn().mockResolvedValue(undefined),
      markSelectionsBatchProcessing: jest.fn().mockResolvedValue(undefined),
      markSelectionsSucceeded: jest.fn().mockResolvedValue(undefined),
      incrementRetryCount: jest.fn().mockResolvedValue(undefined),
    };

    mockBatchJobService = {
      create: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockOpenAiBatchClient = {
      isReady: jest.fn().mockReturnValue(true),
      createBatchContent: jest.fn().mockReturnValue('{"test":"jsonl"}'),
      uploadBatchContent: jest.fn().mockResolvedValue('file_uploaded_001'),
      createBatch: jest.fn().mockResolvedValue('batch_openai_001'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchService,
        {
          provide: SelectionGroupingService,
          useValue: mockSelectionGroupingService,
        },
        {
          provide: BatchRequestBuilderService,
          useValue: mockBatchRequestBuilderService,
        },
        {
          provide: PreferenceBatchResultProcessorService,
          useValue: mockResultProcessorService,
        },
        {
          provide: BatchJobService,
          useValue: mockBatchJobService,
        },
        {
          provide: OpenAiBatchClient,
          useValue: mockOpenAiBatchClient,
        },
      ],
    }).compile();

    service = module.get<PreferenceBatchService>(PreferenceBatchService);
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // submitBatch
  // =========================================================================

  describe('submitBatch', () => {
    it('should return null when OpenAI client is not ready', async () => {
      mockOpenAiBatchClient.isReady.mockReturnValue(false);

      const result = await service.submitBatch();

      expect(result).toBeNull();
      expect(
        mockSelectionGroupingService.collectPendingSelections,
      ).not.toHaveBeenCalled();
    });

    it('should return null when no pending selections exist', async () => {
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue(
        [],
      );

      const result = await service.submitBatch();

      expect(result).toBeNull();
      expect(mockBatchJobService.create).not.toHaveBeenCalled();
    });

    it('should return null and mark selections as succeeded when all groups have empty menus', async () => {
      const group = buildUserGroup();
      group.slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([]);

      const result = await service.submitBatch();

      expect(result).toBeNull();
      expect(
        mockResultProcessorService.markSelectionsSucceeded,
      ).toHaveBeenCalledWith(group.selections);
      expect(mockBatchJobService.create).not.toHaveBeenCalled();
    });

    it('should create batch job, upload file, and return batch job on success', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };
      const batchRequest = {
        custom_id: 'pref_1_10',
        method: 'POST' as const,
        url: '/v1/chat/completions' as const,
        body: { model: 'gpt-4o-mini', messages: [] },
      };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue([
        batchRequest,
      ]);
      mockBatchJobService.create.mockResolvedValue(mockJob);

      const result = await service.submitBatch();

      expect(result).toEqual(mockJob);
      expect(mockBatchJobService.create).toHaveBeenCalledWith(
        BatchJobType.PREFERENCE_ANALYSIS,
        1,
      );
      expect(mockOpenAiBatchClient.uploadBatchContent).toHaveBeenCalledWith(
        '{"test":"jsonl"}',
      );
      expect(mockOpenAiBatchClient.createBatch).toHaveBeenCalledWith(
        'file_uploaded_001',
        expect.objectContaining({ job_type: 'preference_analysis' }),
      );
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        mockJob.id,
        BatchJobStatus.SUBMITTED,
        expect.objectContaining({ openAiBatchId: 'batch_openai_001' }),
      );
      expect(
        mockResultProcessorService.markSelectionsBatchProcessing,
      ).toHaveBeenCalledWith(group.selections, mockJob.id);
    });

    it('should use custom model when provided', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);

      await service.submitBatch('gpt-4o');

      expect(
        mockBatchRequestBuilderService.buildOpenAiBatchRequests,
      ).toHaveBeenCalledWith([prefRequest], 'gpt-4o');
    });

    it('should update batch job status to FAILED and return null when upload throws', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);
      mockOpenAiBatchClient.uploadBatchContent.mockRejectedValue(
        new Error('Upload failed'),
      );

      const result = await service.submitBatch();

      expect(result).toBeNull();
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        mockJob.id,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'Upload failed' }),
      );
    });

    it('should record errorMessage as "Unknown error" when a non-Error is thrown', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);
      mockOpenAiBatchClient.uploadBatchContent.mockRejectedValue(
        'non-error string',
      );

      const result = await service.submitBatch();

      expect(result).toBeNull();
      expect(mockBatchJobService.updateStatus).toHaveBeenCalledWith(
        mockJob.id,
        BatchJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'Unknown error' }),
      );
    });

    it('should include batch_job_id in metadata when creating the OpenAI batch', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob({ id: 42 });
      const prefRequest = {
        customId: 'pref_42_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectPendingSelections.mockResolvedValue([
        group,
      ]);
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);

      await service.submitBatch();

      expect(mockOpenAiBatchClient.createBatch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ batch_job_id: '42' }),
      );
    });
  });

  // =========================================================================
  // submitRetryBatch
  // =========================================================================

  describe('submitRetryBatch', () => {
    it('should return null when OpenAI client is not ready', async () => {
      mockOpenAiBatchClient.isReady.mockReturnValue(false);

      const result = await service.submitRetryBatch();

      expect(result).toBeNull();
      expect(
        mockSelectionGroupingService.collectFailedSelectionsForRetry,
      ).not.toHaveBeenCalled();
    });

    it('should return null when no failed selections exist', async () => {
      mockOpenAiBatchClient.isReady.mockReturnValue(true);
      mockSelectionGroupingService.collectFailedSelectionsForRetry.mockResolvedValue(
        [],
      );

      const result = await service.submitRetryBatch();

      expect(result).toBeNull();
      expect(mockBatchJobService.create).not.toHaveBeenCalled();
    });

    it('should call incrementRetryCount before building requests', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectFailedSelectionsForRetry.mockResolvedValue(
        [group],
      );
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);

      await service.submitRetryBatch();

      expect(
        mockResultProcessorService.incrementRetryCount,
      ).toHaveBeenCalledWith(group.selections);
      expect(
        mockBatchRequestBuilderService.buildBatchRequests,
      ).toHaveBeenCalled();
    });

    it('should submit batch with preference_analysis_retry job_type metadata', async () => {
      const group = buildUserGroup();
      const mockJob = buildMockBatchJob();
      const prefRequest = {
        customId: 'pref_1_10',
        userId: 1,
        selectionIds: [10],
        systemPrompt: 'sys',
        userPrompt: 'usr',
      };

      mockSelectionGroupingService.collectFailedSelectionsForRetry.mockResolvedValue(
        [group],
      );
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([
        prefRequest,
      ]);
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);

      await service.submitRetryBatch();

      expect(mockOpenAiBatchClient.createBatch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ job_type: 'preference_analysis_retry' }),
      );
    });

    it('should return null and mark selections succeeded when all groups have empty menus', async () => {
      const group = buildUserGroup();
      group.slotMenus = { breakfast: [], lunch: [], dinner: [], etc: [] };

      mockSelectionGroupingService.collectFailedSelectionsForRetry.mockResolvedValue(
        [group],
      );
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue([]);

      const result = await service.submitRetryBatch();

      expect(result).toBeNull();
      expect(
        mockResultProcessorService.markSelectionsSucceeded,
      ).toHaveBeenCalledWith(group.selections);
    });

    it('should handle multiple failed groups and submit combined batch', async () => {
      const group1 = buildUserGroup(1);
      const group2 = buildUserGroup(2);
      const mockJob = buildMockBatchJob();
      const prefRequests = [
        {
          customId: 'pref_1_10',
          userId: 1,
          selectionIds: [10],
          systemPrompt: 'sys',
          userPrompt: 'usr',
        },
        {
          customId: 'pref_2_20',
          userId: 2,
          selectionIds: [20],
          systemPrompt: 'sys',
          userPrompt: 'usr',
        },
      ];

      mockSelectionGroupingService.collectFailedSelectionsForRetry.mockResolvedValue(
        [group1, group2],
      );
      mockBatchRequestBuilderService.buildBatchRequests.mockResolvedValue(
        prefRequests,
      );
      mockBatchRequestBuilderService.buildOpenAiBatchRequests.mockReturnValue(
        [],
      );
      mockBatchJobService.create.mockResolvedValue(mockJob);

      const result = await service.submitRetryBatch();

      expect(result).toEqual(mockJob);
      expect(mockBatchJobService.create).toHaveBeenCalledWith(
        BatchJobType.PREFERENCE_ANALYSIS,
        2,
      );
    });
  });

  // =========================================================================
  // processResults
  // =========================================================================

  describe('processResults', () => {
    it('should delegate to resultProcessorService.processResults', async () => {
      const results = new Map<string, string>([
        ['pref_1_100', JSON.stringify({ analysis: 'likes spicy food' })],
      ]);
      const batchJob = buildMockBatchJob();

      await service.processResults(results, batchJob);

      expect(mockResultProcessorService.processResults).toHaveBeenCalledWith(
        results,
        batchJob,
      );
    });

    it('should propagate errors thrown by resultProcessorService', async () => {
      const results = new Map<string, string>();
      const batchJob = buildMockBatchJob();
      mockResultProcessorService.processResults.mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(service.processResults(results, batchJob)).rejects.toThrow(
        'Processing failed',
      );
    });
  });

  // =========================================================================
  // processErrors
  // =========================================================================

  describe('processErrors', () => {
    it('should delegate to resultProcessorService.processErrors', async () => {
      const errors: BatchError[] = [
        { customId: 'pref_1_100', code: 'rate_limit', message: 'Too many' },
      ];
      const batchJob = buildMockBatchJob();

      await service.processErrors(errors, batchJob);

      expect(mockResultProcessorService.processErrors).toHaveBeenCalledWith(
        errors,
        batchJob,
      );
    });

    it('should handle empty errors array gracefully', async () => {
      const batchJob = buildMockBatchJob();

      await service.processErrors([], batchJob);

      expect(mockResultProcessorService.processErrors).toHaveBeenCalledWith(
        [],
        batchJob,
      );
    });
  });
});
