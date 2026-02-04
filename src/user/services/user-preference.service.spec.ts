import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferenceService } from './user-preference.service';
import { User } from '../entities/user.entity';
import { defaultUserPreferences } from '../interfaces/user-preferences.interface';

describe('UserPreferenceService', () => {
  let service: UserPreferenceService;
  let mockUserRepository: jest.Mocked<Repository<User>>;

  const createMockUser = (preferences?: any): User => {
    return {
      id: 1,
      email: 'test@example.com',
      password: 'hashed',
      role: 'USER',
      preferences,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
  };

  beforeEach(async () => {
    mockUserRepository = {
      save: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferenceService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UserPreferenceService>(UserPreferenceService);
  });

  describe('getPreferences', () => {
    it('should return user preferences when they exist', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식', '국물요리'],
        dislikes: ['초밥'],
        analysis: '한식을 좋아하십니다.',
        structuredAnalysis: {
          stablePatterns: {
            categories: ['한식'],
            flavors: ['담백한'],
            cookingMethods: ['찌개'],
            confidence: 'high' as const,
          },
          recentSignals: {
            trending: [],
            declining: [],
          },
          diversityHints: {
            explorationAreas: [],
            rotationSuggestions: [],
          },
        },
        lastAnalyzedAt: '2024-01-15T10:00:00Z',
        analysisVersion: 5,
      });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result.likes).toEqual(['한식', '국물요리']);
      expect(result.dislikes).toEqual(['초밥']);
      expect(result.analysis).toBe('한식을 좋아하십니다.');
      expect(result.structuredAnalysis).toEqual({
        stablePatterns: {
          categories: ['한식'],
          flavors: ['담백한'],
          cookingMethods: ['찌개'],
          confidence: 'high',
        },
        recentSignals: {
          trending: [],
          declining: [],
        },
        diversityHints: {
          explorationAreas: [],
          rotationSuggestions: [],
        },
      });
      expect(result.lastAnalyzedAt).toBe('2024-01-15T10:00:00Z');
      expect(result.analysisVersion).toBe(5);
    });

    it('should return default preferences when user preferences is null', async () => {
      // Arrange
      const user = createMockUser(null);

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result.likes).toEqual([]);
      expect(result.dislikes).toEqual([]);
      expect(result.analysis).toBeUndefined();
      expect(result.structuredAnalysis).toBeUndefined();
      expect(result.lastAnalyzedAt).toBeUndefined();
      expect(result.analysisVersion).toBeUndefined();
    });

    it('should return default preferences when user preferences is undefined', async () => {
      // Arrange
      const user = createMockUser(undefined);

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result.likes).toEqual([]);
      expect(result.dislikes).toEqual([]);
      expect(result.analysis).toBeUndefined();
    });

    it('should handle partial preferences with missing fields', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식'],
      });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result.likes).toEqual(['한식']);
      expect(result.dislikes).toEqual([]);
      expect(result.analysis).toBeUndefined();
      expect(result.structuredAnalysis).toBeUndefined();
    });
  });

  describe('updatePreferences', () => {
    it('should update likes and dislikes', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['한식', '국물요리'];
      const dislikes = ['초밥', '회'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(user.preferences).toEqual({
        likes: ['한식', '국물요리'],
        dislikes: ['초밥', '회'],
        analysis: undefined,
        structuredAnalysis: undefined,
        lastAnalyzedAt: undefined,
        analysisVersion: undefined,
      });
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
      expect(result.likes).toEqual(likes);
      expect(result.dislikes).toEqual(dislikes);
    });

    it('should preserve existing analysis when updating preferences', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식'],
        dislikes: [],
        analysis: '기존 분석',
        structuredAnalysis: {
          stablePatterns: {
            categories: ['한식'],
            flavors: [],
            cookingMethods: [],
            confidence: 'medium' as const,
          },
          recentSignals: { trending: [], declining: [] },
          diversityHints: { explorationAreas: [], rotationSuggestions: [] },
        },
        lastAnalyzedAt: '2024-01-10T10:00:00Z',
        analysisVersion: 3,
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, ['중식'], ['일식']);

      // Assert
      expect(user.preferences!.likes).toEqual(['중식']);
      expect(user.preferences!.dislikes).toEqual(['일식']);
      expect(user.preferences!.analysis).toBe('기존 분석');
      expect(user.preferences!.structuredAnalysis).toEqual({
        stablePatterns: {
          categories: ['한식'],
          flavors: [],
          cookingMethods: [],
          confidence: 'medium',
        },
        recentSignals: { trending: [], declining: [] },
        diversityHints: { explorationAreas: [], rotationSuggestions: [] },
      });
      expect(user.preferences!.lastAnalyzedAt).toBe('2024-01-10T10:00:00Z');
      expect(user.preferences!.analysisVersion).toBe(3);
    });

    it('should normalize tags by trimming whitespace', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['  한식  ', '국물요리', '  '];
      const dislikes = ['  초밥  '];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '국물요리']);
      expect(user.preferences!.dislikes).toEqual(['초밥']);
    });

    it('should remove duplicate tags', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['한식', '한식', '국물요리'];
      const dislikes = ['초밥', '초밥'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '국물요리']);
      expect(user.preferences!.dislikes).toEqual(['초밥']);
    });

    it('should filter out empty strings', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['한식', '', '국물요리', '   '];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, likes, []);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '국물요리']);
    });

    it('should only update likes when dislikes is undefined', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식'],
        dislikes: ['초밥'],
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, ['중식'], undefined);

      // Assert
      expect(user.preferences!.likes).toEqual(['중식']);
      expect(user.preferences!.dislikes).toEqual(['초밥']);
    });

    it('should only update dislikes when likes is undefined', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식'],
        dislikes: ['초밥'],
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, undefined, ['회']);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식']);
      expect(user.preferences!.dislikes).toEqual(['회']);
    });
  });

  describe('updatePreferencesAnalysis', () => {
    it('should update analysis and structuredAnalysis when all fields provided', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식'],
        dislikes: [],
        analysis: '기존 분석',
        analysisVersion: 2,
      });

      const newAnalysis = '한식, 특히 국물요리를 좋아하십니다.';
      const structuredAnalysis = {
        stablePatterns: {
          categories: ['한식', '국물요리'],
          flavors: ['담백한'],
          cookingMethods: ['찌개', '국'],
          confidence: 'high' as const,
        },
        recentSignals: {
          trending: ['중식'],
          declining: [],
        },
        diversityHints: {
          explorationAreas: ['일식'],
          rotationSuggestions: ['양식'],
        },
      };

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(
        user,
        newAnalysis,
        structuredAnalysis,
      );

      // Assert
      expect(user.preferences!.analysis).toBe(
        '한식, 특히 국물요리를 좋아하십니다.',
      );
      expect(user.preferences!.structuredAnalysis).toEqual({
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
      expect(user.preferences!.analysisVersion).toBe(3);
      expect(user.preferences!.lastAnalyzedAt).toBeDefined();
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
      expect(result.analysis).toBe('한식, 특히 국물요리를 좋아하십니다.');
    });

    it('should preserve existing likes and dislikes', async () => {
      // Arrange
      const user = createMockUser({
        likes: ['한식', '국물요리'],
        dislikes: ['초밥'],
        analysis: '기존 분석',
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '새로운 분석');

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '국물요리']);
      expect(user.preferences!.dislikes).toEqual(['초밥']);
      expect(user.preferences!.analysis).toBe('새로운 분석');
    });

    it('should trim analysis text', async () => {
      // Arrange
      const user = createMockUser(null);

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '  한식을 좋아하십니다.  ');

      // Assert
      expect(user.preferences!.analysis).toBe('한식을 좋아하십니다.');
    });

    it('should increment analysisVersion from 0 when undefined', async () => {
      // Arrange
      const user = createMockUser({
        likes: [],
        dislikes: [],
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '첫 분석');

      // Assert
      expect(user.preferences!.analysisVersion).toBe(1);
    });

    it('should set lastAnalyzedAt to current date', async () => {
      // Arrange
      const user = createMockUser(null);
      const beforeTime = new Date().toISOString();

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '분석');

      const afterTime = new Date().toISOString();

      // Assert
      expect(user.preferences!.lastAnalyzedAt).toBeDefined();
      expect(user.preferences!.lastAnalyzedAt! >= beforeTime).toBe(true);
      expect(user.preferences!.lastAnalyzedAt! <= afterTime).toBe(true);
    });

    it('should not update structuredAnalysis when any required field is missing', async () => {
      // Arrange
      const user = createMockUser({
        likes: [],
        dislikes: [],
        structuredAnalysis: {
          stablePatterns: {
            categories: ['기존'],
            flavors: [],
            cookingMethods: [],
            confidence: 'low' as const,
          },
          recentSignals: { trending: [], declining: [] },
          diversityHints: { explorationAreas: [], rotationSuggestions: [] },
        },
      });

      const incompleteStructured = {
        stablePatterns: {
          categories: ['한식'],
          flavors: [],
          cookingMethods: [],
          confidence: 'high' as const,
        },
        // Missing recentSignals and diversityHints
      };

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(
        user,
        '새 분석',
        incompleteStructured as any,
      );

      // Assert
      expect(user.preferences!.structuredAnalysis).toEqual({
        stablePatterns: {
          categories: ['기존'],
          flavors: [],
          cookingMethods: [],
          confidence: 'low',
        },
        recentSignals: { trending: [], declining: [] },
        diversityHints: { explorationAreas: [], rotationSuggestions: [] },
      });
    });

    it('should update structuredAnalysis when structuredAnalysis is not provided', async () => {
      // Arrange
      const user = createMockUser({
        likes: [],
        dislikes: [],
        structuredAnalysis: {
          stablePatterns: {
            categories: ['기존'],
            flavors: [],
            cookingMethods: [],
            confidence: 'low' as const,
          },
          recentSignals: { trending: [], declining: [] },
          diversityHints: { explorationAreas: [], rotationSuggestions: [] },
        },
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '새 분석');

      // Assert
      expect(user.preferences!.structuredAnalysis).toEqual({
        stablePatterns: {
          categories: ['기존'],
          flavors: [],
          cookingMethods: [],
          confidence: 'low',
        },
        recentSignals: { trending: [], declining: [] },
        diversityHints: { explorationAreas: [], rotationSuggestions: [] },
      });
    });

    it('should update structuredAnalysis to undefined when current preferences has no structuredAnalysis and new one is not provided', async () => {
      // Arrange
      const user = createMockUser({
        likes: [],
        dislikes: [],
      });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(user, '분석');

      // Assert
      expect(user.preferences!.structuredAnalysis).toBeUndefined();
    });

    it('should handle empty current preferences', async () => {
      // Arrange
      const user = createMockUser(null);

      const structuredAnalysis = {
        stablePatterns: {
          categories: ['한식'],
          flavors: [],
          cookingMethods: [],
          confidence: 'medium' as const,
        },
        recentSignals: {
          trending: [],
          declining: [],
        },
        diversityHints: {
          explorationAreas: [],
          rotationSuggestions: [],
        },
      };

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(
        user,
        '첫 분석',
        structuredAnalysis,
      );

      // Assert
      expect(user.preferences).toEqual({
        likes: [],
        dislikes: [],
        analysis: '첫 분석',
        structuredAnalysis,
        lastAnalyzedAt: expect.any(String),
        analysisVersion: 1,
      });
    });

    it('should preserve all three structuredAnalysis fields when provided', async () => {
      // Arrange
      const user = createMockUser(null);

      const structuredAnalysis = {
        stablePatterns: {
          categories: ['한식', '중식'],
          flavors: ['매운맛', '담백한맛'],
          cookingMethods: ['찌개', '볶음'],
          confidence: 'high' as const,
        },
        recentSignals: {
          trending: ['일식', '양식'],
          declining: ['분식'],
        },
        diversityHints: {
          explorationAreas: ['태국음식', '베트남음식'],
          rotationSuggestions: ['이탈리안', '멕시칸'],
        },
      };

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferencesAnalysis(
        user,
        '상세 분석',
        structuredAnalysis,
      );

      // Assert
      expect(user.preferences!.structuredAnalysis).toEqual(structuredAnalysis);
      expect(user.preferences!.structuredAnalysis!.stablePatterns).toEqual({
        categories: ['한식', '중식'],
        flavors: ['매운맛', '담백한맛'],
        cookingMethods: ['찌개', '볶음'],
        confidence: 'high',
      });
      expect(user.preferences!.structuredAnalysis!.recentSignals).toEqual({
        trending: ['일식', '양식'],
        declining: ['분식'],
      });
      expect(user.preferences!.structuredAnalysis!.diversityHints).toEqual({
        explorationAreas: ['태국음식', '베트남음식'],
        rotationSuggestions: ['이탈리안', '멕시칸'],
      });
    });
  });

  describe('normalizeTags (private method via updatePreferences)', () => {
    it('should handle null values in tags array', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['한식', null as any, '중식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, likes, []);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '중식']);
    });

    it('should handle undefined values in tags array', async () => {
      // Arrange
      const user = createMockUser(null);
      const likes = ['한식', undefined as any, '중식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, likes, []);

      // Assert
      expect(user.preferences!.likes).toEqual(['한식', '중식']);
    });

    it('should handle empty array', async () => {
      // Arrange
      const user = createMockUser(null);

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePreferences(user, [], []);

      // Assert
      expect(user.preferences!.likes).toEqual([]);
      expect(user.preferences!.dislikes).toEqual([]);
    });
  });
});
