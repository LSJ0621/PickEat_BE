import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreferenceBatchService } from './preference-batch.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { UserService } from '@/user/user.service';
import { BatchJobService } from './batch-job.service';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { BatchJob } from '../entities/batch-job.entity';
import {
  createMockRepository,
  createMockQueryBuilder,
  createMockUpdateResult,
} from '../../../test/mocks/repository.mock';

describe('PreferenceBatchService', () => {
  let service: PreferenceBatchService;
  let mockMenuSelectionRepository: ReturnType<typeof createMockRepository>;
  let mockUserService: {
    findOne: jest.Mock;
    updateEntityPreferencesAnalysis: jest.Mock;
    getEntityPreferences: jest.Mock;
  };

  const mockBatchJob: BatchJob = {
    id: 1,
    openAiBatchId: 'batch_123',
    type: 'PREFERENCE_ANALYSIS' as any,
    status: 'PROCESSING' as any,
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
    mockMenuSelectionRepository = createMockRepository<MenuSelection>();

    mockUserService = {
      findOne: jest.fn(),
      updateEntityPreferencesAnalysis: jest.fn(),
      getEntityPreferences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: BatchJobService,
          useValue: {
            create: jest.fn(),
            updateStatus: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: OpenAiBatchClient,
          useValue: {
            isReady: jest.fn(),
            createBatchContent: jest.fn(),
            uploadBatchContent: jest.fn(),
            createBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PreferenceBatchService>(PreferenceBatchService);
  });

  describe('processResults', () => {
    it('should process results successfully when all data is valid', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100,101',
          JSON.stringify({ analysis: 'User likes spicy food' }),
        ],
      ]);

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        preferredLanguage: 'ko',
      };

      mockUserService.findOne.mockResolvedValue(mockUser);
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue(
        undefined,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockUserService.findOne).toHaveBeenCalledWith(1);
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food', {
        stablePatterns: undefined,
        recentSignals: undefined,
        diversityHints: undefined,
      });
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        { status: MenuSelectionStatus.SUCCEEDED },
      );
    });

    it('should mark selections as FAILED when exception occurs during processing', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100,101',
          JSON.stringify({ analysis: 'User likes spicy food' }),
        ],
      ]);

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        preferredLanguage: 'ko',
      };

      mockUserService.findOne.mockResolvedValue(mockUser);
      // Simulate exception during preference update
      mockUserService.updateEntityPreferencesAnalysis.mockRejectedValue(
        new Error('Database connection failed'),
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should mark selections as FAILED when user is not found', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100,101',
          JSON.stringify({ analysis: 'User likes spicy food' }),
        ],
      ]);

      mockUserService.findOne.mockRejectedValue(new Error('User not found'));
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should mark selections as FAILED when response format is invalid', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['pref_1_100,101', JSON.stringify({ invalid: 'format' })],
      ]);

      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should handle invalid custom_id format gracefully', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['invalid_format', JSON.stringify({ analysis: 'test' })],
      ]);

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockUserService.findOne).not.toHaveBeenCalled();
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors during result processing', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['pref_1_100,101', 'invalid json'],
      ]);

      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(2),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [100, 101],
        { status: MenuSelectionStatus.FAILED },
      );
    });

    it('should process multiple results correctly with mixed success and failure', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['pref_1_100', JSON.stringify({ analysis: 'Success 1' })],
        ['pref_2_200', JSON.stringify({ analysis: 'Success 2' })],
        ['pref_3_300', JSON.stringify({ invalid: 'format' })],
      ]);

      const mockUser1 = { id: 1, email: 'user1@test.com' };
      const mockUser2 = { id: 2, email: 'user2@test.com' };

      mockUserService.findOne
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(mockUser2);
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue(
        undefined,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockUserService.findOne).toHaveBeenCalledTimes(2);
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledTimes(2);

      // Check SUCCEEDED calls
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.SUCCEEDED,
      });
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([200], {
        status: MenuSelectionStatus.SUCCEEDED,
      });

      // Check FAILED call
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([300], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('should handle analysis field as non-string value', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['pref_1_100', JSON.stringify({ analysis: 123 })],
      ]);

      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('should trim analysis string before saving', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100',
          JSON.stringify({ analysis: '  User likes spicy food  ' }),
        ],
      ]);

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        preferredLanguage: 'ko',
      };

      mockUserService.findOne.mockResolvedValue(mockUser);
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue(
        undefined,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food', {
        stablePatterns: undefined,
        recentSignals: undefined,
        diversityHints: undefined,
      });
    });
  });

  describe('collectFailedSelectionsForRetry', () => {
    it('should collect failed selections with retryCount less than maxRetries', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      const failedSelections: Partial<MenuSelection>[] = [
        {
          id: 1,
          retryCount: 0,
          status: MenuSelectionStatus.FAILED,
          user: { id: 1, email: 'test@test.com' } as any,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(
        failedSelections as MenuSelection[],
      );
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      // Act
      const result = await service.collectFailedSelectionsForRetry(3);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'selection.status = :status',
        { status: MenuSelectionStatus.FAILED },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'selection.retryCount < :maxRetries',
        { maxRetries: 3 },
      );
    });
  });

  describe('buildBatchRequests', () => {
    it('should include statistics in batch requests', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        preferredLanguage: 'ko',
      } as any;

      const groups = [
        {
          user: mockUser,
          selections: [
            { id: 100, selectedDate: '2024-01-15' } as MenuSelection,
          ],
          slotMenus: {
            breakfast: [],
            lunch: ['김치찌개'],
            dinner: [],
            etc: [],
          },
        },
      ];

      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: ['한식'],
        dislikes: [],
        analysis: '한식을 좋아하십니다.',
      });

      // Mock statistics calculation
      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getRawOne.mockResolvedValue({ count: '10' });
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.buildBatchRequests(groups);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].userPrompt).toContain('[Selection Statistics]');
      expect(result[0].userPrompt).toContain('Total selection days:');
      expect(result[0].userPrompt).toContain('Recent repeats (7d):');
      expect(result[0].userPrompt).toContain('New trials (7d):');
    });

    it('should skip groups with no menus', async () => {
      // Arrange
      const groups = [
        {
          user: { id: 1, email: 'test@test.com' } as any,
          selections: [{ id: 100 } as MenuSelection],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        },
      ];

      // Act
      const result = await service.buildBatchRequests(groups);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should build custom_id with correct format', async () => {
      // Arrange
      const mockUser = {
        id: 5,
        email: 'test@test.com',
        preferredLanguage: 'ko',
      } as any;

      const groups = [
        {
          user: mockUser,
          selections: [
            { id: 100, selectedDate: '2024-01-15' } as MenuSelection,
            { id: 101, selectedDate: '2024-01-16' } as MenuSelection,
          ],
          slotMenus: {
            breakfast: [],
            lunch: ['김치찌개'],
            dinner: [],
            etc: [],
          },
        },
      ];

      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: undefined,
      });

      const mockQueryBuilder = createMockQueryBuilder<MenuSelection>();
      mockQueryBuilder.getRawOne.mockResolvedValue({ count: '0' });
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.buildBatchRequests(groups);

      // Assert
      expect(result[0].customId).toBe('pref_5_100,101');
      expect(result[0].userId).toBe(5);
      expect(result[0].selectionIds).toEqual([100, 101]);
    });
  });

  describe('processResults with structuredAnalysis', () => {
    it('should pass structuredAnalysis to updateEntityPreferencesAnalysis when provided', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100',
          JSON.stringify({
            analysis: 'User likes Korean food',
            stablePatterns: {
              categories: ['한식', '국물요리'],
              flavors: ['담백한'],
              cookingMethods: ['찌개', '국'],
              confidence: 'high',
            },
            recentSignals: {
              trending: ['중식'],
              declining: [],
            },
            diversityHints: {
              explorationAreas: ['일식'],
              rotationSuggestions: ['양식'],
            },
          }),
        ],
      ]);

      const mockUser = { id: 1, email: 'test@example.com' };

      mockUserService.findOne.mockResolvedValue(mockUser);
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue(
        undefined,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledWith(mockUser, 'User likes Korean food', {
        stablePatterns: {
          categories: ['한식', '국물요리'],
          flavors: ['담백한'],
          cookingMethods: ['찌개', '국'],
          confidence: 'high',
        },
        recentSignals: {
          trending: ['중식'],
          declining: [],
        },
        diversityHints: {
          explorationAreas: ['일식'],
          rotationSuggestions: ['양식'],
        },
      });
    });

    it('should handle results without structuredAnalysis', async () => {
      // Arrange
      const results = new Map<string, string>([
        ['pref_1_100', JSON.stringify({ analysis: 'User likes spicy food' })],
      ]);

      const mockUser = { id: 1, email: 'test@example.com' };

      mockUserService.findOne.mockResolvedValue(mockUser);
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue(
        undefined,
      );
      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food', {
        stablePatterns: undefined,
        recentSignals: undefined,
        diversityHints: undefined,
      });
    });
  });
});
