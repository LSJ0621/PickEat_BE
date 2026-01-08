import {
  VALIDATION_SYSTEM_PROMPT,
  buildValidationUserPrompt,
  VALIDATION_JSON_SCHEMA,
} from '../../../openai/prompts/menu-validation.prompts';

describe('menu-validation.prompts', () => {
  describe('VALIDATION_SYSTEM_PROMPT', () => {
    it('should be a non-empty string', () => {
      expect(typeof VALIDATION_SYSTEM_PROMPT).toBe('string');
      expect(VALIDATION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('should contain key role instructions', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('음식 요청 분석 전문가');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<역할>');
    });

    it('should contain validation criteria', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<판단_기준>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('isValid: true');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('isValid: false');
    });

    it('should contain intent classification guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<의도_분류>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('preference');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('mood');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('location');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('mixed');
    });

    it('should contain constraint extraction guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<제약사항_추출>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('budget');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('dietary');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('urgency');
    });

    it('should contain category suggestion guidance', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<카테고리_제안>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain('최대 3개까지');
    });

    it('should contain important field requirements notice', () => {
      expect(VALIDATION_SYSTEM_PROMPT).toContain('<중요: 모든 필드 필수>');
      expect(VALIDATION_SYSTEM_PROMPT).toContain(
        '모든 응답 필드는 반드시 포함',
      );
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
        expect(result).toContain('USER_PREFERENCES (참고용):');
        expect(result).toContain('선호: 한식, 일식');
        expect(result).toContain('비선호: 양식, 중식');
      });

      it('should join multiple likes with comma separator', () => {
        const result = buildValidationUserPrompt(
          '매운 음식 추천해줘',
          ['한식', '일식', '태국음식'],
          ['양식'],
        );

        expect(result).toContain('선호: 한식, 일식, 태국음식');
      });

      it('should join multiple dislikes with comma separator', () => {
        const result = buildValidationUserPrompt(
          '회식 장소 추천',
          ['한식'],
          ['양식', '중식', '일식'],
        );

        expect(result).toContain('비선호: 양식, 중식, 일식');
      });
    });

    describe('with empty likes array (line 67 coverage)', () => {
      it('should display "없음" when likes array is empty', () => {
        const result = buildValidationUserPrompt(
          '오늘 저녁 뭐 먹을까',
          [],
          ['양식', '중식'],
        );

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 양식, 중식');
      });

      it('should handle empty likes with single dislike', () => {
        const result = buildValidationUserPrompt(
          '매운 거 먹고 싶어',
          [],
          ['일식'],
        );

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 일식');
      });
    });

    describe('with empty dislikes array (line 68 coverage)', () => {
      it('should display "없음" when dislikes array is empty', () => {
        const result = buildValidationUserPrompt(
          '속 편한 음식 추천',
          ['한식', '일식'],
          [],
        );

        expect(result).toContain('선호: 한식, 일식');
        expect(result).toContain('비선호: 없음');
      });

      it('should handle single like with empty dislikes', () => {
        const result = buildValidationUserPrompt(
          '기분 전환하고 싶어',
          ['한식'],
          [],
        );

        expect(result).toContain('선호: 한식');
        expect(result).toContain('비선호: 없음');
      });
    });

    describe('with both empty arrays (lines 67-68 coverage)', () => {
      it('should display "없음" for both likes and dislikes when both are empty', () => {
        const result = buildValidationUserPrompt('혼밥 메뉴 추천', [], []);

        expect(result).toContain('USER_REQUEST:');
        expect(result).toContain('혼밥 메뉴 추천');
        expect(result).toContain('USER_PREFERENCES (참고용):');
        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 없음');
      });

      it('should maintain proper structure with empty preferences', () => {
        const result = buildValidationUserPrompt('데이트 식당 추천', [], []);

        const lines = result.split('\n');
        expect(lines).toHaveLength(6);
        expect(lines[0]).toBe('USER_REQUEST:');
        expect(lines[1]).toBe('데이트 식당 추천');
        expect(lines[2]).toBe('---');
        expect(lines[3]).toBe('USER_PREFERENCES (참고용):');
        expect(lines[4]).toBe('선호: 없음');
        expect(lines[5]).toBe('비선호: 없음');
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
          expect(result).toContain('USER_PREFERENCES (참고용):');
          expect(result).toContain('선호:');
          expect(result).toContain('비선호:');
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

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 양식');
      });

      it('should handle undefined likes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          undefined as any,
          ['양식'],
        );

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 양식');
      });

      it('should handle null dislikes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          ['한식'],
          null as any,
        );

        expect(result).toContain('선호: 한식');
        expect(result).toContain('비선호: 없음');
      });

      it('should handle undefined dislikes array safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          ['한식'],
          undefined as any,
        );

        expect(result).toContain('선호: 한식');
        expect(result).toContain('비선호: 없음');
      });

      it('should handle both null arrays safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          null as any,
          null as any,
        );

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 없음');
      });

      it('should handle both undefined arrays safely', () => {
        const result = buildValidationUserPrompt(
          '오늘 점심 추천',
          undefined as any,
          undefined as any,
        );

        expect(result).toContain('선호: 없음');
        expect(result).toContain('비선호: 없음');
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
      ).toContain('거부 사유');
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
});
