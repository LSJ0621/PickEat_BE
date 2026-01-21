import {
  VALIDATION_SYSTEM_PROMPT,
  VALIDATION_SYSTEM_PROMPT_KO,
  VALIDATION_SYSTEM_PROMPT_EN,
  getValidationSystemPrompt,
  buildValidationUserPrompt,
  VALIDATION_JSON_SCHEMA,
  getValidationJsonSchema,
} from '../../../openai/prompts/menu-validation.prompts';

describe('menu-validation.prompts', () => {
  describe('VALIDATION_SYSTEM_PROMPT (backward compatibility - Korean)', () => {
    it('should be a non-empty string', () => {
      expect(typeof VALIDATION_SYSTEM_PROMPT).toBe('string');
      expect(VALIDATION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('should contain key role instructions in Korean', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('음식 요청 분석 전문가');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<role>');
    });

    it('should contain validation criteria', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<judgment_criteria>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('isValid: true');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('isValid: false');
    });

    it('should contain intent classification guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<intent_classification>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('preference');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('mood');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('location');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('mixed');
    });

    it('should contain constraint extraction guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<constraint_extraction>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('budget');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('dietary');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('urgency');
    });

    it('should contain category suggestion guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<category_suggestion>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('최대 3개');
    });

    it('should contain important field requirements notice', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain(
        '<important_all_fields_required>',
      );
      expect(VALIDATION_SYSTEM_PROMPT).toContain('모든 응답 필드');
    });
  });

  describe('buildValidationUserPrompt', () => {
    describe('with valid likes and dislikes arrays', () => {
      it('should build prompt with user request and preferences', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 뭐 먹을까',
          ['한식', '일식'],
          ['양식', '중식'],
        );

        expect(result).toContain('USER_REQUEST:');
        expect(result).toContain('오늘 점심 뭐 먹을까');
        expect(result).toContain('USER_PREFERENCES (for reference):');
        expect(result).toContain('Likes: 한식, 일식');
        expect(result).toContain('Dislikes: 양식, 중식');
      });

      it('should join multiple likes with comma separator', () => {
        const result = buildValidationUserPrompt(
          '매운 음식 추천해줘',
          ['한식', '일식', '태국음식'],
          ['양식'],
        );

        expect(result).toContain('Likes: 한식, 일식, 태국음식');
      });

      it('should join multiple dislikes with comma separator', () => {
        const result = buildValidationUserPrompt(
          '회식 장소 추천',
          ['한식'],
          ['양식', '중식', '일식'],
        );

        expect(result).toContain('Dislikes: 양식, 중식, 일식');
      });
    });

    describe('with empty likes array (line 67 coverage)', () => {
      it('should display "None" when likes array is empty', () => {
        const result = buildValidationUserPrompt(
          '오늘 저녁 뭐 먹을까',
          [],
          ['양식', '중식'],
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 양식, 중식');
      });

      it('should handle empty likes with single dislike', () => {
        const result = buildValidationUserPrompt(
          '매운 거 먹고 싶어',
          [],
          ['일식'],
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 일식');
      });
    });

    describe('with empty dislikes array (line 68 coverage)', () => {
      it('should display "None" when dislikes array is empty', () => {
        const result = buildValidationUserPrompt(
          '속 편한 음식 추천',
          ['한식', '일식'],
          [],
        );

        expect(result).toContain('Likes: 한식, 일식');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle single like with empty dislikes', () => {
        const result = buildValidationUserPrompt(
          '기분 전환하고 싶어',
          ['한식'],
          [],
        );

        expect(result).toContain('Likes: 한식');
        expect(result).toContain('Dislikes: None');
      });
    });

    describe('with both empty arrays (lines 67-68 coverage)', () => {
      it('should display "None" for both likes and dislikes when both are empty', () => {
        const result = buildValidationUserPrompt('혼밥 메뉴 추천', [], []);

        expect(result).toContain('USER_REQUEST:');
        expect(result).toContain('혼밥 메뉴 추천');
        expect(result).toContain('USER_PREFERENCES (for reference):');
        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
      });

      it('should maintain proper structure with empty preferences', () => {
        const result = buildValidationUserPrompt('데이트 식당 추천', [], []);

        const lines = result.split('\n');
        expect(lines).toHaveLength(6);
        expect(lines[0]).toBe('USER_REQUEST:');
        expect(lines[1]).toBe('데이트 식당 추천');
        expect(lines[2]).toBe('---');
        expect(lines[3]).toBe('USER_PREFERENCES (for reference):');
        expect(lines[4]).toBe('Likes: None');
        expect(lines[5]).toBe('Dislikes: None');
      });
    });

    describe('edge cases and formatting', () => {
      it('should handle user prompts with special characters', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 뭐 먹을까? 😋',
          ['한식'],
          ['양식'],
        );

        expect(result).toContain('오늘 점심 뭐 먹을까? 😋');
      });

      it('should handle user prompts with line breaks', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심\n뭐 먹을까',
          ['한식'],
          ['양식'],
        );

        expect(result).toContain('오늘 점심\n뭐 먹을까');
      });

      it('should properly format with separator line', () => {
        const result = buildValidationUserPrompt(
          '회식 장소 추천',
          ['한식'],
          ['양식'],
        );

        expect(result).toContain('---');
        const parts = result.split('---');
        expect(parts).toHaveLength(2);
      });

      it('should maintain consistent structure across all cases', () => {
        const testCases = [
          { prompt: 'Test 1', likes: ['A'], dislikes: ['B'] },
          { prompt: 'Test 2', likes: [], dislikes: ['B'] },
          { prompt: 'Test 3', likes: ['A'], dislikes: [] },
          { prompt: 'Test 4', likes: [], dislikes: [] },
        ];

        testCases.forEach((testCase) => {
          const result = buildValidationUserPrompt(
            testCase.prompt,
            testCase.likes,
            testCase.dislikes,
          );

          expect(result).toContain('USER_REQUEST:');
          expect(result).toContain(testCase.prompt);
          expect(result).toContain('---');
          expect(result).toContain('USER_PREFERENCES (for reference):');
          expect(result).toContain('Likes:');
          expect(result).toContain('Dislikes:');
        });
      });
    });

    describe('null/undefined handling', () => {
      it('should handle null likes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          null as any,
          ['양식'],
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 양식');
      });

      it('should handle undefined likes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          undefined as any,
          ['양식'],
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 양식');
      });

      it('should handle null dislikes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          ['한식'],
          null as any,
        );

        expect(result).toContain('Likes: 한식');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle undefined dislikes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          ['한식'],
          undefined as any,
        );

        expect(result).toContain('Likes: 한식');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle both null arrays safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          null as any,
          null as any,
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle both undefined arrays safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          undefined as any,
          undefined as any,
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
      });
    });
  });

  describe('VALIDATION_JSON_SCHEMA', () => {
    it('should be an object', () => {
      expect(typeof VALIDATION_JSON_SCHEMA).toBe('object');
      expect(VALIDATION_JSON_SCHEMA).not.toBeNull();
    });

    it('should have type "object"', () => {
      expect(VALIDATION_JSON_SCHEMA.type).toBe('object');
    });

    it('should have properties object', () => {
      expect(VALIDATION_JSON_SCHEMA.properties).toBeDefined();
      expect(typeof VALIDATION_JSON_SCHEMA.properties).toBe('object');
    });

    it('should define isValid property as boolean', () => {
      expect(VALIDATION_JSON_SCHEMA.properties.isValid).toBeDefined();
      expect(VALIDATION_JSON_SCHEMA.properties.isValid.type).toBe('boolean');
      expect(VALIDATION_JSON_SCHEMA.properties.isValid.description).toContain(
        '음식 관련 요청',
      );
    });

    it('should define invalidReason property as string', () => {
      expect(VALIDATION_JSON_SCHEMA.properties.invalidReason).toBeDefined();
      expect(VALIDATION_JSON_SCHEMA.properties.invalidReason.type).toBe(
        'string',
      );
      expect(
        VALIDATION_JSON_SCHEMA.properties.invalidReason.description,
      ).toContain('거부 이유');
    });

    it('should define intent property with enum values', () => {
      expect(VALIDATION_JSON_SCHEMA.properties.intent).toBeDefined();
      expect(VALIDATION_JSON_SCHEMA.properties.intent.type).toBe('string');
      expect(VALIDATION_JSON_SCHEMA.properties.intent.enum).toEqual([
        'preference',
        'mood',
        'location',
        'mixed',
      ]);
    });

    it('should define constraints property as object', () => {
      expect(VALIDATION_JSON_SCHEMA.properties.constraints).toBeDefined();
      expect(VALIDATION_JSON_SCHEMA.properties.constraints.type).toBe('object');
    });

    it('should define constraints.budget with enum values', () => {
      const constraints = VALIDATION_JSON_SCHEMA.properties.constraints;
      expect(constraints.properties.budget).toBeDefined();
      expect(constraints.properties.budget.type).toBe('string');
      expect(constraints.properties.budget.enum).toEqual([
        'low',
        'medium',
        'high',
      ]);
    });

    it('should define constraints.dietary as array', () => {
      const constraints = VALIDATION_JSON_SCHEMA.properties.constraints;
      expect(constraints.properties.dietary).toBeDefined();
      expect(constraints.properties.dietary.type).toBe('array');
      expect(constraints.properties.dietary.items.type).toBe('string');
    });

    it('should define constraints.urgency with enum values', () => {
      const constraints = VALIDATION_JSON_SCHEMA.properties.constraints;
      expect(constraints.properties.urgency).toBeDefined();
      expect(constraints.properties.urgency.type).toBe('string');
      expect(constraints.properties.urgency.enum).toEqual(['quick', 'normal']);
    });

    it('should define suggestedCategories as array with maxItems', () => {
      expect(
        VALIDATION_JSON_SCHEMA.properties.suggestedCategories,
      ).toBeDefined();
      expect(VALIDATION_JSON_SCHEMA.properties.suggestedCategories.type).toBe(
        'array',
      );
      expect(
        VALIDATION_JSON_SCHEMA.properties.suggestedCategories.items.type,
      ).toBe('string');
      expect(
        VALIDATION_JSON_SCHEMA.properties.suggestedCategories.maxItems,
      ).toBe(3);
    });

    it('should have required fields array', () => {
      expect(VALIDATION_JSON_SCHEMA.required).toBeDefined();
      expect(Array.isArray(VALIDATION_JSON_SCHEMA.required)).toBe(true);
      expect(VALIDATION_JSON_SCHEMA.required).toEqual([
        'isValid',
        'invalidReason',
        'intent',
        'constraints',
        'suggestedCategories',
      ]);
    });

    it('should have additionalProperties set to false', () => {
      expect(VALIDATION_JSON_SCHEMA.additionalProperties).toBe(false);
    });

    it('should have constraints required fields', () => {
      const constraints = VALIDATION_JSON_SCHEMA.properties.constraints;
      expect(constraints.required).toEqual(['budget', 'dietary', 'urgency']);
    });

    it('should have constraints additionalProperties set to false', () => {
      const constraints = VALIDATION_JSON_SCHEMA.properties.constraints;
      expect(constraints.additionalProperties).toBe(false);
    });
  });

  describe('Phase 2: Internationalization (i18n)', () => {
    describe('VALIDATION_SYSTEM_PROMPT_KO', () => {
      it('should be a non-empty Korean string', () => {
        expect(typeof VALIDATION_SYSTEM_PROMPT_KO).toBe('string');
        expect(VALIDATION_SYSTEM_PROMPT_KO.length).toBeGreaterThan(0);
      });

      it('should contain Korean language content', () => {
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('음식 요청 분석 전문가');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('<role>');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('<judgment_criteria>');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain(
          '<intent_classification>',
        );
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain(
          '<constraint_extraction>',
        );
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('<category_suggestion>');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('<language_rule>');
      });

      it('should contain Korean-specific instructions', () => {
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('한국어 입력');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('한국어 응답');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('영어 입력');
        expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('영어 응답');
      });
    });

    describe('VALIDATION_SYSTEM_PROMPT_EN', () => {
      it('should be a non-empty English string', () => {
        expect(typeof VALIDATION_SYSTEM_PROMPT_EN).toBe('string');
        expect(VALIDATION_SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
      });

      it('should contain English language content', () => {
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain(
          'food request analysis expert',
        );
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('<role>');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('<judgment_criteria>');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain(
          '<intent_classification>',
        );
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain(
          '<constraint_extraction>',
        );
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('<category_suggestion>');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('<language_rule>');
      });

      it('should contain English-specific instructions', () => {
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('Korean input');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('Korean response');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('English input');
        expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('English response');
      });
    });

    describe('VALIDATION_SYSTEM_PROMPT constant (backward compatibility)', () => {
      it('should equal VALIDATION_SYSTEM_PROMPT_KO for backward compatibility', () => {
        expect(VALIDATION_SYSTEM_PROMPT).toBe(VALIDATION_SYSTEM_PROMPT_KO);
      });
    });

    describe('getValidationSystemPrompt', () => {
      it('should return Korean prompt when language is "ko"', () => {
        const result = getValidationSystemPrompt('ko');
        expect(result).toBe(VALIDATION_SYSTEM_PROMPT_KO);
        expect(result).toContain('음식 요청 분석 전문가');
      });

      it('should return English prompt when language is "en"', () => {
        const result = getValidationSystemPrompt('en');
        expect(result).toBe(VALIDATION_SYSTEM_PROMPT_EN);
        expect(result).toContain('food request analysis expert');
      });

      it('should default to Korean when no language parameter is provided', () => {
        const result = getValidationSystemPrompt();
        expect(result).toBe(VALIDATION_SYSTEM_PROMPT_KO);
      });

      it('should default to Korean when undefined is passed', () => {
        const result = getValidationSystemPrompt(undefined);
        expect(result).toBe(VALIDATION_SYSTEM_PROMPT_KO);
      });
    });

    describe('buildValidationUserPrompt with language parameter', () => {
      it('should accept language parameter for consistency', () => {
        const result = buildValidationUserPrompt(
          'I want pizza',
          ['Italian'],
          [],
          'ko',
        );

        expect(result).toContain('USER_REQUEST:');
        expect(result).toContain('I want pizza');
      });

      it('should work without language parameter', () => {
        const result = buildValidationUserPrompt('오늘 점심 뭐 먹을까', [], []);

        expect(result).toContain('USER_REQUEST:');
        expect(result).toContain('오늘 점심 뭐 먹을까');
      });

      it('should maintain same output regardless of language parameter', () => {
        const input = '오늘 점심 뭐 먹을까';
        const likes = ['한식'];
        const dislikes = ['양식'];

        const resultKo = buildValidationUserPrompt(
          input,
          likes,
          dislikes,
          'ko',
        );
        const resultEn = buildValidationUserPrompt(
          input,
          likes,
          dislikes,
          'en',
        );
        const resultNone = buildValidationUserPrompt(input, likes, dislikes);

        expect(resultKo).toBe(resultEn);
        expect(resultEn).toBe(resultNone);
      });
    });

    describe('getValidationJsonSchema', () => {
      it('should return Korean schema when language is "ko"', () => {
        const schema = getValidationJsonSchema('ko');

        expect(schema.properties.isValid.description).toContain(
          '음식 관련 요청',
        );
        expect(schema.properties.invalidReason.description).toContain(
          '거부 이유',
        );
        expect(schema.properties.intent.description).toContain('의도 분류');
        expect(
          schema.properties.constraints.properties.budget.description,
        ).toContain('예산 수준');
        expect(
          schema.properties.constraints.properties.dietary.description,
        ).toContain('식이 제한');
        expect(
          schema.properties.constraints.properties.urgency.description,
        ).toContain('긴급도');
        expect(schema.properties.suggestedCategories.description).toContain(
          '음식 카테고리',
        );
      });

      it('should return English schema when language is "en"', () => {
        const schema = getValidationJsonSchema('en');

        expect(schema.properties.isValid.description).toContain(
          'food-related request',
        );
        expect(schema.properties.invalidReason.description).toContain(
          'Rejection reason',
        );
        expect(schema.properties.intent.description).toContain(
          'intent classification',
        );
        expect(
          schema.properties.constraints.properties.budget.description,
        ).toContain('Budget level');
        expect(
          schema.properties.constraints.properties.dietary.description,
        ).toContain('Dietary restrictions');
        expect(
          schema.properties.constraints.properties.urgency.description,
        ).toContain('Urgency level');
        expect(schema.properties.suggestedCategories.description).toContain(
          'food categories',
        );
      });

      it('should default to Korean when no language parameter is provided', () => {
        const schema = getValidationJsonSchema();

        expect(schema.properties.isValid.description).toContain(
          '음식 관련 요청',
        );
      });

      it('should have same structure for both languages', () => {
        const koSchema = getValidationJsonSchema('ko');
        const enSchema = getValidationJsonSchema('en');

        expect(koSchema.type).toBe(enSchema.type);
        expect(koSchema.required).toEqual(enSchema.required);
        expect(koSchema.properties.isValid.type).toBe(
          enSchema.properties.isValid.type,
        );
        expect(koSchema.properties.invalidReason.type).toBe(
          enSchema.properties.invalidReason.type,
        );
        expect(koSchema.properties.intent.type).toBe(
          enSchema.properties.intent.type,
        );
        expect(koSchema.properties.intent.enum).toEqual(
          enSchema.properties.intent.enum,
        );
        expect(koSchema.properties.constraints.type).toBe(
          enSchema.properties.constraints.type,
        );
      });

      it('should only differ in description fields', () => {
        const koSchema = getValidationJsonSchema('ko');
        const enSchema = getValidationJsonSchema('en');

        expect(koSchema.properties.isValid.description).not.toBe(
          enSchema.properties.isValid.description,
        );
        expect(koSchema.properties.invalidReason.description).not.toBe(
          enSchema.properties.invalidReason.description,
        );
        expect(koSchema.properties.intent.description).not.toBe(
          enSchema.properties.intent.description,
        );
      });
    });
  });
});
