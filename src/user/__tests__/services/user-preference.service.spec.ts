import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserPreferenceService } from '../../services/user-preference.service';
import { User } from '../../entities/user.entity';
import { UserPreferences } from '../../interfaces/user-preferences.interface';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  UserPreferencesFactory,
} from '../../../../test/factories/entity.factory';

describe('UserPreferenceService', () => {
  let service: UserPreferenceService;
  let mockUserRepository: ReturnType<typeof createMockRepository<User>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserRepository = createMockRepository<User>();

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
      const preferences = UserPreferencesFactory.create({
        likes: ['한식', '중식'],
        dislikes: ['양식'],
      });
      const user = UserFactory.create({ preferences });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result).toEqual(preferences);
    });

    it('should return default preferences when user has no preferences', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result).toEqual({
        likes: [],
        dislikes: [],
        analysis: undefined,
      });
    });

    it('should return preferences with analysis when it exists', async () => {
      // Arrange
      const preferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: ['양식'],
      });
      preferences.analysis = '한식을 선호하시는 경향이 있습니다.';
      const user = UserFactory.create({ preferences });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result).toEqual(preferences);
      expect(result.analysis).toBe('한식을 선호하시는 경향이 있습니다.');
    });

    it('should handle empty likes and dislikes arrays', async () => {
      // Arrange
      const preferences: UserPreferences = {
        likes: null as unknown as string[],
        dislikes: null as unknown as string[],
        analysis: undefined,
      };
      const user = UserFactory.create({ preferences });

      // Act
      const result = await service.getPreferences(user);

      // Assert
      expect(result.likes).toEqual([]);
      expect(result.dislikes).toEqual([]);
    });
  });

  describe('updatePreferences', () => {
    it('should update both likes and dislikes when provided', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const newLikes = ['한식', '중식', '일식'];
      const newDislikes = ['양식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(
        user,
        newLikes,
        newDislikes,
      );

      // Assert
      expect(result.likes).toEqual(newLikes);
      expect(result.dislikes).toEqual(newDislikes);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should update only likes when dislikes is undefined', async () => {
      // Arrange
      const existingPreferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: ['양식'],
      });
      const user = UserFactory.create({ preferences: existingPreferences });
      const newLikes = ['중식', '일식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, newLikes, undefined);

      // Assert
      expect(result.likes).toEqual(newLikes);
      expect(result.dislikes).toEqual(['양식']); // unchanged
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should update only dislikes when likes is undefined', async () => {
      // Arrange
      const existingPreferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: ['양식'],
      });
      const user = UserFactory.create({ preferences: existingPreferences });
      const newDislikes = ['패스트푸드'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(
        user,
        undefined,
        newDislikes,
      );

      // Assert
      expect(result.likes).toEqual(['한식']); // unchanged
      expect(result.dislikes).toEqual(newDislikes);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should normalize tags by trimming whitespace', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const likes = ['  한식  ', ' 중식 ', '일식'];
      const dislikes = [' 양식 '];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(result.likes).toEqual(['한식', '중식', '일식']);
      expect(result.dislikes).toEqual(['양식']);
    });

    it('should remove empty strings from tags', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const likes = ['한식', '', '  ', '중식'];
      const dislikes = ['', '양식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(result.likes).toEqual(['한식', '중식']);
      expect(result.dislikes).toEqual(['양식']);
    });

    it('should remove duplicate tags', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const likes = ['한식', '중식', '한식', '일식', '중식'];
      const dislikes = ['양식', '양식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(result.likes).toEqual(['한식', '중식', '일식']);
      expect(result.dislikes).toEqual(['양식']);
    });

    it('should preserve existing analysis when updating preferences', async () => {
      // Arrange
      const existingPreferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: ['양식'],
      });
      existingPreferences.analysis = '기존 분석 결과';
      const user = UserFactory.create({ preferences: existingPreferences });
      const newLikes = ['중식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, newLikes, undefined);

      // Assert
      expect(result.analysis).toBe('기존 분석 결과');
    });

    it('should create new preferences when user has none', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const likes = ['한식'];
      const dislikes = ['양식'];

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, likes, dislikes);

      // Assert
      expect(result.likes).toEqual(likes);
      expect(result.dislikes).toEqual(dislikes);
      expect(result.analysis).toBeUndefined();
    });

    it('should handle empty arrays as input', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferences(user, [], []);

      // Assert
      expect(result.likes).toEqual([]);
      expect(result.dislikes).toEqual([]);
    });
  });

  describe('updatePreferencesAnalysis', () => {
    it('should update analysis while preserving likes and dislikes', async () => {
      // Arrange
      const existingPreferences = UserPreferencesFactory.create({
        likes: ['한식', '중식'],
        dislikes: ['양식'],
      });
      const user = UserFactory.create({ preferences: existingPreferences });
      const newAnalysis = '다양한 아시아 음식을 좋아하시는 것 같습니다.';

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, newAnalysis);

      // Assert
      expect(result.analysis).toBe(newAnalysis);
      expect(result.likes).toEqual(['한식', '중식']);
      expect(result.dislikes).toEqual(['양식']);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should trim whitespace from analysis', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const analysis = '  취향 분석 결과입니다.  ';

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, analysis);

      // Assert
      expect(result.analysis).toBe('취향 분석 결과입니다.');
    });

    it('should replace existing analysis', async () => {
      // Arrange
      const existingPreferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: [],
      });
      existingPreferences.analysis = '기존 분석';
      const user = UserFactory.create({ preferences: existingPreferences });
      const newAnalysis = '새로운 분석 결과';

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, newAnalysis);

      // Assert
      expect(result.analysis).toBe('새로운 분석 결과');
    });

    it('should create preferences with analysis when user has none', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const analysis = '첫 분석 결과';

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, analysis);

      // Assert
      expect(result.analysis).toBe('첫 분석 결과');
      expect(result.likes).toEqual([]);
      expect(result.dislikes).toEqual([]);
    });

    it('should handle empty string analysis after trimming', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const analysis = '   ';

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, analysis);

      // Assert
      expect(result.analysis).toBe('');
    });

    it('should handle multiline analysis text', async () => {
      // Arrange
      const user = UserFactory.create({ preferences: null });
      const analysis = `한식을 주로 선호하시며
특히 매운 음식을 좋아하십니다.
양식은 피하시는 경향이 있습니다.`;

      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePreferencesAnalysis(user, analysis);

      // Assert
      expect(result.analysis).toBe(analysis.trim());
    });
  });
});
