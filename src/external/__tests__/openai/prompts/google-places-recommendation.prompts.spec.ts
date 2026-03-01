import {
  GOOGLE_PLACES_SYSTEM_PROMPT_KO,
  GOOGLE_PLACES_SYSTEM_PROMPT_EN,
  getGooglePlacesSystemPrompt,
  buildGooglePlacesUserPrompt,
  getGooglePlacesRecommendationsJsonSchema,
} from '../../../openai/prompts/google-places-recommendation.prompts';
import { PlaceCandidate } from '@/menu/interfaces/openai-places.interface';

describe('google-places-recommendation.prompts', () => {
  const mockCandidates: PlaceCandidate[] = [
    {
      id: 'place-1',
      name: '맛있는 김치찌개',
      rating: 4.5,
      userRatingCount: 100,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      reviews: [
        {
          originalText: '김치찌개가 정말 맛있어요',
          rating: 5,
          relativePublishTimeDescription: '1주 전',
        },
      ],
    },
    {
      id: 'place-2',
      name: 'Delicious Korean Restaurant',
      rating: 4.3,
      userRatingCount: 50,
      priceLevel: 'PRICE_LEVEL_EXPENSIVE',
      reviews: [
        {
          originalText: 'Great bibimbap',
          rating: 5,
          relativePublishTimeDescription: '1 week ago',
        },
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // System prompt constants
  // ---------------------------------------------------------------------------
  describe('GOOGLE_PLACES_SYSTEM_PROMPT_KO / GOOGLE_PLACES_SYSTEM_PROMPT_EN', () => {
    it.each([
      {
        lang: 'ko' as const,
        prompt: GOOGLE_PLACES_SYSTEM_PROMPT_KO,
        uniqueText: 'Pick-Eat 레스토랑 추천 AI',
        roleLabel: '역할:',
        outputLabel: '출력: JSON만',
        rulesLabel: '규칙:',
        maxPlaces: '최대 3곳',
        languageInstruction: '한국어 응답',
      },
      {
        lang: 'en' as const,
        prompt: GOOGLE_PLACES_SYSTEM_PROMPT_EN,
        uniqueText: 'Pick-Eat restaurant recommendation AI',
        roleLabel: 'Role:',
        outputLabel: 'Output: JSON only',
        rulesLabel: 'Rules:',
        maxPlaces: 'maximum 3 places',
        languageInstruction: 'Korean response',
      },
    ])(
      'should contain required content for $lang prompt',
      ({
        prompt,
        uniqueText,
        roleLabel,
        outputLabel,
        rulesLabel,
        maxPlaces,
        languageInstruction,
      }) => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain(uniqueText);
        expect(prompt).toContain(roleLabel);
        expect(prompt).toContain(outputLabel);
        expect(prompt).toContain(rulesLabel);
        expect(prompt).toContain('<language_rule>');
        expect(prompt).toContain(maxPlaces);
        expect(prompt).toContain(languageInstruction);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // getGooglePlacesSystemPrompt
  // ---------------------------------------------------------------------------
  describe('getGooglePlacesSystemPrompt', () => {
    it.each([
      { lang: 'ko' as const, expected: GOOGLE_PLACES_SYSTEM_PROMPT_KO },
      { lang: 'en' as const, expected: GOOGLE_PLACES_SYSTEM_PROMPT_EN },
    ])('should return $lang prompt', ({ lang, expected }) => {
      expect(getGooglePlacesSystemPrompt(lang)).toBe(expected);
    });

    it('should default to Korean when no argument is given', () => {
      expect(getGooglePlacesSystemPrompt()).toBe(
        GOOGLE_PLACES_SYSTEM_PROMPT_KO,
      );
      expect(getGooglePlacesSystemPrompt(undefined)).toBe(
        GOOGLE_PLACES_SYSTEM_PROMPT_KO,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // buildGooglePlacesUserPrompt
  // ---------------------------------------------------------------------------
  describe('buildGooglePlacesUserPrompt', () => {
    it('should not include RESPONSE_LANGUAGE when language is not provided', () => {
      const result = buildGooglePlacesUserPrompt(
        '덕소 근처 마라탕',
        mockCandidates,
      );
      expect(result).not.toContain('RESPONSE_LANGUAGE:');
      expect(result).toContain('Search query: 덕소 근처 마라탕');
      expect(result).toContain('[Candidate list]');
      expect(result).toContain('id, name, rating, userRatingCount');
      expect(result).toContain(JSON.stringify(mockCandidates));
      expect(result).toContain('[Request]');
      expect(result).toContain(
        'Recommend up to 3 restaurants related to the search query',
      );
      expect(result).toContain('Return empty array if none are relevant');
    });

    it.each([
      {
        lang: 'ko' as const,
        expectedLabel: 'Korean',
        query: 'Malatang near Deokso',
      },
      {
        lang: 'en' as const,
        expectedLabel: 'English',
        query: '덕소 근처 마라탕',
      },
    ])(
      'should include RESPONSE_LANGUAGE: $expectedLabel when language is "$lang"',
      ({ lang, expectedLabel, query }) => {
        const result = buildGooglePlacesUserPrompt(query, mockCandidates, lang);
        expect(result).toContain(`RESPONSE_LANGUAGE: ${expectedLabel}`);
        expect(result).toContain(`Search query: ${query}`);
      },
    );

    it('should handle empty candidates array', () => {
      const result = buildGooglePlacesUserPrompt('김치찌개', [], 'ko');
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('Search query: 김치찌개');
      expect(result).toContain('[]');
    });
  });

  // ---------------------------------------------------------------------------
  // getGooglePlacesRecommendationsJsonSchema
  // ---------------------------------------------------------------------------
  describe('getGooglePlacesRecommendationsJsonSchema', () => {
    it('should have correct top-level structure', () => {
      const schema = getGooglePlacesRecommendationsJsonSchema('ko');
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['recommendations']);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.recommendations.type).toBe('array');
      expect(schema.properties.recommendations.minItems).toBe(0);
      expect(schema.properties.recommendations.maxItems).toBe(5);

      const itemProps = schema.properties.recommendations.items.properties;
      expect(itemProps).toHaveProperty('placeId');
      expect(itemProps).toHaveProperty('name');
      expect(itemProps).toHaveProperty('reason');
      expect(itemProps).toHaveProperty('reasonTags');
      expect(itemProps.reason.minLength).toBe(150);
      expect(itemProps.reason.maxLength).toBe(200);
    });

    it.each([
      {
        lang: 'ko' as const,
        placeId: '후보의 id를 그대로 사용',
        name: '레스토랑 이름',
        reason: '추천 이유',
        polite: '존댓말',
        recommendations: '추천 레스토랑',
      },
      {
        lang: 'en' as const,
        placeId: 'use candidate id as-is',
        name: 'Restaurant name',
        reason: 'Recommendation reason',
        polite: 'polite language',
        recommendations: 'Recommended restaurants',
      },
    ])(
      'should have $lang descriptions in schema ($lang)',
      ({ lang, placeId, name, reason, polite, recommendations }) => {
        const schema = getGooglePlacesRecommendationsJsonSchema(lang);
        const itemProps = schema.properties.recommendations.items.properties;
        expect(itemProps.placeId.description).toContain(placeId);
        expect(itemProps.name.description).toContain(name);
        expect(itemProps.reason.description).toContain(reason);
        expect(itemProps.reason.description).toContain(polite);
        expect(schema.properties.recommendations.description).toContain(
          recommendations,
        );
      },
    );

    it('should default to Korean and differ only in descriptions between languages', () => {
      const koSchema = getGooglePlacesRecommendationsJsonSchema();
      const enSchema = getGooglePlacesRecommendationsJsonSchema('en');

      expect(
        koSchema.properties.recommendations.items.properties.reason.description,
      ).toContain('추천 이유');

      // Structure identical
      expect(koSchema.type).toBe(enSchema.type);
      expect(koSchema.required).toEqual(enSchema.required);
      expect(koSchema.properties.recommendations.minItems).toBe(
        enSchema.properties.recommendations.minItems,
      );
      expect(koSchema.properties.recommendations.maxItems).toBe(
        enSchema.properties.recommendations.maxItems,
      );

      // Descriptions differ
      expect(koSchema.properties.recommendations.description).not.toBe(
        enSchema.properties.recommendations.description,
      );
      expect(
        koSchema.properties.recommendations.items.properties.placeId
          .description,
      ).not.toBe(
        enSchema.properties.recommendations.items.properties.placeId
          .description,
      );
    });

    it('should equal expected schema for each language via direct function call', () => {
      const enSchemaA = getGooglePlacesRecommendationsJsonSchema('en');
      const enSchemaB = getGooglePlacesRecommendationsJsonSchema('en');
      expect(enSchemaA).toEqual(enSchemaB);
    });
  });
});
