import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PreferenceBatchResultProcessorService } from '../../services/preference-batch-result-processor.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { UserService } from '@/user/user.service';
import { BatchJob } from '../../entities/batch-job.entity';
import { BatchJobStatus } from '../../types/preference-batch.types';
import {
  createMockRepository,
  createMockUpdateResult,
} from '../../../../test/mocks/repository.mock';

describe('PreferenceBatchResultProcessorService', () => {
  let service: PreferenceBatchResultProcessorService;
  let mockMenuSelectionRepository: ReturnType<typeof createMockRepository>;
  let mockUserService: {
    findOne: jest.Mock;
  };
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

  const createMockQueryRunner = (
    overrides?: Partial<Record<string, jest.Mock>>,
  ) => ({
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
    },
    ...overrides,
  });

  beforeEach(async () => {
    mockMenuSelectionRepository = createMockRepository<MenuSelection>();

    mockUserService = {
      findOne: jest.fn(),
    };

    const mockQueryRunner = createMockQueryRunner();

    dataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchResultProcessorService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<PreferenceBatchResultProcessorService>(
      PreferenceBatchResultProcessorService,
    );
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('parseCustomId', () => {
    it('should parse valid custom_id with single selection', () => {
      const result = service.parseCustomId('pref_1_100');
      expect(result).toEqual({ userId: 1, selectionIds: [100] });
    });

    it('should parse valid custom_id with multiple selections', () => {
      const result = service.parseCustomId('pref_1_100,101,102');
      expect(result).toEqual({ userId: 1, selectionIds: [100, 101, 102] });
    });

    it('should return null for invalid format', () => {
      expect(service.parseCustomId('invalid_format')).toBeNull();
      expect(service.parseCustomId('pref_abc_100')).toBeNull();
      expect(service.parseCustomId('')).toBeNull();
    });
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
        preferences: null,
      };

      mockUserService.findOne.mockResolvedValue(mockUser);

      // Act
      await service.processResults(results, mockBatchJob);

      // Assert
      expect(mockUserService.findOne).toHaveBeenCalledWith(1);
      expect(dataSource.createQueryRunner).toHaveBeenCalled();
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
  });

  describe('processErrors', () => {
    it('should mark selections as FAILED for each error', async () => {
      // Arrange
      const errors = [
        { customId: 'pref_1_100', code: 'error', message: 'Failed' },
        { customId: 'pref_2_200', code: 'error', message: 'Failed' },
      ];

      mockMenuSelectionRepository.update.mockResolvedValue(
        createMockUpdateResult(1),
      );

      // Act
      await service.processErrors(errors, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([100], {
        status: MenuSelectionStatus.FAILED,
      });
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([200], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('should skip errors with invalid custom_id format', async () => {
      // Arrange
      const errors = [
        { customId: 'invalid_format', code: 'error', message: 'Failed' },
      ];

      // Act
      await service.processErrors(errors, mockBatchJob);

      // Assert
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });
});
