import {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_KO,
  SYSTEM_PROMPT_EN,
  getSystemPrompt,
  buildUserPrompt,
  buildUserPromptWithValidation,
  MENU_RECOMMENDATIONS_JSON_SCHEMA,
  getMenuRecommendationsJsonSchema,
} from '../../../openai/prompts/menu-recommendation.prompts';

describe('menu-recommendation.prompts', () => {
  describe('SYSTEM_PROMPT (backward compatibility - Korean)', () => {
    it('should be a non-empty string', () => {
      expect(typeof SYSTEM_PROMPT).toBe('string');
      expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('should contain role definition in Korean', () => {
      expect(SYSTEM_PROMPT).toContain('Pick-Eat');
      expect(SYSTEM_PROMPT).toContain('음식 컨설턴트');
      expect(SYSTEM_PROMPT).toContain('<role>');
    });

    it('should contain input data description', () => {
      expect(SYSTEM_PROMPT).toContain('<input_data>');
      expect(SYSTEM_PROMPT).toContain('USER_PROMPT');
      expect(SYSTEM_PROMPT).toContain('PREFERENCES');
      expect(SYSTEM_PROMPT).toContain('PREFERENCE_ANALYSIS');
    });

    it('should contain output format specification', () => {
      expect(SYSTEM_PROMPT).toContain('<output_format>');
      expect(SYSTEM_PROMPT).toContain('recommendations');
      expect(SYSTEM_PROMPT).toContain('reason');
    });

    it('should contain recommendation principles in Korean', () => {
      expect(SYSTEM_PROMPT).toContain('<recommendation_principles>');
      expect(SYSTEM_PROMPT).toContain('1-5개의 메뉴');
      expect(SYSTEM_PROMPT).toContain('중복 없음');
    });

    it('should contain exploration menu requirement in Korean', () => {
      expect(SYSTEM_PROMPT).toContain('탐색 메뉴 필수');
      expect(SYSTEM_PROMPT).toContain('최소 1개는');
    });

    it('should contain judgment criteria', () => {
      expect(SYSTEM_PROMPT).toContain('<judgment_criteria>');
      expect(SYSTEM_PROMPT).toContain('USER_PROMPT');
      expect(SYSTEM_PROMPT).toContain('PREFERENCES');
    });

    it('should contain recommendation unavailable situation', () => {
      expect(SYSTEM_PROMPT).toContain('<recommendation_unavailable_situation>');
      expect(SYSTEM_PROMPT).toContain('빈 배열 []');
    });

    it('should contain reason writing guide in Korean', () => {
      expect(SYSTEM_PROMPT).toContain('<reason_writing_guide>');
      expect(SYSTEM_PROMPT).toContain('**reason 작성 가이드**');
      expect(SYSTEM_PROMPT).toContain('금지 사항:');
    });

    it('should contain language rule', () => {
      expect(SYSTEM_PROMPT).toContain('<language_rule>');
      expect(SYSTEM_PROMPT).toContain('RESPONSE_LANGUAGE');
      expect(SYSTEM_PROMPT).toContain('절대적 우선순위');
    });
  });

  describe('buildUserPrompt', () => {
    describe('RESPONSE_LANGUAGE field - language detection', () => {
      it('should detect English when prompt is in English', () => {
        const result = buildUserPrompt(
          'I want something light',
          ['국', '면'],
          ['매운 음식'],
          '한국어 분석',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should detect Korean when prompt is in Korean', () => {
        const result = buildUserPrompt(
          '가벼운 거 먹고 싶어',
          ['국', '면'],
          [],
          undefined,
        );

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should detect English when mixed text has more English characters', () => {
        const result = buildUserPrompt(
          'I want 김치찌개 today please',
          [],
          [],
          undefined,
        );

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should detect Korean when mixed text has more Korean characters', () => {
        const result = buildUserPrompt('오늘 pizza 먹을까', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should default to Korean when text has only numbers and special characters', () => {
        const result = buildUserPrompt('123!@#', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should default to Korean when prompt is empty string', () => {
        const result = buildUserPrompt('', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should default to Korean when prompt is whitespace only', () => {
        const result = buildUserPrompt('   ', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should detect English when English characters outnumber Korean (equal count edge case)', () => {
        const result = buildUserPrompt('abc가나', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should detect Korean when Korean characters equal English characters', () => {
        const result = buildUserPrompt('ab가나', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });
    });

    describe('USER_PROMPT section', () => {
      it('should include USER_PROMPT section with user input', () => {
        const result = buildUserPrompt('test prompt', [], [], undefined);

        expect(result).toContain('USER_PROMPT:');
        expect(result).toContain('test prompt');
      });

      it('should preserve multi-line user prompts', () => {
        const result = buildUserPrompt(
          'First line\nSecond line',
          [],
          [],
          undefined,
        );

        expect(result).toContain('First line\nSecond line');
      });

      it('should preserve special characters in user prompt', () => {
        const result = buildUserPrompt(
          '오늘 점심 뭐 먹을까? 😋',
          [],
          [],
          undefined,
        );

        expect(result).toContain('오늘 점심 뭐 먹을까? 😋');
      });
    });

    describe('PREFERENCES section - likes and dislikes', () => {
      it('should include likes and dislikes when both are provided', () => {
        const result = buildUserPrompt(
          'test',
          ['국밥', '찌개'],
          ['매운 음식'],
          undefined,
        );

        expect(result).toContain('PREFERENCES (use only what is needed):');
        expect(result).toContain('Likes: 국밥, 찌개');
        expect(result).toContain('Dislikes: 매운 음식');
      });

      it('should display "None" when likes array is empty', () => {
        const result = buildUserPrompt('test', [], ['매운 음식'], undefined);

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 매운 음식');
      });

      it('should display "None" when dislikes array is empty', () => {
        const result = buildUserPrompt('test', ['국밥'], [], undefined);

        expect(result).toContain('Likes: 국밥');
        expect(result).toContain('Dislikes: None');
      });

      it('should display "None" for both when both arrays are empty', () => {
        const result = buildUserPrompt('test', [], [], undefined);

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle null likes array safely', () => {
        const result = buildUserPrompt(
          'test',
          null as any,
          ['매운 음식'],
          undefined,
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 매운 음식');
      });

      it('should handle undefined likes array safely', () => {
        const result = buildUserPrompt(
          'test',
          undefined as any,
          ['매운 음식'],
          undefined,
        );

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 매운 음식');
      });

      it('should handle null dislikes array safely', () => {
        const result = buildUserPrompt(
          'test',
          ['국밥'],
          null as any,
          undefined,
        );

        expect(result).toContain('Likes: 국밥');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle undefined dislikes array safely', () => {
        const result = buildUserPrompt(
          'test',
          ['국밥'],
          undefined as any,
          undefined,
        );

        expect(result).toContain('Likes: 국밥');
        expect(result).toContain('Dislikes: None');
      });

      it('should join multiple likes with comma separator', () => {
        const result = buildUserPrompt(
          'test',
          ['한식', '일식', '중식'],
          [],
          undefined,
        );

        expect(result).toContain('Likes: 한식, 일식, 중식');
      });

      it('should join multiple dislikes with comma separator', () => {
        const result = buildUserPrompt(
          'test',
          [],
          ['매운 음식', '기름진 음식', '단 음식'],
          undefined,
        );

        expect(result).toContain('Dislikes: 매운 음식, 기름진 음식, 단 음식');
      });
    });

    describe('PREFERENCE_ANALYSIS section', () => {
      it('should include analysis when provided', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          '한식을 선호하시는 경향이 있습니다.',
        );

        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('한식을 선호하시는 경향이 있습니다.');
      });

      it('should display "None" when analysis is undefined', () => {
        const result = buildUserPrompt('test', [], [], undefined);

        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('None');
      });

      it('should display "None" when analysis is empty string', () => {
        const result = buildUserPrompt('test', [], [], '');

        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('None');
      });

      it('should display "None" when analysis is whitespace only', () => {
        const result = buildUserPrompt('test', [], [], '   ');

        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('None');
      });

      it('should trim analysis text', () => {
        const result = buildUserPrompt('test', [], [], '  분석 내용  ');

        expect(result).toContain('분석 내용');
        expect(result).not.toContain('  분석 내용  ');
      });

      it('should preserve multi-line analysis', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          '첫 줄\n둘째 줄\n셋째 줄',
        );

        expect(result).toContain('첫 줄\n둘째 줄\n셋째 줄');
      });
    });

    describe('output format and structure', () => {
      it('should have correct section order', () => {
        const result = buildUserPrompt(
          '테스트 프롬프트',
          ['한식'],
          ['양식'],
          '분석 내용',
        );

        const lines = result.split('\n');

        expect(lines[0]).toBe('RESPONSE_LANGUAGE: Korean');
        expect(lines[1]).toBe('');
        expect(lines[2]).toBe('USER_PROMPT:');
        expect(lines[3]).toBe('테스트 프롬프트');
        expect(lines[4]).toBe('---');
        expect(lines[5]).toBe('PREFERENCES (use only what is needed):');
        expect(lines[6]).toBe('Likes: 한식');
        expect(lines[7]).toBe('Dislikes: 양식');
        expect(lines[8]).toBe('---');
        expect(lines[9]).toBe('PREFERENCE_ANALYSIS:');
        expect(lines[10]).toBe('분석 내용');
      });

      it('should include separator lines', () => {
        const result = buildUserPrompt('test', ['한식'], ['양식'], '분석');

        const separators = result.match(/---/g);
        expect(separators).toHaveLength(2);
      });

      it('should maintain consistent structure with minimal data', () => {
        const result = buildUserPrompt('', [], [], undefined);

        expect(result).toContain('RESPONSE_LANGUAGE:');
        expect(result).toContain('USER_PROMPT:');
        expect(result).toContain('PREFERENCES (use only what is needed):');
        expect(result).toContain('PREFERENCE_ANALYSIS:');
      });
    });

    describe('comprehensive integration tests', () => {
      it('should correctly build complete prompt with all data', () => {
        const result = buildUserPrompt(
          'I want something light and healthy for lunch today',
          ['Soup', 'Salad', 'Fish'],
          ['Spicy food', 'Fried food'],
          'User prefers light meals and avoids heavy foods. Likes seafood and vegetables.',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: English');
        expect(result).toContain('USER_PROMPT:');
        expect(result).toContain(
          'I want something light and healthy for lunch today',
        );
        expect(result).toContain('Likes: Soup, Salad, Fish');
        expect(result).toContain('Dislikes: Spicy food, Fried food');
        expect(result).toContain(
          'User prefers light meals and avoids heavy foods. Likes seafood and vegetables.',
        );
      });

      it('should handle Korean user prompt with complete data', () => {
        const result = buildUserPrompt(
          '오늘 점심으로 가볍고 건강한 음식을 먹고 싶어요',
          ['국물요리', '샐러드', '생선'],
          ['매운 음식', '기름진 음식'],
          '사용자는 가벼운 식사를 선호하고 무거운 음식을 피합니다.',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
        expect(result).toContain(
          '오늘 점심으로 가볍고 건강한 음식을 먹고 싶어요',
        );
        expect(result).toContain('Likes: 국물요리, 샐러드, 생선');
        expect(result).toContain('Dislikes: 매운 음식, 기름진 음식');
        expect(result).toContain(
          '사용자는 가벼운 식사를 선호하고 무거운 음식을 피합니다.',
        );
      });
    });
  });

  describe('buildUserPromptWithValidation', () => {
    const baseParams = {
      userPrompt: 'I want pizza',
      likes: ['Italian', 'Fast food'],
      dislikes: ['Spicy'],
      analysis: 'User enjoys Western cuisine',
    };

    const validationContext = {
      intent: 'preference',
      constraints: {
        budget: 'medium',
        dietary: ['vegetarian'],
        urgency: 'normal',
      },
      suggestedCategories: ['Italian', 'Pizza', 'Western'],
    };

    it('should include base prompt content', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('RESPONSE_LANGUAGE: English');
      expect(result).toContain('USER_PROMPT:');
      expect(result).toContain('I want pizza');
      expect(result).toContain('Likes: Italian, Fast food');
      expect(result).toContain('Dislikes: Spicy');
      expect(result).toContain('User enjoys Western cuisine');
    });

    it('should include VALIDATION_CONTEXT section', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('VALIDATION_CONTEXT (Stage 1 analysis result):');
      expect(result).toContain('Intent: preference');
    });

    it('should include budget constraint when provided', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('Budget: medium');
    });

    it('should omit budget constraint when not provided', () => {
      const contextWithoutBudget = {
        ...validationContext,
        constraints: {
          ...validationContext.constraints,
          budget: undefined,
        },
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithoutBudget,
      );

      expect(result).not.toContain('Budget:');
    });

    it('should include dietary restrictions when provided', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('Dietary restrictions: vegetarian');
    });

    it('should include multiple dietary restrictions', () => {
      const contextWithMultipleDietary = {
        ...validationContext,
        constraints: {
          ...validationContext.constraints,
          dietary: ['vegetarian', 'gluten-free', 'dairy-free'],
        },
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithMultipleDietary,
      );

      expect(result).toContain(
        'Dietary restrictions: vegetarian, gluten-free, dairy-free',
      );
    });

    it('should omit dietary restrictions when array is empty', () => {
      const contextWithEmptyDietary = {
        ...validationContext,
        constraints: {
          ...validationContext.constraints,
          dietary: [],
        },
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithEmptyDietary,
      );

      expect(result).not.toContain('Dietary restrictions:');
    });

    it('should omit dietary restrictions when undefined', () => {
      const contextWithoutDietary = {
        ...validationContext,
        constraints: {
          ...validationContext.constraints,
          dietary: undefined,
        },
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithoutDietary,
      );

      expect(result).not.toContain('Dietary restrictions:');
    });

    it('should include urgency constraint when provided', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('Urgency: normal');
    });

    it('should omit urgency constraint when not provided', () => {
      const contextWithoutUrgency = {
        ...validationContext,
        constraints: {
          ...validationContext.constraints,
          urgency: undefined,
        },
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithoutUrgency,
      );

      expect(result).not.toContain('Urgency:');
    });

    it('should include suggested categories when provided', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      expect(result).toContain('Suggested categories: Italian, Pizza, Western');
    });

    it('should omit suggested categories when array is empty', () => {
      const contextWithoutCategories = {
        ...validationContext,
        suggestedCategories: [],
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        contextWithoutCategories,
      );

      expect(result).not.toContain('Suggested categories:');
    });

    it('should handle validation context with all constraints omitted', () => {
      const minimalContext = {
        intent: 'mood',
        constraints: {},
        suggestedCategories: [],
      };

      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        minimalContext,
      );

      expect(result).toContain('VALIDATION_CONTEXT (Stage 1 analysis result):');
      expect(result).toContain('Intent: mood');
      expect(result).not.toContain('Budget:');
      expect(result).not.toContain('Dietary restrictions:');
      expect(result).not.toContain('Urgency:');
      expect(result).not.toContain('Suggested categories:');
    });

    it('should maintain correct section order with validation context', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        validationContext,
      );

      const basePromptIndex = result.indexOf('RESPONSE_LANGUAGE');
      const validationIndex = result.indexOf('VALIDATION_CONTEXT');

      expect(basePromptIndex).toBeLessThan(validationIndex);
    });

    it('should handle different intent types', () => {
      const intents = ['preference', 'mood', 'location', 'mixed'];

      intents.forEach((intent) => {
        const context = {
          ...validationContext,
          intent,
        };

        const result = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          context,
        );

        expect(result).toContain(`Intent: ${intent}`);
      });
    });

    it('should handle Korean prompt with validation context', () => {
      const koreanContext = {
        intent: '선호',
        constraints: {
          budget: '중간',
          dietary: ['채식'],
          urgency: '보통',
        },
        suggestedCategories: ['한식', '일식'],
      };

      const result = buildUserPromptWithValidation(
        '오늘 점심 뭐 먹을까',
        ['한식'],
        ['매운 음식'],
        '한식 선호 경향',
        koreanContext,
      );

      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('Intent: 선호');
      expect(result).toContain('Budget: 중간');
      expect(result).toContain('Dietary restrictions: 채식');
      expect(result).toContain('Urgency: 보통');
      expect(result).toContain('Suggested categories: 한식, 일식');
    });
  });

  describe('MENU_RECOMMENDATIONS_JSON_SCHEMA (backward compatibility - Korean)', () => {
    it('should be an object', () => {
      expect(typeof MENU_RECOMMENDATIONS_JSON_SCHEMA).toBe('object');
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA).not.toBeNull();
    });

    it('should have type "object"', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.type).toBe('object');
    });

    it('should have properties object', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.properties).toBeDefined();
      expect(typeof MENU_RECOMMENDATIONS_JSON_SCHEMA.properties).toBe('object');
    });

    it('should define recommendations property as array', () => {
      expect(
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations,
      ).toBeDefined();
      expect(
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations.type,
      ).toBe('array');
    });

    it('should define recommendations items as strings with minLength 1', () => {
      const recommendations =
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations;
      expect(recommendations.items.type).toBe('string');
      expect(recommendations.items.minLength).toBe(1);
    });

    it('should define recommendations minItems as 1', () => {
      const recommendations =
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations;
      expect(recommendations.minItems).toBe(1);
    });

    it('should define recommendations maxItems as 5', () => {
      const recommendations =
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations;
      expect(recommendations.maxItems).toBe(5);
    });

    it('should have recommendations description in Korean', () => {
      const recommendations =
        MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.recommendations;
      expect(recommendations.description).toContain(
        '구체적인 단일 요리명만 사용',
      );
      expect(recommendations.description).toContain('수식어 제외');
    });

    it('should define reason property as string', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.reason).toBeDefined();
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.reason.type).toBe(
        'string',
      );
    });

    it('should define reason minLength as 1', () => {
      const reason = MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.reason;
      expect(reason.minLength).toBe(1);
    });

    it('should define reason maxLength as 1000', () => {
      const reason = MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.reason;
      expect(reason.maxLength).toBe(1000);
    });

    it('should have reason description in Korean', () => {
      const reason = MENU_RECOMMENDATIONS_JSON_SCHEMA.properties.reason;
      expect(reason.description).toContain('추천 이유');
      expect(reason.description).toContain('존댓말');
      expect(reason.description).toContain('700-800자');
    });

    it('should have required fields array', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.required).toBeDefined();
      expect(Array.isArray(MENU_RECOMMENDATIONS_JSON_SCHEMA.required)).toBe(
        true,
      );
    });

    it('should require recommendations and reason fields', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.required).toEqual([
        'recommendations',
        'reason',
      ]);
    });

    it('should have additionalProperties set to false', () => {
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.additionalProperties).toBe(false);
    });

    it('should have const assertion type', () => {
      // This test verifies the schema is exported as const
      // TypeScript will enforce this at compile time
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA).toBeDefined();
    });
  });

  describe('Phase 2: Internationalization (i18n)', () => {
    describe('SYSTEM_PROMPT_KO', () => {
      it('should be a non-empty Korean string', () => {
        expect(typeof SYSTEM_PROMPT_KO).toBe('string');
        expect(SYSTEM_PROMPT_KO.length).toBeGreaterThan(0);
      });

      it('should contain Korean language content', () => {
        expect(SYSTEM_PROMPT_KO).toContain('Pick-Eat');
        expect(SYSTEM_PROMPT_KO).toContain('음식 컨설턴트');
        expect(SYSTEM_PROMPT_KO).toContain('<role>');
        expect(SYSTEM_PROMPT_KO).toContain('<input_data>');
        expect(SYSTEM_PROMPT_KO).toContain('<output_format>');
        expect(SYSTEM_PROMPT_KO).toContain('<recommendation_principles>');
        expect(SYSTEM_PROMPT_KO).toContain('<language_rule>');
      });

      it('should contain Korean-specific instructions', () => {
        expect(SYSTEM_PROMPT_KO).toContain('존댓말');
        expect(SYSTEM_PROMPT_KO).toContain('메뉴명');
        expect(SYSTEM_PROMPT_KO).toContain('추천 이유');
      });
    });

    describe('SYSTEM_PROMPT_EN', () => {
      it('should be a non-empty English string', () => {
        expect(typeof SYSTEM_PROMPT_EN).toBe('string');
        expect(SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
      });

      it('should contain English language content', () => {
        expect(SYSTEM_PROMPT_EN).toContain('Pick-Eat');
        expect(SYSTEM_PROMPT_EN).toContain('food consultant');
        expect(SYSTEM_PROMPT_EN).toContain('<role>');
        expect(SYSTEM_PROMPT_EN).toContain('<input_data>');
        expect(SYSTEM_PROMPT_EN).toContain('<output_format>');
        expect(SYSTEM_PROMPT_EN).toContain('<recommendation_principles>');
        expect(SYSTEM_PROMPT_EN).toContain('<language_rule>');
      });

      it('should contain English-specific instructions', () => {
        expect(SYSTEM_PROMPT_EN).toContain('polite tone');
        expect(SYSTEM_PROMPT_EN).toContain('menu names');
        expect(SYSTEM_PROMPT_EN).toContain('recommendation reasons');
      });
    });

    describe('SYSTEM_PROMPT constant (backward compatibility)', () => {
      it('should equal SYSTEM_PROMPT_KO for backward compatibility', () => {
        expect(SYSTEM_PROMPT).toBe(SYSTEM_PROMPT_KO);
      });
    });

    describe('getSystemPrompt', () => {
      it('should return Korean prompt when language is "ko"', () => {
        const result = getSystemPrompt('ko');
        expect(result).toBe(SYSTEM_PROMPT_KO);
        expect(result).toContain('음식 컨설턴트');
      });

      it('should return English prompt when language is "en"', () => {
        const result = getSystemPrompt('en');
        expect(result).toBe(SYSTEM_PROMPT_EN);
        expect(result).toContain('food consultant');
      });

      it('should default to Korean when no language parameter is provided', () => {
        const result = getSystemPrompt();
        expect(result).toBe(SYSTEM_PROMPT_KO);
      });

      it('should default to Korean when undefined is passed', () => {
        const result = getSystemPrompt(undefined);
        expect(result).toBe(SYSTEM_PROMPT_KO);
      });
    });

    describe('buildUserPrompt with language parameter', () => {
      it('should use provided language parameter "ko" instead of detecting', () => {
        const result = buildUserPrompt(
          'I want pizza',
          ['Italian'],
          [],
          undefined,
          'ko',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should use provided language parameter "en" instead of detecting', () => {
        const result = buildUserPrompt(
          '오늘 점심 뭐 먹을까',
          ['한식'],
          [],
          undefined,
          'en',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should auto-detect language when parameter is not provided', () => {
        const koreanResult = buildUserPrompt(
          '오늘 점심 뭐 먹을까',
          [],
          [],
          undefined,
        );
        expect(koreanResult).toContain('RESPONSE_LANGUAGE: Korean');

        const englishResult = buildUserPrompt(
          'What should I eat for lunch',
          [],
          [],
          undefined,
        );
        expect(englishResult).toContain('RESPONSE_LANGUAGE: English');
      });
    });

    describe('buildUserPromptWithValidation with language parameter', () => {
      const validationContext = {
        intent: 'preference',
        constraints: {
          budget: 'medium',
          dietary: [],
          urgency: 'normal',
        },
        suggestedCategories: ['Korean'],
      };

      it('should use provided language parameter "ko"', () => {
        const result = buildUserPromptWithValidation(
          'I want pizza',
          ['Italian'],
          [],
          undefined,
          validationContext,
          'ko',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should use provided language parameter "en"', () => {
        const result = buildUserPromptWithValidation(
          '오늘 점심 뭐 먹을까',
          ['한식'],
          [],
          undefined,
          validationContext,
          'en',
        );

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should auto-detect language when parameter is not provided', () => {
        const koreanResult = buildUserPromptWithValidation(
          '오늘 점심 뭐 먹을까',
          [],
          [],
          undefined,
          validationContext,
        );
        expect(koreanResult).toContain('RESPONSE_LANGUAGE: Korean');

        const englishResult = buildUserPromptWithValidation(
          'What should I eat for lunch',
          [],
          [],
          undefined,
          validationContext,
        );
        expect(englishResult).toContain('RESPONSE_LANGUAGE: English');
      });
    });

    describe('getMenuRecommendationsJsonSchema', () => {
      it('should return Korean schema when language is "ko"', () => {
        const schema = getMenuRecommendationsJsonSchema('ko');

        expect(schema.properties.recommendations.description).toContain(
          '구체적인 단일 요리명만 사용',
        );
        expect(schema.properties.recommendations.description).toContain(
          '수식어 제외',
        );
        expect(schema.properties.reason.description).toContain('추천 이유');
        expect(schema.properties.reason.description).toContain('존댓말');
      });

      it('should return English schema when language is "en"', () => {
        const schema = getMenuRecommendationsJsonSchema('en');

        expect(schema.properties.recommendations.description).toContain(
          'Specific single dish names only',
        );
        expect(schema.properties.recommendations.description).toContain(
          'no category names',
        );
        expect(schema.properties.reason.description).toContain(
          'recommendation rationale',
        );
        expect(schema.properties.reason.description).toContain('polite tone');
      });

      it('should default to Korean when no language parameter is provided', () => {
        const schema = getMenuRecommendationsJsonSchema();

        expect(schema.properties.recommendations.description).toContain(
          '구체적인 단일 요리명만 사용',
        );
      });

      it('should have same structure for both languages', () => {
        const koSchema = getMenuRecommendationsJsonSchema('ko');
        const enSchema = getMenuRecommendationsJsonSchema('en');

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
        expect(koSchema.properties.reason.type).toBe(
          enSchema.properties.reason.type,
        );
        expect(koSchema.properties.reason.maxLength).toBe(
          enSchema.properties.reason.maxLength,
        );
      });

      it('should only differ in description fields', () => {
        const koSchema = getMenuRecommendationsJsonSchema('ko');
        const enSchema = getMenuRecommendationsJsonSchema('en');

        expect(koSchema.properties.recommendations.description).not.toBe(
          enSchema.properties.recommendations.description,
        );
        expect(koSchema.properties.reason.description).not.toBe(
          enSchema.properties.reason.description,
        );
      });
    });
  });
});
