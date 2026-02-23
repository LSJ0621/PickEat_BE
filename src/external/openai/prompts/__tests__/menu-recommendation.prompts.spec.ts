import {
  getAgeGroup,
  getAgeGroupEN,
  buildUserProfile,
  buildUserPromptWithAddress,
} from '../menu-recommendation.prompts';

describe('menu-recommendation.prompts', () => {
  describe('getAgeGroup', () => {
    const currentYear = new Date().getFullYear();

    it('should return 10대 for users under 20 years old', () => {
      // Arrange
      const birthYear = currentYear - 15;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('10대');
    });

    it('should return 20대 for users in their 20s', () => {
      // Arrange
      const birthYear = currentYear - 25;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('20대');
    });

    it('should return 30대 for users in their 30s', () => {
      // Arrange
      const birthYear = currentYear - 35;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('30대');
    });

    it('should return 40대 for users in their 40s', () => {
      // Arrange
      const birthYear = currentYear - 45;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('40대');
    });

    it('should return 50대 for users in their 50s', () => {
      // Arrange
      const birthYear = currentYear - 55;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('50대');
    });

    it('should return 60대 이상 for users 60 or older', () => {
      // Arrange
      const birthYear = currentYear - 65;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('60대 이상');
    });

    it('should handle edge case of exactly 20 years old', () => {
      // Arrange
      const birthYear = currentYear - 20;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('20대');
    });

    it('should handle edge case of exactly 60 years old', () => {
      // Arrange
      const birthYear = currentYear - 60;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('60대 이상');
    });

    it('should handle birth year at boundary of 19 years old', () => {
      // Arrange
      const birthYear = currentYear - 19;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('10대');
    });

    it('should handle very old users (over 100)', () => {
      // Arrange
      const birthYear = currentYear - 105;

      // Act
      const result = getAgeGroup(birthYear);

      // Assert
      expect(result).toBe('60대 이상');
    });
  });

  describe('getAgeGroupEN', () => {
    const currentYear = new Date().getFullYear();

    it('should return teens for users under 20 years old', () => {
      // Arrange
      const birthYear = currentYear - 15;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('teens');
    });

    it('should return 20s for users in their 20s', () => {
      // Arrange
      const birthYear = currentYear - 25;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('20s');
    });

    it('should return 30s for users in their 30s', () => {
      // Arrange
      const birthYear = currentYear - 35;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('30s');
    });

    it('should return 40s for users in their 40s', () => {
      // Arrange
      const birthYear = currentYear - 45;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('40s');
    });

    it('should return 50s for users in their 50s', () => {
      // Arrange
      const birthYear = currentYear - 55;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('50s');
    });

    it('should return 60s or older for users 60 or older', () => {
      // Arrange
      const birthYear = currentYear - 65;

      // Act
      const result = getAgeGroupEN(birthYear);

      // Assert
      expect(result).toBe('60s or older');
    });
  });

  describe('buildUserProfile', () => {
    it('should build complete user profile with all fields', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'male';
      const country = 'Korea';
      const language = 'ko' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.country).toBe('Korea');
      expect(result.ageGroup).toBe('30대');
      expect(result.gender).toBe('남성');
    });

    it('should handle female gender in Korean', () => {
      // Arrange
      const birthYear = 1995;
      const gender = 'female';
      const country = 'Korea';
      const language = 'ko' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.gender).toBe('여성');
    });

    it('should handle other gender in Korean', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'other';
      const country = 'Korea';
      const language = 'ko' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.gender).toBe('기타');
    });

    it('should build user profile in English', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'male';
      const country = 'USA';
      const language = 'en' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.country).toBe('USA');
      expect(result.ageGroup).toBe('30s');
      expect(result.gender).toBe('Male');
    });

    it('should handle female gender in English', () => {
      // Arrange
      const birthYear = 1995;
      const gender = 'female';
      const country = 'USA';
      const language = 'en' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.gender).toBe('Female');
    });

    it('should handle other gender in English', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'other';
      const country = 'USA';
      const language = 'en' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, country, language);

      // Assert
      expect(result.gender).toBe('Other');
    });

    it('should return empty profile when all fields are undefined', () => {
      // Arrange & Act
      const result = buildUserProfile();

      // Assert
      expect(result).toEqual({});
    });

    it('should build profile with only country', () => {
      // Arrange
      const country = 'Japan';

      // Act
      const result = buildUserProfile(undefined, undefined, country);

      // Assert
      expect(result.country).toBe('Japan');
      expect(result.ageGroup).toBeUndefined();
      expect(result.gender).toBeUndefined();
    });

    it('should build profile with only birthYear', () => {
      // Arrange
      const birthYear = 2000;

      // Act
      const result = buildUserProfile(birthYear);

      // Assert
      expect(result.ageGroup).toBe('20대');
      expect(result.country).toBeUndefined();
      expect(result.gender).toBeUndefined();
    });

    it('should build profile with only gender', () => {
      // Arrange
      const gender = 'female';

      // Act
      const result = buildUserProfile(undefined, gender);

      // Assert
      expect(result.gender).toBe('여성');
      expect(result.country).toBeUndefined();
      expect(result.ageGroup).toBeUndefined();
    });

    it('should default to Korean language when not specified', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'male';

      // Act
      const result = buildUserProfile(birthYear, gender);

      // Assert
      expect(result.ageGroup).toBe('30대');
      expect(result.gender).toBe('남성');
    });

    it('should handle unknown gender gracefully', () => {
      // Arrange
      const birthYear = 1990;
      const gender = 'unknown';
      const language = 'ko' as const;

      // Act
      const result = buildUserProfile(birthYear, gender, undefined, language);

      // Assert
      expect(result.gender).toBeUndefined();
    });
  });

  describe('buildUserPromptWithAddress', () => {
    it('should build prompt with user profile and address', () => {
      // Arrange
      const prompt = 'I want something spicy';
      const likes = ['Korean food', 'Spicy food'];
      const dislikes = ['Sweet food'];
      const analysis = 'User prefers spicy Korean dishes';
      const validationContext = undefined;
      const userAddress = 'Seoul, Gangnam-gu';
      const userProfile = {
        country: 'Korea',
        ageGroup: '30대',
        gender: '남성',
      };
      const language = 'ko' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        userAddress,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('<user_prompt>');
      expect(result).toContain('I want something spicy');
      expect(result).toContain('PREFERENCES (use only what is needed):');
      expect(result).toContain('Likes: Korean food, Spicy food');
      expect(result).toContain('Dislikes: Sweet food');
      expect(result).toContain('PREFERENCE_ANALYSIS:');
      expect(result).toContain('User prefers spicy Korean dishes');
      expect(result).toContain('USER_PROFILE (참고용):');
      expect(result).toContain('국가: Korea');
      expect(result).toContain('연령대: 30대');
      expect(result).toContain('성별: 남성');
      expect(result).toContain('USER_ADDRESS (위치 참고):');
      expect(result).toContain('Seoul, Gangnam-gu');
    });

    it('should build prompt without user profile when not provided', () => {
      // Arrange
      const prompt = 'Recommend me something';
      const likes = ['Pizza'];
      const dislikes = ['Sushi'];
      const analysis = undefined;
      const validationContext = undefined;
      const userAddress = 'New York, Manhattan';
      const userProfile = undefined;
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        userAddress,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('RESPONSE_LANGUAGE: English');
      expect(result).toContain('<user_prompt>');
      expect(result).toContain('Recommend me something');
      expect(result).toContain('Likes: Pizza');
      expect(result).toContain('Dislikes: Sushi');
      expect(result).not.toContain('USER_PROFILE');
      expect(result).toContain('USER_ADDRESS (location reference):');
      expect(result).toContain('New York, Manhattan');
    });

    it('should build prompt without address when not provided', () => {
      // Arrange
      const prompt = 'Something healthy';
      const likes = ['Salad'];
      const dislikes = [];
      const analysis = 'Prefers healthy options';
      const validationContext = undefined;
      const userAddress = undefined;
      const userProfile = {
        country: 'Japan',
        ageGroup: '20s',
        gender: 'Female',
      };
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        userAddress,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('USER_PROFILE (reference only):');
      expect(result).toContain('Country: Japan');
      expect(result).toContain('Age Group: 20s');
      expect(result).toContain('Gender: Female');
      expect(result).not.toContain('USER_ADDRESS');
    });

    it('should build prompt with empty user profile fields', () => {
      // Arrange
      const prompt = 'Anything';
      const likes = [];
      const dislikes = [];
      const analysis = undefined;
      const validationContext = undefined;
      const userAddress = 'Tokyo';
      const userProfile = {};
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        userAddress,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('<user_prompt>');
      expect(result).toContain('Anything');
      expect(result).toContain('Likes: None');
      expect(result).toContain('Dislikes: None');
      expect(result).not.toContain('USER_PROFILE');
      expect(result).toContain('USER_ADDRESS');
      expect(result).toContain('Tokyo');
    });

    it('should handle partial user profile with only country', () => {
      // Arrange
      const prompt = 'Italian food';
      const likes = ['Pasta'];
      const dislikes = [];
      const userProfile = {
        country: 'Italy',
      };
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        undefined,
        undefined,
        undefined,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('USER_PROFILE (reference only):');
      expect(result).toContain('Country: Italy');
      expect(result).not.toContain('Age Group:');
      expect(result).not.toContain('Gender:');
    });

    it('should handle partial user profile with only ageGroup', () => {
      // Arrange
      const prompt = 'Fast food';
      const likes = [];
      const dislikes = [];
      const userProfile = {
        ageGroup: '20대',
      };
      const language = 'ko' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        undefined,
        undefined,
        undefined,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('USER_PROFILE (참고용):');
      expect(result).not.toContain('국가:');
      expect(result).toContain('연령대: 20대');
      expect(result).not.toContain('성별:');
    });

    it('should handle partial user profile with only gender', () => {
      // Arrange
      const prompt = 'Healthy meal';
      const likes = ['Vegetables'];
      const dislikes = [];
      const userProfile = {
        gender: '여성',
      };
      const language = 'ko' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        undefined,
        undefined,
        undefined,
        userProfile,
        language,
      );

      // Assert
      expect(result).toContain('USER_PROFILE (참고용):');
      expect(result).not.toContain('국가:');
      expect(result).not.toContain('연령대:');
      expect(result).toContain('성별: 여성');
    });

    it('should include validation context when provided', () => {
      // Arrange
      const prompt = 'Quick meal under 10000 won';
      const likes = ['Korean food'];
      const dislikes = [];
      const analysis = undefined;
      const validationContext = {
        intent: 'preference' as const,
        constraints: {
          budget: 'low' as const,
          dietary: [],
          urgency: 'quick' as const,
        },
        suggestedCategories: ['Fast food', 'Korean'],
      };
      const userAddress = 'Seoul';
      const language = 'ko' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        userAddress,
        undefined,
        language,
      );

      // Assert
      expect(result).toContain('VALIDATION_CONTEXT (Stage 1 analysis result):');
      expect(result).toContain('Intent: preference');
      expect(result).toContain('Budget: low');
      expect(result).toContain('Urgency: quick');
      expect(result).toContain('Suggested categories: Fast food, Korean');
    });

    it('should default to Korean language when not specified', () => {
      // Arrange
      const prompt = '배고파';
      const likes = ['한식'];
      const dislikes = [];

      // Act
      const result = buildUserPromptWithAddress(prompt, likes, dislikes);

      // Assert
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
    });

    it('should handle None for empty likes and dislikes', () => {
      // Arrange
      const prompt = 'Anything is fine';
      const likes: string[] = [];
      const dislikes: string[] = [];
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        undefined,
        undefined,
        undefined,
        undefined,
        language,
      );

      // Assert
      expect(result).toContain('Likes: None');
      expect(result).toContain('Dislikes: None');
    });

    it('should handle None for undefined analysis', () => {
      // Arrange
      const prompt = 'Lunch recommendation';
      const likes = ['Sushi'];
      const dislikes = [];
      const analysis = undefined;
      const language = 'en' as const;

      // Act
      const result = buildUserPromptWithAddress(
        prompt,
        likes,
        dislikes,
        analysis,
        undefined,
        undefined,
        undefined,
        language,
      );

      // Assert
      expect(result).toContain('PREFERENCE_ANALYSIS:');
      expect(result).toContain('None');
    });
  });
});
