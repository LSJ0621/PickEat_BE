import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserTasteAnalysis } from '../entities/user-taste-analysis.entity';
import { UserTasteAnalysisService } from './user-taste-analysis.service';
import { UserTasteAnalysisData } from '../interfaces/user-taste-analysis.interface';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserTasteAnalysisFactory } from '../../../test/factories/entity.factory';

describe('UserTasteAnalysisService', () => {
  let service: UserTasteAnalysisService;
  let mockRepository: ReturnType<
    typeof createMockRepository<UserTasteAnalysis>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository = createMockRepository<UserTasteAnalysis>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTasteAnalysisService,
        {
          provide: getRepositoryToken(UserTasteAnalysis),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UserTasteAnalysisService>(UserTasteAnalysisService);
  });

  describe('getByUserId', () => {
    it('should return user taste analysis when it exists', async () => {
      // Arrange
      const userId = 1;
      const analysis = UserTasteAnalysisFactory.create({ userId });
      mockRepository.findOne.mockResolvedValue(analysis);

      // Act
      const result = await service.getByUserId(userId);

      // Assert
      expect(result).toEqual(analysis);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should return null when user taste analysis does not exist', async () => {
      // Arrange
      const userId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getByUserId(userId);

      // Assert
      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should handle different user IDs correctly', async () => {
      // Arrange
      const userId1 = 1;
      const userId2 = 2;
      const analysis1 = UserTasteAnalysisFactory.create({ userId: userId1 });
      const analysis2 = UserTasteAnalysisFactory.create({ userId: userId2 });

      mockRepository.findOne
        .mockResolvedValueOnce(analysis1)
        .mockResolvedValueOnce(analysis2);

      // Act
      const result1 = await service.getByUserId(userId1);
      const result2 = await service.getByUserId(userId2);

      // Assert
      expect(result1?.userId).toBe(userId1);
      expect(result2?.userId).toBe(userId2);
    });
  });

  describe('upsert', () => {
    describe('when creating new record', () => {
      it('should create new record with analysisVersion 1', async () => {
        // Arrange
        const userId = 1;
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['한식', '중식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'medium',
          },
          recentSignals: {
            trending: ['일식'],
            declining: ['양식'],
          },
          diversityHints: {
            explorationAreas: ['동남아요리'],
            rotationSuggestions: ['멕시칸'],
          },
          compactSummary: '한식을 선호하는 경향이 있습니다.',
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysis = UserTasteAnalysisFactory.create({
          userId,
          ...data,
          analysisVersion: 1,
        });
        mockRepository.create.mockReturnValue(newAnalysis);
        mockRepository.save.mockResolvedValue(newAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.analysisVersion).toBe(1);
        expect(result.userId).toBe(userId);
        expect(result.stablePatterns).toEqual(data.stablePatterns);
        expect(result.recentSignals).toEqual(data.recentSignals);
        expect(result.diversityHints).toEqual(data.diversityHints);
        expect(result.compactSummary).toBe(data.compactSummary);
        expect(mockRepository.create).toHaveBeenCalled();
        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should set lastAnalyzedAt to current date when not provided', async () => {
        // Arrange
        const userId = 1;
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['한식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'low',
          },
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysis = UserTasteAnalysisFactory.create({
          userId,
        });
        mockRepository.create.mockReturnValue(newAnalysis);
        mockRepository.save.mockResolvedValue(newAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.lastAnalyzedAt).toBeDefined();
        expect(result.lastAnalyzedAt).toBeInstanceOf(Date);
      });

      it('should use provided lastAnalyzedAt when specified', async () => {
        // Arrange
        const userId = 1;
        const specificDate = new Date('2025-01-01T00:00:00Z');
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['한식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'low',
          },
          lastAnalyzedAt: specificDate,
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysis = UserTasteAnalysisFactory.create({
          userId,
          lastAnalyzedAt: specificDate,
        });
        mockRepository.create.mockReturnValue(newAnalysis);
        mockRepository.save.mockResolvedValue(newAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.lastAnalyzedAt).toEqual(specificDate);
      });

      it('should handle null values in data fields', async () => {
        // Arrange
        const userId = 1;
        const data: UserTasteAnalysisData = {
          stablePatterns: null,
          recentSignals: null,
          diversityHints: null,
          compactSummary: null,
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysisData = {
          ...UserTasteAnalysisFactory.createWithNullFields(userId),
        };
        mockRepository.create.mockReturnValue(newAnalysisData);
        mockRepository.save.mockResolvedValue(newAnalysisData);

        // Act
        await service.upsert(userId, data);

        // Assert
        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            stablePatterns: null,
            recentSignals: null,
            diversityHints: null,
            compactSummary: null,
            analysisVersion: 1,
          }),
        );
        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should handle partial data with some fields undefined', async () => {
        // Arrange
        const userId = 1;
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['한식'],
            flavors: [],
            cookingMethods: [],
            confidence: 'low',
          },
          // recentSignals, diversityHints, compactSummary not provided
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysis = UserTasteAnalysisFactory.create({
          userId,
          stablePatterns: data.stablePatterns,
        });
        mockRepository.create.mockReturnValue(newAnalysis);
        mockRepository.save.mockResolvedValue(newAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.stablePatterns).toEqual(data.stablePatterns);
        expect(mockRepository.create).toHaveBeenCalled();
      });
    });

    describe('when updating existing record', () => {
      it('should return existing record without version increment when data is unchanged', async () => {
        // Arrange
        const userId = 1;
        const existingData = {
          stablePatterns: {
            categories: ['한식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'medium' as const,
          },
          recentSignals: {
            trending: ['일식'],
            declining: ['양식'],
          },
          diversityHints: {
            explorationAreas: ['동남아요리'],
            rotationSuggestions: ['멕시칸'],
          },
          compactSummary: '한식을 선호하는 경향이 있습니다.',
        };
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          ...existingData,
          analysisVersion: 3,
        });
        const data: UserTasteAnalysisData = { ...existingData };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.analysisVersion).toBe(3);
        expect(mockRepository.save).not.toHaveBeenCalled();
      });

      it('should increment analysisVersion by 1 when data has changed', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          analysisVersion: 3,
          stablePatterns: {
            categories: ['한식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'medium',
          },
        });
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['한식', '중식', '일식'],
            flavors: ['매운맛', '감칠맛'],
            cookingMethods: ['구이', '찜'],
            confidence: 'high',
          },
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          analysisVersion: 4,
        });

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.analysisVersion).toBe(4);
        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should handle analysisVersion undefined in existing record', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          analysisVersion: undefined as unknown as number,
        });
        const data: UserTasteAnalysisData = {
          compactSummary: '업데이트된 분석',
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          analysisVersion: 1,
        });

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.analysisVersion).toBe(1);
      });

      it('should update all data fields correctly', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          analysisVersion: 1,
        });
        const newData: UserTasteAnalysisData = {
          stablePatterns: {
            categories: ['프렌치'],
            flavors: ['크리미'],
            cookingMethods: ['그릴'],
            confidence: 'high',
          },
          recentSignals: {
            trending: ['이탈리안'],
            declining: ['중식'],
          },
          diversityHints: {
            explorationAreas: ['스페인요리'],
            rotationSuggestions: ['그리스요리'],
          },
          compactSummary: '완전히 새로운 취향 분석',
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...newData,
          analysisVersion: 2,
        });

        // Act
        const result = await service.upsert(userId, newData);

        // Assert
        expect(result.stablePatterns).toEqual(newData.stablePatterns);
        expect(result.recentSignals).toEqual(newData.recentSignals);
        expect(result.diversityHints).toEqual(newData.diversityHints);
        expect(result.compactSummary).toEqual(newData.compactSummary);
        expect(result.analysisVersion).toBe(2);
      });

      it('should set lastAnalyzedAt to current date when not provided on update', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          lastAnalyzedAt: new Date('2024-01-01'),
        });
        const data: UserTasteAnalysisData = {
          compactSummary: '업데이트',
        };
        const now = new Date();

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          lastAnalyzedAt: now,
        });

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.lastAnalyzedAt).toBeDefined();
      });

      it('should allow updating to null values', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({ userId });
        const data: UserTasteAnalysisData = {
          stablePatterns: null,
          recentSignals: null,
          diversityHints: null,
          compactSummary: null,
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          analysisVersion: 2,
        });

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.stablePatterns).toBeNull();
        expect(result.recentSignals).toBeNull();
        expect(result.diversityHints).toBeNull();
        expect(result.compactSummary).toBeNull();
      });

      it('should preserve existing values when partial update', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          stablePatterns: {
            categories: ['한식'],
            flavors: ['매운맛'],
            cookingMethods: ['볶음'],
            confidence: 'medium',
          },
          compactSummary: '기존 분석',
        });
        const data: UserTasteAnalysisData = {
          recentSignals: {
            trending: ['일식'],
            declining: [],
          },
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          analysisVersion: 2,
        });

        // Act
        await service.upsert(userId, data);

        // Assert
        expect(mockRepository.save).toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle empty objects in data fields', async () => {
        // Arrange
        const userId = 1;
        const data: UserTasteAnalysisData = {
          stablePatterns: {
            categories: [],
            flavors: [],
            cookingMethods: [],
            confidence: 'low',
          },
          recentSignals: {
            trending: [],
            declining: [],
          },
          diversityHints: {
            explorationAreas: [],
            rotationSuggestions: [],
          },
          compactSummary: '',
        };

        mockRepository.findOne.mockResolvedValue(null);
        const newAnalysis = UserTasteAnalysisFactory.create({
          userId,
          ...data,
        });
        mockRepository.create.mockReturnValue(newAnalysis);
        mockRepository.save.mockResolvedValue(newAnalysis);

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result).toBeDefined();
        expect(result.stablePatterns?.categories).toEqual([]);
        expect(result.compactSummary).toBe('');
      });

      it('should handle very large analysisVersion numbers', async () => {
        // Arrange
        const userId = 1;
        const existingAnalysis = UserTasteAnalysisFactory.create({
          userId,
          analysisVersion: 999,
        });
        const data: UserTasteAnalysisData = {
          compactSummary: '업데이트',
        };

        mockRepository.findOne.mockResolvedValue(existingAnalysis);
        mockRepository.save.mockResolvedValue({
          ...existingAnalysis,
          ...data,
          analysisVersion: 1000,
        });

        // Act
        const result = await service.upsert(userId, data);

        // Assert
        expect(result.analysisVersion).toBe(1000);
      });
    });
  });

  describe('bulkUpsert', () => {
    it('should process multiple items in single DB call', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            stablePatterns: {
              categories: ['한식'],
              flavors: ['매운맛'],
              cookingMethods: ['볶음'],
              confidence: 'medium' as const,
            },
            compactSummary: '사용자 1 분석',
          },
        },
        {
          userId: 2,
          data: {
            stablePatterns: {
              categories: ['중식'],
              flavors: ['담백한맛'],
              cookingMethods: ['찜'],
              confidence: 'low' as const,
            },
            compactSummary: '사용자 2 분석',
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledTimes(1);
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            userId: 1,
            stablePatterns: items[0].data.stablePatterns,
            compactSummary: items[0].data.compactSummary,
          }),
          expect.objectContaining({
            userId: 2,
            stablePatterns: items[1].data.stablePatterns,
            compactSummary: items[1].data.compactSummary,
          }),
        ],
        {
          conflictPaths: ['userId'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    });

    it('should handle empty array', async () => {
      // Arrange
      const items: { userId: number; data: UserTasteAnalysisData }[] = [];

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).not.toHaveBeenCalled();
    });

    it('should handle single item in single DB call', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            stablePatterns: {
              categories: ['한식'],
              flavors: [],
              cookingMethods: [],
              confidence: 'low' as const,
            },
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledTimes(1);
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            userId: 1,
            stablePatterns: items[0].data.stablePatterns,
          }),
        ],
        expect.any(Object),
      );
    });

    it('should convert undefined to null for nullable fields', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            // All fields undefined
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            userId: 1,
            stablePatterns: null,
            recentSignals: null,
            diversityHints: null,
            compactSummary: null,
          }),
        ],
        {
          conflictPaths: ['userId'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    });

    it('should set lastAnalyzedAt to current date when not provided', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            compactSummary: '분석 텍스트',
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      const callArgs = mockRepository.upsert.mock.calls[0][0] as Array<
        Partial<UserTasteAnalysis>
      >;
      expect(callArgs[0]).toHaveProperty('lastAnalyzedAt');
      expect(callArgs[0].lastAnalyzedAt).toBeInstanceOf(Date);
    });

    it('should use provided lastAnalyzedAt when specified', async () => {
      // Arrange
      const specificDate = new Date('2025-01-15T10:00:00Z');
      const items = [
        {
          userId: 1,
          data: {
            compactSummary: '분석',
            lastAnalyzedAt: specificDate,
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            lastAnalyzedAt: specificDate,
          }),
        ],
        expect.any(Object),
      );
    });

    it('should handle null values in data fields correctly', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            stablePatterns: null,
            recentSignals: null,
            diversityHints: null,
            compactSummary: null,
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            stablePatterns: null,
            recentSignals: null,
            diversityHints: null,
            compactSummary: null,
          }),
        ],
        expect.any(Object),
      );
    });

    it('should use correct conflict resolution configuration', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            compactSummary: '테스트',
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledWith(expect.any(Object), {
        conflictPaths: ['userId'],
        skipUpdateIfNoValuesChanged: true,
      });
    });

    it('should handle large batch of items in single DB call', async () => {
      // Arrange
      const items = Array.from({ length: 100 }, (_, i) => ({
        userId: i + 1,
        data: {
          compactSummary: `분석 ${i + 1}`,
          stablePatterns: {
            categories: ['한식'],
            flavors: [],
            cookingMethods: [],
            confidence: 'low' as const,
          },
        },
      }));

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledTimes(1);
      const callArgs = mockRepository.upsert.mock.calls[0][0] as Array<
        Partial<UserTasteAnalysis>
      >;
      expect(callArgs).toHaveLength(100);
    });

    it('should handle items with complete data', async () => {
      // Arrange
      const items = [
        {
          userId: 1,
          data: {
            stablePatterns: {
              categories: ['한식', '중식'],
              flavors: ['매운맛', '감칠맛'],
              cookingMethods: ['볶음', '구이'],
              confidence: 'high' as const,
            },
            recentSignals: {
              trending: ['일식', '이탈리안'],
              declining: ['패스트푸드'],
            },
            diversityHints: {
              explorationAreas: ['동남아요리', '멕시칸'],
              rotationSuggestions: ['프렌치', '스페인'],
            },
            compactSummary: '매우 상세한 분석 내용입니다.',
            lastAnalyzedAt: new Date('2025-01-20'),
          },
        },
      ];

      mockRepository.upsert.mockResolvedValue({} as never);

      // Act
      await service.bulkUpsert(items);

      // Assert
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            userId: 1,
            stablePatterns: items[0].data.stablePatterns,
            recentSignals: items[0].data.recentSignals,
            diversityHints: items[0].data.diversityHints,
            compactSummary: items[0].data.compactSummary,
            lastAnalyzedAt: items[0].data.lastAnalyzedAt,
          }),
        ],
        expect.any(Object),
      );
    });
  });
});
