import {
  GOOGLE_PLACES_SYSTEM_PROMPT,
  GOOGLE_PLACES_SYSTEM_PROMPT_KO,
  GOOGLE_PLACES_SYSTEM_PROMPT_EN,
  getGooglePlacesSystemPrompt,
  buildGooglePlacesUserPrompt,
  GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA,
  getGooglePlacesRecommendationsJsonSchema,
} from '../../../openai/prompts/google-places-recommendation.prompts';
import { PlaceCandidate } from '../../../../menu/interface/openai-places.interface';

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
        {
          originalText: '국물이 시원해요',
          rating: 4,
          relativePublishTimeDescription: '2주 전',
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

  describe('Phase 2: Internationalization (i18n)', () => {
    describe('GOOGLE_PLACES_SYSTEM_PROMPT_KO', () => {
      it('should be a non-empty Korean string', () => {
        expect(typeof GOOGLE_PLACES_SYSTEM_PROMPT_KO).toBe('string');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO.length).toBeGreaterThan(0);
      });

      it('should contain Korean language content', () => {
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain(
          'Pick-Eat 레스토랑 추천 AI',
        );
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('역할:');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('출력: JSON만');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('규칙:');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('<language_rule>');
      });

      it('should contain Korean-specific instructions', () => {
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain(
          '후보 목록에서만 선택',
        );
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('최대 3곳');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('존댓말 사용');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('한국어 응답');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_KO).toContain('영어 응답');
      });
    });

    describe('GOOGLE_PLACES_SYSTEM_PROMPT_EN', () => {
      it('should be a non-empty English string', () => {
        expect(typeof GOOGLE_PLACES_SYSTEM_PROMPT_EN).toBe('string');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
      });

      it('should contain English language content', () => {
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain(
          'Pick-Eat restaurant recommendation AI',
        );
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('Role:');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('Output: JSON only');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('Rules:');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('<language_rule>');
      });

      it('should contain English-specific instructions', () => {
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain(
          'Select only from candidate list',
        );
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('maximum 3 places');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('polite language');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('Korean response');
        expect(GOOGLE_PLACES_SYSTEM_PROMPT_EN).toContain('English response');
      });
    });

    describe('GOOGLE_PLACES_SYSTEM_PROMPT constant (backward compatibility)', () => {
      it('should equal GOOGLE_PLACES_SYSTEM_PROMPT_KO for backward compatibility', () => {
        expect(GOOGLE_PLACES_SYSTEM_PROMPT).toBe(
          GOOGLE_PLACES_SYSTEM_PROMPT_KO,
        );
      });
    });

    describe('getGooglePlacesSystemPrompt', () => {
      it('should return Korean prompt when language is "ko"', () => {
        const result = getGooglePlacesSystemPrompt('ko');
        expect(result).toBe(GOOGLE_PLACES_SYSTEM_PROMPT_KO);
        expect(result).toContain('레스토랑 추천 AI');
      });

      it('should return English prompt when language is "en"', () => {
        const result = getGooglePlacesSystemPrompt('en');
        expect(result).toBe(GOOGLE_PLACES_SYSTEM_PROMPT_EN);
        expect(result).toContain('restaurant recommendation AI');
      });

      it('should default to Korean when no language parameter is provided', () => {
        const result = getGooglePlacesSystemPrompt();
        expect(result).toBe(GOOGLE_PLACES_SYSTEM_PROMPT_KO);
      });

      it('should default to Korean when undefined is passed', () => {
        const result = getGooglePlacesSystemPrompt(undefined);
        expect(result).toBe(GOOGLE_PLACES_SYSTEM_PROMPT_KO);
      });
    });

    describe('buildGooglePlacesUserPrompt', () => {
      describe('without language parameter', () => {
        it('should not include RESPONSE_LANGUAGE when language is not provided', () => {
          const result = buildGooglePlacesUserPrompt(
            '덕소 근처 마라탕',
            mockCandidates,
          );

          expect(result).not.toContain('RESPONSE_LANGUAGE:');
          expect(result).toContain('Search query: 덕소 근처 마라탕');
          expect(result).toContain('[Candidate list]');
        });

        it('should include candidate data in JSON format', () => {
          const result = buildGooglePlacesUserPrompt(
            'Malatang near Deokso',
            mockCandidates,
          );

          expect(result).toContain('id, name, rating, userRatingCount');
          expect(result).toContain(JSON.stringify(mockCandidates));
        });

        it('should include request instructions', () => {
          const result = buildGooglePlacesUserPrompt(
            '김치찌개',
            mockCandidates,
          );

          expect(result).toContain('[Request]');
          expect(result).toContain(
            'Recommend up to 3 restaurants related to the search query',
          );
          expect(result).toContain('Return empty array if none are relevant');
        });
      });

      describe('with language parameter "ko"', () => {
        it('should include RESPONSE_LANGUAGE: Korean when language is "ko"', () => {
          const result = buildGooglePlacesUserPrompt(
            'Malatang near Deokso',
            mockCandidates,
            'ko',
          );

          expect(result).toContain('RESPONSE_LANGUAGE: Korean');
          expect(result).toContain('Search query: Malatang near Deokso');
        });

        it('should override auto-detection with explicit ko parameter', () => {
          const result = buildGooglePlacesUserPrompt(
            'I want American food',
            mockCandidates,
            'ko',
          );

          expect(result).toContain('RESPONSE_LANGUAGE: Korean');
        });
      });

      describe('with language parameter "en"', () => {
        it('should include RESPONSE_LANGUAGE: English when language is "en"', () => {
          const result = buildGooglePlacesUserPrompt(
            '덕소 근처 마라탕',
            mockCandidates,
            'en',
          );

          expect(result).toContain('RESPONSE_LANGUAGE: English');
          expect(result).toContain('Search query: 덕소 근처 마라탕');
        });

        it('should override auto-detection with explicit en parameter', () => {
          const result = buildGooglePlacesUserPrompt(
            '오늘 점심 김치찌개',
            mockCandidates,
            'en',
          );

          expect(result).toContain('RESPONSE_LANGUAGE: English');
        });
      });

      describe('with empty candidates', () => {
        it('should handle empty candidates array', () => {
          const result = buildGooglePlacesUserPrompt('김치찌개', [], 'ko');

          expect(result).toContain('RESPONSE_LANGUAGE: Korean');
          expect(result).toContain('Search query: 김치찌개');
          expect(result).toContain('[]');
        });
      });
    });

    describe('getGooglePlacesRecommendationsJsonSchema', () => {
      it('should return Korean schema when language is "ko"', () => {
        const schema = getGooglePlacesRecommendationsJsonSchema('ko');

        expect(
          schema.properties.recommendations.items.properties.placeId
            .description,
        ).toContain('후보의 id를 그대로 사용');
        expect(
          schema.properties.recommendations.items.properties.name.description,
        ).toContain('레스토랑 이름');
        expect(
          schema.properties.recommendations.items.properties.reason.description,
        ).toContain('추천 이유');
        expect(
          schema.properties.recommendations.items.properties.reason.description,
        ).toContain('존댓말');
        expect(schema.properties.recommendations.description).toContain(
          '추천 레스토랑',
        );
      });

      it('should return English schema when language is "en"', () => {
        const schema = getGooglePlacesRecommendationsJsonSchema('en');

        expect(
          schema.properties.recommendations.items.properties.placeId
            .description,
        ).toContain('use candidate id as-is');
        expect(
          schema.properties.recommendations.items.properties.name.description,
        ).toContain('Restaurant name');
        expect(
          schema.properties.recommendations.items.properties.reason.description,
        ).toContain('Recommendation reason');
        expect(
          schema.properties.recommendations.items.properties.reason.description,
        ).toContain('polite language');
        expect(schema.properties.recommendations.description).toContain(
          'Recommended restaurants',
        );
      });

      it('should default to Korean when no language parameter is provided', () => {
        const schema = getGooglePlacesRecommendationsJsonSchema();

        expect(
          schema.properties.recommendations.items.properties.reason.description,
        ).toContain('추천 이유');
      });

      it('should have same structure for both languages', () => {
        const koSchema = getGooglePlacesRecommendationsJsonSchema('ko');
        const enSchema = getGooglePlacesRecommendationsJsonSchema('en');

        expect(koSchema.type).toBe(enSchema.type);
        expect(koSchema.required).toEqual(enSchema.required);
        expect(koSchema.properties.recommendations.type).toBe(
          enSchema.properties.recommendations.type,
        );
        expect(koSchema.properties.recommendations.minItems).toBe(
          enSchema.properties.recommendations.minItems,
        );
        expect(koSchema.properties.recommendations.maxItems).toBe(
          enSchema.properties.recommendations.maxItems,
        );
      });

      it('should only differ in description fields', () => {
        const koSchema = getGooglePlacesRecommendationsJsonSchema('ko');
        const enSchema = getGooglePlacesRecommendationsJsonSchema('en');

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
        expect(
          koSchema.properties.recommendations.items.properties.reason
            .description,
        ).not.toBe(
          enSchema.properties.recommendations.items.properties.reason
            .description,
        );
      });

      it('should have correct schema structure', () => {
        const schema = getGooglePlacesRecommendationsJsonSchema('ko');

        expect(
          schema.properties.recommendations.items.properties,
        ).toHaveProperty('placeId');
        expect(
          schema.properties.recommendations.items.properties,
        ).toHaveProperty('name');
        expect(
          schema.properties.recommendations.items.properties,
        ).toHaveProperty('reason');
        expect(
          schema.properties.recommendations.items.properties.reason.minLength,
        ).toBe(100);
        expect(
          schema.properties.recommendations.items.properties.reason.maxLength,
        ).toBe(300);
      });
    });

    describe('GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA constant (backward compatibility)', () => {
      it('should equal English schema for backward compatibility', () => {
        const enSchema = getGooglePlacesRecommendationsJsonSchema('en');
        expect(GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA).toEqual(enSchema);
      });
    });
  });
});
