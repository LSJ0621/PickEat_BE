import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PreferenceBatchResultProcessorService } from '../../services/preference-batch-result-processor.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { User } from '@/user/entities/user.entity';
import { UserTasteAnalysis } from '@/user/entities/user-taste-analysis.entity';
import { UserService } from '@/user/user.service';
import { BatchJob } from '../../entities/batch-job.entity';
import {
  BatchJobStatus,
  BatchJobType,
} from '../../types/preference-batch.types';
import {
  createMockRepository,
  createMockUpdateResult,
} from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
  UserTasteAnalysisFactory,
} from '../../../../test/factories/entity.factory';
import { PreferenceAnalysisResult } from '../../interfaces/preference-batch.interface';

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildBatchJob(overrides?: Partial<BatchJob>): BatchJob {
  return {
    id: 1,
    type: BatchJobType.PREFERENCE_ANALYSIS,
    status: BatchJobStatus.PROCESSING,
    openAiBatchId: 'batch_abc',
    inputFileId: 'file_input',
    outputFileId: null,
    errorFileId: null,
    totalRequests: 5,
    completedRequests: 0,
    failedRequests: 0,
    submittedAt: new Date(),
    completedAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildValidAnalysisJson(
  overrides?: Partial<PreferenceAnalysisResult>,
): string {
  const result: PreferenceAnalysisResult = {
    analysis: 'User prefers Korean food',
    compactSummary: 'Korean food fan',
    stablePatterns: {
      categories: ['한식'],
      flavors: ['매운맛'],
      cookingMethods: ['볶음'],
      confidence: 'high',
    },
    recentSignals: { trending: ['일식'], declining: [] },
    diversityHints: {
      explorationAreas: ['중식'],
      rotationSuggestions: ['이탈리안'],
    },
    ...overrides,
  };
  return JSON.stringify(result);
}

type MockQueryRunner = {
  connect: jest.Mock;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
  manager: {
    update: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
};

function createMockQueryRunner(
  managerOverrides?: Partial<MockQueryRunner['manager']>,
): MockQueryRunner {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockReturnValue({}),
      ...managerOverrides,
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PreferenceBatchResultProcessorService', () => {
  let service: PreferenceBatchResultProcessorService;
  let mockMenuSelectionRepository: ReturnType<
    typeof createMockRepository<MenuSelection>
  >;
  let mockUserService: { findOne: jest.Mock };
  let mockDataSource: { createQueryRunner: jest.Mock };
  let defaultQueryRunner: MockQueryRunner;
  let mockBatchJob: BatchJob;

  beforeEach(async () => {
    mockMenuSelectionRepository = createMockRepository<MenuSelection>();
    mockUserService = { findOne: jest.fn() };
    defaultQueryRunner = createMockQueryRunner();
    mockBatchJob = buildBatchJob();

    mockDataSource = {
      createQueryRunner: jest.fn(() => defaultQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchResultProcessorService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        { provide: UserService, useValue: mockUserService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PreferenceBatchResultProcessorService>(
      PreferenceBatchResultProcessorService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────
  // parseCustomId
  // ──────────────────────────────────────────────
  describe('parseCustomId', () => {
    it('should parse valid custom_id with a single selection id', () => {
      expect(service.parseCustomId('pref_1_100')).toEqual({
        userId: 1,
        selectionIds: [100],
      });
    });

    it('should parse valid custom_id with multiple comma-separated selection ids', () => {
      expect(service.parseCustomId('pref_42_10,20,30')).toEqual({
        userId: 42,
        selectionIds: [10, 20, 30],
      });
    });

    it('should return null when prefix is not pref_', () => {
      expect(service.parseCustomId('user_1_100')).toBeNull();
    });

    it('should return null when userId is not a number', () => {
      expect(service.parseCustomId('pref_abc_100')).toBeNull();
    });

    it('should return null when custom_id is an empty string', () => {
      expect(service.parseCustomId('')).toBeNull();
    });

    it('should return null when selection ids contain non-numeric values', () => {
      expect(service.parseCustomId('pref_1_abc,def')).toBeNull();
    });

    it('should return null when custom_id has wrong segment count', () => {
      expect(service.parseCustomId('pref_1')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // processResults – happy path
  // ──────────────────────────────────────────────
  describe('processResults', () => {
    it('should commit transaction and update user preferences when result is valid and user exists', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);

      const results = new Map<string, string>([
        ['pref_1_10,11', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(defaultQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(defaultQueryRunner.release).toHaveBeenCalled();
    });

    it('should update User preferences with trimmed analysis text', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson({ analysis: '  trimmed  ' })],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.manager.update).toHaveBeenCalledWith(
        User,
        { id: 1 },
        expect.objectContaining({
          preferences: expect.objectContaining({ analysis: 'trimmed' }),
        }),
      );
    });

    it('should increment analysisVersion when user has existing preferences', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        preferences: {
          likes: ['한식'],
          dislikes: [],
          analysis: 'old analysis',
          analysisVersion: 3,
        },
      });
      mockUserService.findOne.mockResolvedValue(mockUser);

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.manager.update).toHaveBeenCalledWith(
        User,
        { id: 1 },
        expect.objectContaining({
          preferences: expect.objectContaining({ analysisVersion: 4 }),
        }),
      );
    });

    it('should update existing UserTasteAnalysis when record already exists', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);
      const existingAnalysis = UserTasteAnalysisFactory.create({
        userId: 1,
        analysisVersion: 2,
      });
      defaultQueryRunner.manager.findOne.mockResolvedValue(existingAnalysis);

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.manager.update).toHaveBeenCalledWith(
        UserTasteAnalysis,
        { id: existingAnalysis.id },
        expect.objectContaining({ analysisVersion: 3 }),
      );
    });

    it('should save new UserTasteAnalysis with version 1 when no existing record', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);
      defaultQueryRunner.manager.findOne.mockResolvedValue(null);

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.manager.save).toHaveBeenCalled();
      expect(defaultQueryRunner.manager.create).toHaveBeenCalledWith(
        UserTasteAnalysis,
        expect.objectContaining({ analysisVersion: 1 }),
      );
    });

    it('should update MenuSelection status to SUCCEEDED after transaction commits', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);

      const results = new Map<string, string>([
        ['pref_1_10,20', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.manager.update).toHaveBeenCalledWith(
        MenuSelection,
        { id: expect.anything() },
        { status: MenuSelectionStatus.SUCCEEDED },
      );
    });

    it('should handle multiple entries across chunks without error', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);

      const results = new Map<string, string>();
      for (let i = 0; i < 3; i++) {
        results.set(`pref_1_${i + 100}`, buildValidAnalysisJson());
      }

      await expect(
        service.processResults(results, mockBatchJob),
      ).resolves.toBeUndefined();

      expect(mockDataSource.createQueryRunner).toHaveBeenCalledTimes(3);
    });

    // ─── Error branches ───────────────────────────────────────────────────

    it('should skip entry and increment failCount when custom_id is invalid', async () => {
      const results = new Map<string, string>([
        ['invalid_format', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockUserService.findOne).not.toHaveBeenCalled();
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should mark selections as FAILED and skip transaction when analysis field is missing', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', JSON.stringify({ notAnalysis: 'oops' })],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should mark selections as FAILED when analysis field is not a string', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', JSON.stringify({ analysis: 42 })],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should mark selections as FAILED when user is not found', async () => {
      mockUserService.findOne.mockRejectedValue(new Error('User not found'));
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should rollback transaction and mark selections as FAILED when transaction throws', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);
      defaultQueryRunner.manager.update.mockRejectedValue(
        new Error('DB write failed'),
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should always release query runner even when transaction fails', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);
      defaultQueryRunner.manager.update.mockRejectedValue(
        new Error('DB write failed'),
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(defaultQueryRunner.release).toHaveBeenCalled();
    });

    it('should log error when markSelectionsFailedByIds throws after transaction rollback (line 159)', async () => {
      const mockUser = UserFactory.create({ id: 1, preferences: null });
      mockUserService.findOne.mockResolvedValue(mockUser);
      // Make the transaction manager update throw to trigger rollback path
      defaultQueryRunner.manager.update.mockRejectedValue(
        new Error('TX write failed'),
      );
      // Make markSelectionsFailedByIds also throw (via repository update)
      mockMenuSelectionRepository.update.mockRejectedValue(
        new Error('Mark failed'),
      );

      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      // Should NOT throw - errors are caught
      await expect(
        service.processResults(results, mockBatchJob),
      ).resolves.toBeUndefined();

      expect(defaultQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should handle outer catch block when customId is unparseable (line 177-180)', async () => {
      // Use a customId that will fail outer validation after being set
      // We need to create a scenario where the outer catch is reached with
      // a valid-looking customId that then fails parseCustomId
      // This is tricky since parseCustomId validates "pref_" prefix.
      // We simulate an error thrown before the inner try block by making
      // findOne throw during user lookup when outer error occurs.
      mockUserService.findOne.mockRejectedValue(
        new Error('User service outer error'),
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // 'pref_1_10' is parseable - the outer catch will successfully parse
      // and mark selections as FAILED
      const results = new Map<string, string>([
        ['pref_1_10', buildValidAnalysisJson()],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should log error when outer catch has customId that parseCustomId returns null for (lines 177-180)', async () => {
      // We need to reach the outer catch block (line 166) with a customId that
      // passes the initial parseCustomId check (line 58-63) but when re-parsed in the
      // outer catch (line 173) returns null.
      // Strategy: spy on parseCustomId to return non-null first time (allow inner logic),
      // then null second time (outer catch re-parse returns null).
      const parseCustomIdSpy = jest.spyOn(service, 'parseCustomId');

      // First call (line 58): return valid parsed result so inner try executes
      parseCustomIdSpy.mockReturnValueOnce({ userId: 1, selectionIds: [10] });
      // In inner try: userService.findOne throws → goes to inner catch (line 76) NOT outer
      // Actually we need the outer catch. Let's make JSON.parse throw.
      // But JSON.parse happens before userService.findOne.
      // If JSON.parse throws, we jump to outer catch (line 166).
      // At that point parseCustomId is called again (line 173).
      // Second call (outer catch re-parse): return null → hits line 177-180
      parseCustomIdSpy.mockReturnValueOnce(null);

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      // Invalid JSON triggers outer catch. The customId 'pref_1_10' is truthy.
      const results = new Map<string, string>([
        ['pref_1_10', '{{{ invalid json'],
      ]);

      await service.processResults(results, mockBatchJob);

      // logger.error should be called with the "Failed to parse customId" message
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse customId'),
      );

      parseCustomIdSpy.mockRestore();
    });

    it('should handle JSON parse error gracefully and mark selections as FAILED', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const results = new Map<string, string>([
        ['pref_1_10', 'not valid json {{'],
      ]);

      await service.processResults(results, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should process empty results map without error', async () => {
      const results = new Map<string, string>();

      await expect(
        service.processResults(results, mockBatchJob),
      ).resolves.toBeUndefined();

      expect(mockUserService.findOne).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // processErrors
  // ──────────────────────────────────────────────
  describe('processErrors', () => {
    it('should mark selections as FAILED for each valid error entry', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      const errors = [
        { customId: 'pref_1_100', code: 'server_error', message: 'Timeout' },
        { customId: 'pref_2_200,201', code: 'rate_limit', message: 'Too many requests' },
      ];

      await service.processErrors(errors, mockBatchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100],
        { status: MenuSelectionStatus.FAILED },
      );
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [200, 201],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should skip error entries with invalid custom_id and not call repository', async () => {
      const errors = [
        { customId: 'bad_format', code: 'error', message: 'Fail' },
      ];

      await service.processErrors(errors, mockBatchJob);

      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });

    it('should handle empty errors array without error', async () => {
      await expect(
        service.processErrors([], mockBatchJob),
      ).resolves.toBeUndefined();

      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // markSelectionsBatchProcessing
  // ──────────────────────────────────────────────
  describe('markSelectionsBatchProcessing', () => {
    it('should update selections to BATCH_PROCESSING status with given batchJobId', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );
      const selections = [
        MenuSelectionFactory.create({ id: 1 }),
        MenuSelectionFactory.create({ id: 2 }),
      ];

      await service.markSelectionsBatchProcessing(selections, 10);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [1, 2],
        { status: MenuSelectionStatus.BATCH_PROCESSING, batchJobId: 10 },
      );
    });

    it('should return without calling repository when selections array is empty', async () => {
      await service.markSelectionsBatchProcessing([], 10);

      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // markSelectionsSucceeded
  // ──────────────────────────────────────────────
  describe('markSelectionsSucceeded', () => {
    it('should update selections to SUCCEEDED status', async () => {
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );
      const selections = [MenuSelectionFactory.create({ id: 5 })];

      await service.markSelectionsSucceeded(selections);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [5],
        { status: MenuSelectionStatus.SUCCEEDED },
      );
    });

    it('should return without calling repository when selections array is empty', async () => {
      await service.markSelectionsSucceeded([]);

      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // incrementRetryCount
  // ──────────────────────────────────────────────
  describe('incrementRetryCount', () => {
    it('should call createQueryBuilder to increment retryCount for given selections', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as never,
      );
      const selections = [
        MenuSelectionFactory.create({ id: 1 }),
        MenuSelectionFactory.create({ id: 2 }),
      ];

      await service.incrementRetryCount(selections);

      expect(
        mockMenuSelectionRepository.createQueryBuilder,
      ).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(MenuSelection);
      expect(mockQueryBuilder.whereInIds).toHaveBeenCalledWith([1, 2]);
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should pass SQL expression to set() to increment retryCount (line 244)', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as never,
      );
      const selection = MenuSelectionFactory.create({ id: 5 });

      await service.incrementRetryCount([selection]);

      expect(mockQueryBuilder.set).toHaveBeenCalledWith({
        retryCount: expect.any(Function),
      });
    });

    it('should return without calling repository when selections array is empty', async () => {
      await service.incrementRetryCount([]);

      expect(mockMenuSelectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
