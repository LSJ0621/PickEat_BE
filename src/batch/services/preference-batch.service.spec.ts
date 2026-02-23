import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreferenceBatchService } from './preference-batch.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { UserService } from '@/user/user.service';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
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
  let mockUserTasteAnalysisService: {
    upsert: jest.Mock;
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

    mockUserTasteAnalysisService = {
      upsert: jest.fn().mockResolvedValue(undefined),
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
          provide: UserTasteAnalysisService,
          useValue: mockUserTasteAnalysisService,
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
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food');
      expect(mockUserTasteAnalysisService.upsert).toHaveBeenCalledWith(1, {
        stablePatterns: null,
        recentSignals: null,
        diversityHints: null,
        compactSummary: null,
        analysisParagraphs: null,
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
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food');
    });
  });

  describe('processResults with structuredAnalysis', () => {
    it('should pass structuredAnalysis to userTasteAnalysisService when provided', async () => {
      // Arrange
      const results = new Map<string, string>([
        [
          'pref_1_100',
          JSON.stringify({
            analysis: 'User likes Korean food',
            compactSummary: 'Likes Korean food',
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
      ).toHaveBeenCalledWith(mockUser, 'User likes Korean food');
      expect(mockUserTasteAnalysisService.upsert).toHaveBeenCalledWith(1, {
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
        compactSummary: 'Likes Korean food',
        analysisParagraphs: null,
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
      ).toHaveBeenCalledWith(mockUser, 'User likes spicy food');
      expect(mockUserTasteAnalysisService.upsert).toHaveBeenCalledWith(1, {
        stablePatterns: null,
        recentSignals: null,
        diversityHints: null,
        compactSummary: null,
        analysisParagraphs: null,
      });
    });
  });
});
