import {
  SYSTEM_PROMPT_KO,
  SYSTEM_PROMPT_EN,
  getSystemPrompt,
  buildUserPrompt,
  buildUserPromptWithValidation,
  MENU_RECOMMENDATIONS_JSON_SCHEMA,
  getMenuRecommendationsJsonSchema,
  getAgeGroup,
  getAgeGroupEN,
  buildUserPromptWithAddress,
  buildUserProfile,
} from '../../../openai/prompts/menu-recommendation.prompts';
import type { StructuredAnalysis } from '../../../openai/prompts/menu-recommendation.prompts';

const SYSTEM_PROMPT = getSystemPrompt('ko');

describe('menu-recommendation.prompts', () => {
  // ============================================================================
  // System Prompts
  // ============================================================================

  describe('SYSTEM_PROMPT (backward compatibility)', () => {
    it('should equal SYSTEM_PROMPT_KO for backward compatibility', () => {
      expect(SYSTEM_PROMPT).toBe(SYSTEM_PROMPT_KO);
    });

    it('should contain all required section tags and Korean-specific content', () => {
      expect(SYSTEM_PROMPT).toContain('Pick-Eat');
      expect(SYSTEM_PROMPT).toContain('음식 컨설턴트');
      expect(SYSTEM_PROMPT).toContain('<role>');
      expect(SYSTEM_PROMPT).toContain('<input_data>');
      expect(SYSTEM_PROMPT).toContain('USER_PROMPT');
      expect(SYSTEM_PROMPT).toContain('PREFERENCES');
      expect(SYSTEM_PROMPT).toContain('PREFERENCE_ANALYSIS');
      expect(SYSTEM_PROMPT).toContain('<output_format>');
      expect(SYSTEM_PROMPT).toContain('intro');
      expect(SYSTEM_PROMPT).toContain('recommendations');
      expect(SYSTEM_PROMPT).toContain('closing');
      expect(SYSTEM_PROMPT).toContain('<recommendation_principles>');
      expect(SYSTEM_PROMPT).toContain('1-5개의 메뉴');
      expect(SYSTEM_PROMPT).toContain('중복 없음');
      expect(SYSTEM_PROMPT).toContain('탐색 메뉴 필수');
      expect(SYSTEM_PROMPT).toContain('최소 1개는');
      expect(SYSTEM_PROMPT).toContain('<judgment_criteria>');
      expect(SYSTEM_PROMPT).toContain('<recommendation_unavailable_situation>');
      expect(SYSTEM_PROMPT).toContain('빈 배열 []');
      expect(SYSTEM_PROMPT).toContain('<response_structure_guide>');
      expect(SYSTEM_PROMPT).toContain('금지:');
      expect(SYSTEM_PROMPT).toContain('<language_rule>');
      expect(SYSTEM_PROMPT).toContain('RESPONSE_LANGUAGE');
      expect(SYSTEM_PROMPT).toContain('절대적 우선순위');
    });
  });

  describe('SYSTEM_PROMPT_KO / SYSTEM_PROMPT_EN structure', () => {
    const SHARED_TAGS = [
      '<role>',
      '<input_data>',
      '<output_format>',
      '<recommendation_principles>',
      '<language_rule>',
      'Pick-Eat',
      'intro',
    ];

    test.each([
      ['ko', SYSTEM_PROMPT_KO, '음식 컨설턴트', '존댓말', '메뉴명'],
      ['en', SYSTEM_PROMPT_EN, 'food consultant', 'warm', 'menu'],
    ])(
      'SYSTEM_PROMPT_%s should be non-empty, contain shared tags and language-specific content',
      (_lang, prompt, uniquePhrase, uniqueWord1, uniqueWord2) => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        for (const tag of SHARED_TAGS) {
          expect(prompt).toContain(tag);
        }
        expect(prompt).toContain(uniquePhrase);
        expect(prompt).toContain(uniqueWord1);
        expect(prompt).toContain(uniqueWord2);
      },
    );
  });

  describe('getSystemPrompt', () => {
    test.each([
      ['ko' as const, SYSTEM_PROMPT_KO, '음식 컨설턴트'],
      ['en' as const, SYSTEM_PROMPT_EN, 'food consultant'],
    ])(
      'should return %s prompt and contain expected phrase',
      (lang, expectedPrompt, expectedPhrase) => {
        const result = getSystemPrompt(lang);
        expect(result).toBe(expectedPrompt);
        expect(result).toContain(expectedPhrase);
      },
    );

    it('should default to Korean when no language parameter or undefined is passed', () => {
      expect(getSystemPrompt()).toBe(SYSTEM_PROMPT_KO);
      expect(getSystemPrompt(undefined)).toBe(SYSTEM_PROMPT_KO);
    });
  });

  // ============================================================================
  // getAgeGroup
  // ============================================================================

  describe('getAgeGroup', () => {
    const currentYear = new Date().getFullYear();

    test.each([
      [currentYear - 15, '10대'],
      [currentYear - 25, '20대'],
      [currentYear - 35, '30대'],
      [currentYear - 45, '40대'],
      [currentYear - 55, '50대'],
      [currentYear - 65, '60대 이상'],
    ])(
      'should return correct Korean age group for birth year %i (age ~%i)',
      (birthYear, expected) => {
        expect(getAgeGroup(birthYear)).toBe(expected);
      },
    );

    it('should return "10대" for someone who is exactly 10 years old', () => {
      expect(getAgeGroup(currentYear - 10)).toBe('10대');
    });

    it('should return "20대" for someone who is exactly 20 years old', () => {
      expect(getAgeGroup(currentYear - 20)).toBe('20대');
    });

    it('should return "30대" for someone who is exactly 30 years old', () => {
      expect(getAgeGroup(currentYear - 30)).toBe('30대');
    });

    it('should return "40대" for someone who is exactly 40 years old', () => {
      expect(getAgeGroup(currentYear - 40)).toBe('40대');
    });

    it('should return "50대" for someone who is exactly 50 years old', () => {
      expect(getAgeGroup(currentYear - 50)).toBe('50대');
    });

    it('should return "60대 이상" for someone who is exactly 60 years old', () => {
      expect(getAgeGroup(currentYear - 60)).toBe('60대 이상');
    });

    it('should return "60대 이상" for someone who is 80 years old', () => {
      expect(getAgeGroup(currentYear - 80)).toBe('60대 이상');
    });
  });

  // ============================================================================
  // getAgeGroupEN
  // ============================================================================

  describe('getAgeGroupEN', () => {
    const currentYear = new Date().getFullYear();

    test.each([
      [currentYear - 15, 'teens'],
      [currentYear - 25, '20s'],
      [currentYear - 35, '30s'],
      [currentYear - 45, '40s'],
      [currentYear - 55, '50s'],
      [currentYear - 65, '60s or older'],
    ])(
      'should return correct English age group for birth year %i',
      (birthYear, expected) => {
        expect(getAgeGroupEN(birthYear)).toBe(expected);
      },
    );

    it('should return "teens" for someone who is exactly 10 years old', () => {
      expect(getAgeGroupEN(currentYear - 10)).toBe('teens');
    });

    it('should return "20s" for someone who is exactly 20 years old', () => {
      expect(getAgeGroupEN(currentYear - 20)).toBe('20s');
    });

    it('should return "30s" for someone who is exactly 30 years old', () => {
      expect(getAgeGroupEN(currentYear - 30)).toBe('30s');
    });

    it('should return "40s" for someone who is exactly 40 years old', () => {
      expect(getAgeGroupEN(currentYear - 40)).toBe('40s');
    });

    it('should return "50s" for someone who is exactly 50 years old', () => {
      expect(getAgeGroupEN(currentYear - 50)).toBe('50s');
    });

    it('should return "60s or older" for someone who is exactly 60 years old', () => {
      expect(getAgeGroupEN(currentYear - 60)).toBe('60s or older');
    });

    it('should return "60s or older" for someone who is 90 years old', () => {
      expect(getAgeGroupEN(currentYear - 90)).toBe('60s or older');
    });
  });

  // ============================================================================
  // buildUserPrompt
  // ============================================================================

  describe('buildUserPrompt', () => {
    describe('RESPONSE_LANGUAGE detection', () => {
      test.each([
        ['I want something light', 'English', 'pure English text'],
        ['가벼운 거 먹고 싶어', 'Korean', 'pure Korean text'],
        ['I want 김치찌개 today please', 'English', 'English-dominant mixed'],
        ['오늘 pizza 먹을까', 'Korean', 'Korean-dominant mixed'],
        ['abc가나', 'English', 'equal count edge case (English >= Korean)'],
        ['ab가나', 'Korean', 'Korean chars match or exceed English chars'],
        ['123!@#', 'Korean', 'numbers and special chars default to Korean'],
        ['', 'Korean', 'empty string defaults to Korean'],
        ['   ', 'Korean', 'whitespace-only defaults to Korean'],
      ])(
        'should detect %s when prompt is "%s"',
        (prompt, expectedLang, _description) => {
          const result = buildUserPrompt(prompt, [], [], undefined);
          expect(result).toContain(`RESPONSE_LANGUAGE: ${expectedLang}`);
        },
      );

      test.each([
        ['ko' as const, 'I want pizza', 'Korean'],
        ['en' as const, '오늘 점심 뭐 먹을까', 'English'],
      ])(
        'should use explicit language parameter "%s" instead of auto-detecting',
        (lang, prompt, expectedLang) => {
          const result = buildUserPrompt(prompt, [], [], undefined, lang);
          expect(result).toContain(`RESPONSE_LANGUAGE: ${expectedLang}`);
        },
      );
    });

    describe('USER_PROMPT section', () => {
      it('should wrap user input in user_prompt tags and preserve content', () => {
        const result = buildUserPrompt(
          'First line\nSecond line 😋',
          [],
          [],
          undefined,
        );
        expect(result).toContain('<user_prompt>');
        expect(result).toContain('</user_prompt>');
        expect(result).toContain('First line\nSecond line 😋');
      });
    });

    describe('PREFERENCES section - likes and dislikes', () => {
      test.each([
        [
          ['국밥', '찌개'],
          ['매운 음식'],
          'Likes: 국밥, 찌개',
          'Dislikes: 매운 음식',
        ],
        [[], ['매운 음식'], 'Likes: None', 'Dislikes: 매운 음식'],
        [['국밥'], [], 'Likes: 국밥', 'Dislikes: None'],
        [[], [], 'Likes: None', 'Dislikes: None'],
        [null as any, ['매운 음식'], 'Likes: None', 'Dislikes: 매운 음식'],
        [undefined as any, ['매운 음식'], 'Likes: None', 'Dislikes: 매운 음식'],
        [['국밥'], null as any, 'Likes: 국밥', 'Dislikes: None'],
        [['국밥'], undefined as any, 'Likes: 국밥', 'Dislikes: None'],
      ])(
        'should render likes=%j dislikes=%j as "%s" and "%s"',
        (likes, dislikes, expectedLikes, expectedDislikes) => {
          const result = buildUserPrompt('test', likes, dislikes, undefined);
          expect(result).toContain('PREFERENCES (use only what is needed):');
          expect(result).toContain(expectedLikes);
          expect(result).toContain(expectedDislikes);
        },
      );

      it('should join multiple items with comma separator', () => {
        const result = buildUserPrompt(
          'test',
          ['한식', '일식', '중식'],
          ['매운 음식', '기름진 음식'],
          undefined,
        );
        expect(result).toContain('Likes: 한식, 일식, 중식');
        expect(result).toContain('Dislikes: 매운 음식, 기름진 음식');
      });
    });

    describe('PREFERENCE_ANALYSIS section', () => {
      test.each([
        [
          '한식을 선호하시는 경향이 있습니다.',
          '한식을 선호하시는 경향이 있습니다.',
        ],
        [undefined, 'None'],
        ['', 'None'],
        ['   ', 'None'],
      ])(
        'should render analysis "%s" correctly',
        (analysis, expectedInResult) => {
          const result = buildUserPrompt('test', [], [], analysis);
          expect(result).toContain('PREFERENCE_ANALYSIS:');
          expect(result).toContain(expectedInResult);
        },
      );

      it('should trim whitespace from analysis text', () => {
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

    describe('compactSummary parameter', () => {
      it('should use compactSummary when provided instead of analysis', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          '기존 분석 내용',
          undefined,
          '간결 요약본',
        );
        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('간결 요약본');
        expect(result).not.toContain('기존 분석 내용');
      });

      it('should fall back to analysis when compactSummary is not provided', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          '기존 분석 내용',
          undefined,
          undefined,
        );
        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('기존 분석 내용');
      });

      it('should show None when both compactSummary and analysis are absent', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
        );
        expect(result).toContain('PREFERENCE_ANALYSIS:');
        expect(result).toContain('None');
      });

      it('should prefer compactSummary over analysis even when both provided', () => {
        const result = buildUserPrompt(
          'test prompt',
          ['한식'],
          [],
          'full analysis text',
          'ko',
          'compact summary text',
        );
        expect(result).toContain('compact summary text');
        expect(result).not.toContain('full analysis text');
      });
    });

    describe('structuredAnalysis parameter', () => {
      const mockStructuredAnalysis: StructuredAnalysis = {
        stablePatterns: {
          confidence: 'high',
          categories: ['한식', '일식'],
          flavors: ['담백한', '깔끔한'],
          cookingMethods: ['찜', '구이'],
        },
        recentSignals: {
          trending: ['마라탕'],
          declining: ['패스트푸드'],
        },
        diversityHints: {
          explorationAreas: ['중식', '동남아식'],
          rotationSuggestions: [],
        },
      };

      it('should include STRUCTURED_PREFERENCE_ANALYSIS section when provided', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          mockStructuredAnalysis,
        );
        expect(result).toContain('STRUCTURED_PREFERENCE_ANALYSIS:');
      });

      it('should include stablePatterns data with confidence and arrays', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          mockStructuredAnalysis,
        );
        expect(result).toContain('Stable Patterns (confidence: high):');
        expect(result).toContain('Categories: 한식, 일식');
        expect(result).toContain('Flavors: 담백한, 깔끔한');
        expect(result).toContain('Cooking Methods: 찜, 구이');
      });

      it('should include recentSignals data with trending and declining', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          mockStructuredAnalysis,
        );
        expect(result).toContain('Recent Signals:');
        expect(result).toContain('Trending (max 1): 마라탕');
        expect(result).toContain('Declining (NEVER recommend): 패스트푸드');
      });

      it('should include diversityHints explorationAreas', () => {
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          mockStructuredAnalysis,
        );
        expect(result).toContain(
          'Exploration Areas (include at least 1): 중식, 동남아식',
        );
      });

      it('should not include STRUCTURED_PREFERENCE_ANALYSIS section when not provided', () => {
        const result = buildUserPrompt('test', [], [], undefined);
        expect(result).not.toContain('STRUCTURED_PREFERENCE_ANALYSIS:');
      });

      it('should handle structuredAnalysis without stablePatterns', () => {
        const partialAnalysis: StructuredAnalysis = {
          recentSignals: {
            trending: ['마라탕'],
            declining: [],
          },
          diversityHints: {
            explorationAreas: ['중식'],
            rotationSuggestions: [],
          },
        };
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          partialAnalysis,
        );
        expect(result).toContain('STRUCTURED_PREFERENCE_ANALYSIS:');
        expect(result).not.toContain('Stable Patterns');
        expect(result).toContain('Recent Signals:');
      });

      it('should handle structuredAnalysis without recentSignals', () => {
        const partialAnalysis: StructuredAnalysis = {
          stablePatterns: {
            confidence: 'medium',
            categories: ['한식'],
            flavors: ['매운'],
            cookingMethods: ['볶음'],
          },
          diversityHints: {
            explorationAreas: ['일식'],
            rotationSuggestions: [],
          },
        };
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          partialAnalysis,
        );
        expect(result).toContain('STRUCTURED_PREFERENCE_ANALYSIS:');
        expect(result).toContain('Stable Patterns (confidence: medium):');
        expect(result).not.toContain('Recent Signals:');
      });

      it('should handle structuredAnalysis without diversityHints', () => {
        const partialAnalysis: StructuredAnalysis = {
          stablePatterns: {
            confidence: 'low',
            categories: ['한식'],
            flavors: [],
            cookingMethods: [],
          },
          recentSignals: {
            trending: [],
            declining: [],
          },
        };
        const result = buildUserPrompt(
          'test',
          [],
          [],
          undefined,
          undefined,
          undefined,
          partialAnalysis,
        );
        expect(result).toContain('STRUCTURED_PREFERENCE_ANALYSIS:');
        expect(result).not.toContain('Exploration Areas');
      });
    });

    describe('output structure', () => {
      it('should have correct section order with all required sections', () => {
        const result = buildUserPrompt(
          '테스트 프롬프트',
          ['한식'],
          ['양식'],
          '분석 내용',
        );
        const lines = result.split('\n');

        expect(lines[0]).toBe('RESPONSE_LANGUAGE: Korean');
        expect(lines[1]).toBe('');
        expect(lines[2]).toBe('<user_prompt>');
        expect(lines[3]).toBe('테스트 프롬프트');
        expect(lines[4]).toBe('</user_prompt>');
        expect(lines[5]).toBe('---');
        expect(lines[6]).toBe('PREFERENCES (use only what is needed):');
        expect(lines[7]).toBe('Likes: 한식');
        expect(lines[8]).toBe('Dislikes: 양식');
        expect(lines[9]).toBe('---');
        expect(lines[10]).toBe('PREFERENCE_ANALYSIS:');
        expect(lines[11]).toBe('분석 내용');

        const separators = result.match(/---/g);
        expect(separators).toHaveLength(2);
      });

      it('should maintain consistent structure with minimal data', () => {
        const result = buildUserPrompt('', [], [], undefined);
        expect(result).toContain('RESPONSE_LANGUAGE:');
        expect(result).toContain('<user_prompt>');
        expect(result).toContain('PREFERENCES (use only what is needed):');
        expect(result).toContain('PREFERENCE_ANALYSIS:');
      });
    });

    describe('comprehensive integration', () => {
      test.each([
        [
          'I want something light and healthy for lunch today',
          ['Soup', 'Salad', 'Fish'],
          ['Spicy food', 'Fried food'],
          'User prefers light meals',
          'English',
        ],
        [
          '오늘 점심으로 가볍고 건강한 음식을 먹고 싶어요',
          ['국물요리', '샐러드', '생선'],
          ['매운 음식', '기름진 음식'],
          '사용자는 가벼운 식사를 선호하고 무거운 음식을 피합니다.',
          'Korean',
        ],
      ])(
        'should correctly build complete prompt for %s language',
        (prompt, likes, dislikes, analysis, expectedLang) => {
          const result = buildUserPrompt(prompt, likes, dislikes, analysis);
          expect(result).toContain(`RESPONSE_LANGUAGE: ${expectedLang}`);
          expect(result).toContain('<user_prompt>');
          expect(result).toContain(prompt);
          expect(result).toContain(`Likes: ${likes.join(', ')}`);
          expect(result).toContain(`Dislikes: ${dislikes.join(', ')}`);
          expect(result).toContain(analysis);
        },
      );
    });
  });

  // ============================================================================
  // buildUserPromptWithValidation
  // ============================================================================

  describe('buildUserPromptWithValidation', () => {
    const baseParams = {
      userPrompt: 'I want pizza',
      likes: ['Italian', 'Fast food'],
      dislikes: ['Spicy'],
      analysis: 'User enjoys Western cuisine',
    };

    const fullValidationContext = {
      intent: 'preference',
      constraints: {
        budget: 'medium',
        dietary: ['vegetarian'],
        urgency: 'normal',
      },
      suggestedCategories: ['Italian', 'Pizza', 'Western'],
    };

    it('should include base prompt content and VALIDATION_CONTEXT section', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        fullValidationContext,
      );

      expect(result).toContain('RESPONSE_LANGUAGE: English');
      expect(result).toContain('<user_prompt>');
      expect(result).toContain('I want pizza');
      expect(result).toContain('Likes: Italian, Fast food');
      expect(result).toContain('Dislikes: Spicy');
      expect(result).toContain('User enjoys Western cuisine');
      expect(result).toContain('VALIDATION_CONTEXT (Stage 1 analysis result):');
      expect(result).toContain('Intent: preference');
    });

    it('should place base prompt before validation context', () => {
      const result = buildUserPromptWithValidation(
        baseParams.userPrompt,
        baseParams.likes,
        baseParams.dislikes,
        baseParams.analysis,
        fullValidationContext,
      );
      expect(result.indexOf('RESPONSE_LANGUAGE')).toBeLessThan(
        result.indexOf('VALIDATION_CONTEXT'),
      );
    });

    describe('optional constraint fields', () => {
      test.each([
        ['budget', 'Budget: medium', true],
        ['urgency', 'Urgency: normal', true],
        ['dietary', 'Dietary restrictions: vegetarian', true],
      ])(
        'should include %s constraint when provided',
        (_field, expectedText, _shouldContain) => {
          const result = buildUserPromptWithValidation(
            baseParams.userPrompt,
            baseParams.likes,
            baseParams.dislikes,
            baseParams.analysis,
            fullValidationContext,
          );
          expect(result).toContain(expectedText);
        },
      );

      it('should omit budget, urgency, dietary when not provided', () => {
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
        expect(result).toContain('Intent: mood');
        expect(result).not.toContain('Budget:');
        expect(result).not.toContain('Dietary restrictions:');
        expect(result).not.toContain('Urgency:');
        expect(result).not.toContain('Suggested categories:');
      });

      it('should omit dietary restrictions when empty array', () => {
        const context = {
          ...fullValidationContext,
          constraints: { ...fullValidationContext.constraints, dietary: [] },
        };
        const result = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          context,
        );
        expect(result).not.toContain('Dietary restrictions:');
      });

      it('should include multiple dietary restrictions joined by comma', () => {
        const context = {
          ...fullValidationContext,
          constraints: {
            ...fullValidationContext.constraints,
            dietary: ['vegetarian', 'gluten-free', 'dairy-free'],
          },
        };
        const result = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          context,
        );
        expect(result).toContain(
          'Dietary restrictions: vegetarian, gluten-free, dairy-free',
        );
      });

      it('should include suggested categories when provided and omit when empty', () => {
        const withCategories = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          fullValidationContext,
        );
        expect(withCategories).toContain(
          'Suggested categories: Italian, Pizza, Western',
        );

        const withoutCategories = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          { ...fullValidationContext, suggestedCategories: [] },
        );
        expect(withoutCategories).not.toContain('Suggested categories:');
      });
    });

    describe('language parameter override', () => {
      test.each([
        ['ko' as const, 'I want pizza', 'Korean'],
        ['en' as const, '오늘 점심 뭐 먹을까', 'English'],
      ])(
        'should use explicit language "%s" instead of auto-detecting',
        (lang, prompt, expectedLang) => {
          const result = buildUserPromptWithValidation(
            prompt,
            [],
            [],
            undefined,
            fullValidationContext,
            lang,
          );
          expect(result).toContain(`RESPONSE_LANGUAGE: ${expectedLang}`);
        },
      );

      it('should auto-detect language when parameter is not provided', () => {
        const koResult = buildUserPromptWithValidation(
          '오늘 점심 뭐 먹을까',
          [],
          [],
          undefined,
          fullValidationContext,
        );
        expect(koResult).toContain('RESPONSE_LANGUAGE: Korean');

        const enResult = buildUserPromptWithValidation(
          'What should I eat for lunch',
          [],
          [],
          undefined,
          fullValidationContext,
        );
        expect(enResult).toContain('RESPONSE_LANGUAGE: English');
      });
    });

    it('should handle all intent types', () => {
      for (const intent of ['preference', 'mood', 'location', 'mixed']) {
        const result = buildUserPromptWithValidation(
          baseParams.userPrompt,
          baseParams.likes,
          baseParams.dislikes,
          baseParams.analysis,
          { ...fullValidationContext, intent },
        );
        expect(result).toContain(`Intent: ${intent}`);
      }
    });

    it('should handle Korean context with validation', () => {
      const result = buildUserPromptWithValidation(
        '오늘 점심 뭐 먹을까',
        ['한식'],
        ['매운 음식'],
        '한식 선호 경향',
        {
          intent: '선호',
          constraints: { budget: '중간', dietary: ['채식'], urgency: '보통' },
          suggestedCategories: ['한식', '일식'],
        },
      );
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('Intent: 선호');
      expect(result).toContain('Budget: 중간');
      expect(result).toContain('Dietary restrictions: 채식');
      expect(result).toContain('Urgency: 보통');
      expect(result).toContain('Suggested categories: 한식, 일식');
    });
  });

  // ============================================================================
  // MENU_RECOMMENDATIONS_JSON_SCHEMA (backward compatibility)
  // ============================================================================

  describe('MENU_RECOMMENDATIONS_JSON_SCHEMA (backward compatibility - Korean)', () => {
    it('should have correct top-level structure', () => {
      expect(typeof MENU_RECOMMENDATIONS_JSON_SCHEMA).toBe('object');
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA).not.toBeNull();
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.type).toBe('object');
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.additionalProperties).toBe(false);
      expect(MENU_RECOMMENDATIONS_JSON_SCHEMA.required).toEqual([
        'intro',
        'recommendations',
        'closing',
      ]);
    });

    it('should define intro and closing as string properties with Korean descriptions', () => {
      const { intro, closing } = MENU_RECOMMENDATIONS_JSON_SCHEMA.properties;
      expect(intro.type).toBe('string');
      expect(intro.minLength).toBe(50);
      expect(intro.maxLength).toBe(500);
      expect(intro.description).toContain('첫 설명');
      expect(closing.type).toBe('string');
    });

    it('should define recommendations as array with correct constraints and Korean description', () => {
      const { recommendations } = MENU_RECOMMENDATIONS_JSON_SCHEMA.properties;
      expect(recommendations.type).toBe('array');
      expect(recommendations.minItems).toBe(1);
      expect(recommendations.maxItems).toBe(5);
      expect(recommendations.description).toContain('조건 + 메뉴 배열');
      expect(recommendations.items.type).toBe('object');
      expect(recommendations.items.properties.condition).toBeDefined();
      expect(recommendations.items.properties.menu).toBeDefined();
      expect(recommendations.items.required).toEqual(['condition', 'menu']);
    });
  });

  // ============================================================================
  // getMenuRecommendationsJsonSchema
  // ============================================================================

  describe('getMenuRecommendationsJsonSchema', () => {
    test.each([
      [
        'ko' as const,
        {
          intro: '첫 설명',
          recommendations: '조건 + 메뉴 배열',
          closing: '마무리 말',
        },
      ],
      [
        'en' as const,
        {
          intro: 'Opening explanation',
          recommendations: 'Condition + menu array',
          closing: 'Closing remark',
        },
      ],
    ])(
      'should return correct descriptions for language "%s"',
      (lang, expectedDescriptions) => {
        const schema = getMenuRecommendationsJsonSchema(lang);
        expect(schema.properties.intro.description).toContain(
          expectedDescriptions.intro,
        );
        expect(schema.properties.recommendations.description).toContain(
          expectedDescriptions.recommendations,
        );
        expect(schema.properties.closing.description).toContain(
          expectedDescriptions.closing,
        );
      },
    );

    it('should default to Korean when no language parameter is provided', () => {
      const schema = getMenuRecommendationsJsonSchema();
      expect(schema.properties.intro.description).toContain('첫 설명');
    });

    it('should have identical structure for both languages, differing only in descriptions', () => {
      const koSchema = getMenuRecommendationsJsonSchema('ko');
      const enSchema = getMenuRecommendationsJsonSchema('en');

      expect(koSchema.type).toBe(enSchema.type);
      expect(koSchema.required).toEqual(enSchema.required);
      expect(koSchema.additionalProperties).toBe(enSchema.additionalProperties);

      const koProp = koSchema.properties;
      const enProp = enSchema.properties;
      expect(koProp.intro.type).toBe(enProp.intro.type);
      expect(koProp.intro.minLength).toBe(enProp.intro.minLength);
      expect(koProp.intro.maxLength).toBe(enProp.intro.maxLength);
      expect(koProp.recommendations.type).toBe(enProp.recommendations.type);
      expect(koProp.recommendations.minItems).toBe(
        enProp.recommendations.minItems,
      );
      expect(koProp.recommendations.maxItems).toBe(
        enProp.recommendations.maxItems,
      );
      expect(koProp.closing.type).toBe(enProp.closing.type);

      // descriptions must differ
      expect(koProp.intro.description).not.toBe(enProp.intro.description);
      expect(koProp.recommendations.description).not.toBe(
        enProp.recommendations.description,
      );
      expect(koProp.closing.description).not.toBe(enProp.closing.description);
    });
  });

  // ============================================================================
  // buildUserProfile
  // ============================================================================

  describe('buildUserProfile', () => {
    const currentYear = new Date().getFullYear();

    it('should return empty profile when no parameters provided', () => {
      const result = buildUserProfile();
      expect(result).toEqual({});
    });

    describe('country field', () => {
      it('should include country when provided', () => {
        const result = buildUserProfile(undefined, undefined, 'Korea');
        expect(result.country).toBe('Korea');
      });

      it('should not include country when not provided', () => {
        const result = buildUserProfile(undefined, undefined, undefined);
        expect(result.country).toBeUndefined();
      });
    });

    describe('ageGroup field', () => {
      it('should set Korean age group when language is ko', () => {
        const result = buildUserProfile(
          currentYear - 30,
          undefined,
          undefined,
          'ko',
        );
        expect(result.ageGroup).toBe('30대');
      });

      it('should set English age group when language is en', () => {
        const result = buildUserProfile(
          currentYear - 30,
          undefined,
          undefined,
          'en',
        );
        expect(result.ageGroup).toBe('30s');
      });

      it('should default to Korean age group when language not specified', () => {
        const result = buildUserProfile(currentYear - 25);
        expect(result.ageGroup).toBe('20대');
      });

      it('should not include ageGroup when birthYear is not provided', () => {
        const result = buildUserProfile(undefined, undefined, undefined, 'ko');
        expect(result.ageGroup).toBeUndefined();
      });

      it('should not include ageGroup when birthYear is before 1900', () => {
        const result = buildUserProfile(1800, undefined, undefined, 'ko');
        expect(result.ageGroup).toBeUndefined();
      });

      it('should not include ageGroup when birthYear is in the future', () => {
        const result = buildUserProfile(
          currentYear + 1,
          undefined,
          undefined,
          'ko',
        );
        expect(result.ageGroup).toBeUndefined();
      });

      it('should include ageGroup when birthYear is exactly 1900', () => {
        const result = buildUserProfile(1900, undefined, undefined, 'ko');
        expect(result.ageGroup).toBeDefined();
        expect(result.ageGroup).toBe('60대 이상');
      });

      it('should include ageGroup when birthYear is the current year', () => {
        const result = buildUserProfile(
          currentYear,
          undefined,
          undefined,
          'ko',
        );
        expect(result.ageGroup).toBeDefined();
        expect(result.ageGroup).toBe('10대');
      });
    });

    describe('gender field', () => {
      test.each([
        ['male', 'ko', '남성'],
        ['female', 'ko', '여성'],
        ['other', 'ko', '기타'],
        ['male', 'en', 'Male'],
        ['female', 'en', 'Female'],
        ['other', 'en', 'Other'],
      ])(
        'should map gender "%s" to "%s" for language "%s"',
        (gender, language, expected) => {
          const result = buildUserProfile(
            undefined,
            gender,
            undefined,
            language as 'ko' | 'en',
          );
          expect(result.gender).toBe(expected);
        },
      );

      it('should not include gender when not provided', () => {
        const result = buildUserProfile(undefined, undefined, undefined, 'ko');
        expect(result.gender).toBeUndefined();
      });

      it('should not include gender when invalid value provided', () => {
        const result = buildUserProfile(
          undefined,
          'invalid-gender',
          undefined,
          'ko',
        );
        expect(result.gender).toBeUndefined();
      });
    });

    it('should build complete profile with all fields', () => {
      const result = buildUserProfile(currentYear - 35, 'female', 'USA', 'en');
      expect(result.country).toBe('USA');
      expect(result.ageGroup).toBe('30s');
      expect(result.gender).toBe('Female');
    });

    it('should build complete Korean profile with all fields', () => {
      const result = buildUserProfile(currentYear - 45, 'male', '한국', 'ko');
      expect(result.country).toBe('한국');
      expect(result.ageGroup).toBe('40대');
      expect(result.gender).toBe('남성');
    });
  });

  // ============================================================================
  // buildUserPromptWithAddress
  // ============================================================================

  describe('buildUserPromptWithAddress', () => {
    const baseArgs = {
      prompt: '오늘 점심 뭐 먹을까',
      likes: ['한식'],
      dislikes: ['매운 음식'],
      analysis: '한식 선호',
    };

    it('should include base prompt content without optional sections when nothing extra provided', () => {
      const result = buildUserPromptWithAddress(
        baseArgs.prompt,
        baseArgs.likes,
        baseArgs.dislikes,
        baseArgs.analysis,
      );
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('<user_prompt>');
      expect(result).toContain(baseArgs.prompt);
      expect(result).toContain('Likes: 한식');
      expect(result).toContain('Dislikes: 매운 음식');
      expect(result).not.toContain('USER_PROFILE');
      expect(result).not.toContain('USER_ADDRESS');
      expect(result).not.toContain('LOCAL_TRENDS');
    });

    it('should use buildUserPromptWithValidation when validationContext is provided', () => {
      const validationContext = {
        intent: 'preference' as const,
        constraints: {
          budget: 'low' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };
      const result = buildUserPromptWithAddress(
        baseArgs.prompt,
        baseArgs.likes,
        baseArgs.dislikes,
        baseArgs.analysis,
        validationContext,
      );
      expect(result).toContain('VALIDATION_CONTEXT (Stage 1 analysis result):');
      expect(result).toContain('Intent: preference');
      expect(result).toContain('Budget: low');
    });

    it('should use buildUserPrompt when validationContext is not provided', () => {
      const result = buildUserPromptWithAddress(
        baseArgs.prompt,
        baseArgs.likes,
        baseArgs.dislikes,
        baseArgs.analysis,
        undefined,
      );
      expect(result).not.toContain('VALIDATION_CONTEXT');
    });

    describe('USER_PROFILE section', () => {
      it('should include Korean USER_PROFILE label when language is ko', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          { country: '한국', ageGroup: '30대', gender: '남성' },
          'ko',
        );
        expect(result).toContain('USER_PROFILE (참고용):');
        expect(result).toContain('  국가: 한국');
        expect(result).toContain('  연령대: 30대');
        expect(result).toContain('  성별: 남성');
      });

      it('should include English USER_PROFILE label when language is en', () => {
        const result = buildUserPromptWithAddress(
          'I want lunch',
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          { country: 'USA', ageGroup: '30s', gender: 'Male' },
          'en',
        );
        expect(result).toContain('USER_PROFILE (reference only):');
        expect(result).toContain('  Country: USA');
        expect(result).toContain('  Age Group: 30s');
        expect(result).toContain('  Gender: Male');
      });

      it('should not include USER_PROFILE when userProfile is not provided', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).not.toContain('USER_PROFILE');
      });

      it('should not include USER_PROFILE when all profile fields are undefined', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          {},
          'ko',
        );
        expect(result).not.toContain('USER_PROFILE');
      });

      it('should include profile with only country when ageGroup and gender are missing', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          { country: '한국' },
          'ko',
        );
        expect(result).toContain('USER_PROFILE (참고용):');
        expect(result).toContain('  국가: 한국');
        expect(result).not.toContain('연령대:');
        expect(result).not.toContain('성별:');
      });

      it('should include profile with only ageGroup when country and gender are missing', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          { ageGroup: '20대' },
          'ko',
        );
        expect(result).toContain('USER_PROFILE (참고용):');
        expect(result).toContain('  연령대: 20대');
        expect(result).not.toContain('국가:');
        expect(result).not.toContain('성별:');
      });

      it('should include profile with only gender when country and ageGroup are missing', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          { gender: '여성' },
          'ko',
        );
        expect(result).toContain('USER_PROFILE (참고용):');
        expect(result).toContain('  성별: 여성');
        expect(result).not.toContain('국가:');
        expect(result).not.toContain('연령대:');
      });
    });

    describe('USER_ADDRESS section', () => {
      it('should include Korean USER_ADDRESS label when language is ko', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          '서울특별시 강남구 역삼동',
          undefined,
          'ko',
        );
        expect(result).toContain('USER_ADDRESS (위치 참고):');
        expect(result).toContain('서울특별시 강남구 역삼동');
      });

      it('should include English USER_ADDRESS label when language is en', () => {
        const result = buildUserPromptWithAddress(
          'I want lunch',
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          '123 Main St, New York',
          undefined,
          'en',
        );
        expect(result).toContain('USER_ADDRESS (location reference):');
        expect(result).toContain('123 Main St, New York');
      });

      it('should not include USER_ADDRESS when userAddress is not provided', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
        );
        expect(result).not.toContain('USER_ADDRESS');
      });
    });

    describe('LOCAL_TRENDS section from webSearchSummary', () => {
      it('should include Korean LOCAL_TRENDS label when confidence is high', () => {
        const webSearchSummary = {
          localTrends: ['삼겹살', '김치찌개'],
          demographicFavorites: ['비빔밥'],
          seasonalItems: ['냉면'],
          confidence: 'high' as const,
          summary: '여름철 인기 메뉴 요약',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).toContain('LOCAL_TRENDS (참고용, 사용자 선호도 우선):');
        expect(result).toContain('  지역 인기: 삼겹살, 김치찌개');
        expect(result).toContain('  인구통계 인기: 비빔밥');
        expect(result).toContain('  계절 메뉴: 냉면');
        expect(result).toContain('  요약: 여름철 인기 메뉴 요약');
      });

      it('should include English LOCAL_TRENDS label when language is en', () => {
        const webSearchSummary = {
          localTrends: ['pizza', 'pasta'],
          demographicFavorites: ['burger'],
          seasonalItems: ['ice cream'],
          confidence: 'medium' as const,
          summary: 'Summer food trends',
        };
        const result = buildUserPromptWithAddress(
          'I want lunch',
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'en',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).toContain(
          'LOCAL_TRENDS (reference only, user preferences take priority):',
        );
        expect(result).toContain('  Local popular: pizza, pasta');
        expect(result).toContain('  Demographic popular: burger');
        expect(result).toContain('  Seasonal: ice cream');
        expect(result).toContain('  Summary: Summer food trends');
      });

      it('should not include LOCAL_TRENDS when confidence is low', () => {
        const webSearchSummary = {
          localTrends: ['삼겹살'],
          demographicFavorites: [],
          seasonalItems: [],
          confidence: 'low' as const,
          summary: '',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).not.toContain('LOCAL_TRENDS');
      });

      it('should not include LOCAL_TRENDS when webSearchSummary is null', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          null,
        );
        expect(result).not.toContain('LOCAL_TRENDS');
      });

      it('should not include LOCAL_TRENDS when webSearchSummary is not provided', () => {
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
        );
        expect(result).not.toContain('LOCAL_TRENDS');
      });

      it('should omit localTrends line when array is empty', () => {
        const webSearchSummary = {
          localTrends: [],
          demographicFavorites: ['비빔밥'],
          seasonalItems: [],
          confidence: 'high' as const,
          summary: '',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).toContain('LOCAL_TRENDS');
        expect(result).not.toContain('지역 인기:');
        expect(result).toContain('  인구통계 인기: 비빔밥');
      });

      it('should omit demographicFavorites line when array is empty', () => {
        const webSearchSummary = {
          localTrends: ['삼겹살'],
          demographicFavorites: [],
          seasonalItems: [],
          confidence: 'medium' as const,
          summary: '',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).toContain('  지역 인기: 삼겹살');
        expect(result).not.toContain('인구통계 인기:');
      });

      it('should omit seasonalItems line when array is empty', () => {
        const webSearchSummary = {
          localTrends: [],
          demographicFavorites: [],
          seasonalItems: [],
          confidence: 'high' as const,
          summary: '요약 텍스트',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).not.toContain('계절 메뉴:');
        expect(result).toContain('  요약: 요약 텍스트');
      });

      it('should omit summary line when summary is empty string', () => {
        const webSearchSummary = {
          localTrends: ['삼겹살'],
          demographicFavorites: [],
          seasonalItems: [],
          confidence: 'high' as const,
          summary: '',
        };
        const result = buildUserPromptWithAddress(
          baseArgs.prompt,
          baseArgs.likes,
          baseArgs.dislikes,
          baseArgs.analysis,
          undefined,
          undefined,
          undefined,
          'ko',
          undefined,
          undefined,
          webSearchSummary,
        );
        expect(result).not.toContain('요약:');
      });
    });

    it('should build full prompt with all optional sections for Korean', () => {
      const currentYear = new Date().getFullYear();
      const webSearchSummary = {
        localTrends: ['삼겹살'],
        demographicFavorites: ['비빔밥'],
        seasonalItems: ['냉면'],
        confidence: 'high' as const,
        summary: '요약',
      };
      const result = buildUserPromptWithAddress(
        baseArgs.prompt,
        baseArgs.likes,
        baseArgs.dislikes,
        baseArgs.analysis,
        undefined,
        '서울특별시 강남구',
        { country: '한국', ageGroup: '30대', gender: '남성' },
        'ko',
        undefined,
        undefined,
        webSearchSummary,
      );
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      expect(result).toContain('USER_PROFILE (참고용):');
      expect(result).toContain('USER_ADDRESS (위치 참고):');
      expect(result).toContain('LOCAL_TRENDS (참고용, 사용자 선호도 우선):');
      void currentYear;
    });
  });
});
