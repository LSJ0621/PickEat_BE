import {
  VALIDATION_SYSTEM_PROMPT_KO,
  VALIDATION_SYSTEM_PROMPT_EN,
  getValidationSystemPrompt,
  buildValidationUserPrompt,
  getValidationJsonSchema,
} from '../../../openai/prompts/menu-validation.prompts';

describe('menu-validation.prompts', () => {
  // ---------------------------------------------------------------------------
  // System prompt constants
  // ---------------------------------------------------------------------------
  describe('VALIDATION_SYSTEM_PROMPT_KO / VALIDATION_SYSTEM_PROMPT_EN', () => {
    it.each([
      {
        lang: 'ko' as const,
        prompt: VALIDATION_SYSTEM_PROMPT_KO,
        uniqueText: '음식 요청 분석 전문가',
      },
      {
        lang: 'en' as const,
        prompt: VALIDATION_SYSTEM_PROMPT_EN,
        uniqueText: 'food request analysis expert',
      },
    ])(
      'should contain required section tags and unique identifier ($lang)',
      ({ prompt, uniqueText }) => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain(uniqueText);

        const requiredTags = [
          '<role>',
          '<judgment_criteria>',
          '<intent_classification>',
          '<constraint_extraction>',
          '<category_suggestion>',
          '<important_all_fields_required>',
          '<input_safety>',
          '<language_rule>',
        ];
        requiredTags.forEach((tag) => expect(prompt).toContain(tag));
      },
    );

    it('KO prompt should contain all intent types and Korean language instruction', () => {
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('preference');
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('mood');
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('location');
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('mixed');
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('한국어 입력');
      expect(VALIDATION_SYSTEM_PROMPT_KO).toContain('영어 입력');
    });

    it('EN prompt should contain all intent types and English language instruction', () => {
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('preference');
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('mood');
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('location');
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('mixed');
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('Korean input');
      expect(VALIDATION_SYSTEM_PROMPT_EN).toContain('English input');
    });
  });

  // ---------------------------------------------------------------------------
  // getValidationSystemPrompt
  // ---------------------------------------------------------------------------
  describe('getValidationSystemPrompt', () => {
    it.each([
      { lang: 'ko' as const, expected: VALIDATION_SYSTEM_PROMPT_KO },
      { lang: 'en' as const, expected: VALIDATION_SYSTEM_PROMPT_EN },
    ])(
      'should return $lang prompt when language is "$lang"',
      ({ lang, expected }) => {
        expect(getValidationSystemPrompt(lang)).toBe(expected);
      },
    );

    it('should default to Korean when no argument is given', () => {
      expect(getValidationSystemPrompt()).toBe(VALIDATION_SYSTEM_PROMPT_KO);
      expect(getValidationSystemPrompt(undefined)).toBe(
        VALIDATION_SYSTEM_PROMPT_KO,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // buildValidationUserPrompt
  // ---------------------------------------------------------------------------
  describe('buildValidationUserPrompt', () => {
    const PROMPT_STRUCTURE_KEYS = [
      '<user_request>',
      '</user_request>',
      '---',
      'USER_PREFERENCES (for reference):',
      'Likes:',
      'Dislikes:',
    ] as const;

    it('should produce correct 7-line structure with non-empty preferences', () => {
      const result = buildValidationUserPrompt(
        '오늘 점심 뭐 먹을까',
        ['한식', '일식'],
        ['양식', '중식'],
      );

      PROMPT_STRUCTURE_KEYS.forEach((key) => expect(result).toContain(key));
      expect(result).toContain('오늘 점심 뭐 먹을까');
      expect(result).toContain('Likes: 한식, 일식');
      expect(result).toContain('Dislikes: 양식, 중식');
    });

    it('should produce exact 7-line layout', () => {
      const result = buildValidationUserPrompt('데이트 식당 추천', [], []);
      const lines = result.split('\n');
      expect(lines).toHaveLength(7);
      expect(lines[0]).toBe('<user_request>');
      expect(lines[1]).toBe('데이트 식당 추천');
      expect(lines[2]).toBe('</user_request>');
      expect(lines[3]).toBe('---');
      expect(lines[4]).toBe('USER_PREFERENCES (for reference):');
      expect(lines[5]).toBe('Likes: None');
      expect(lines[6]).toBe('Dislikes: None');
    });

    it.each([
      {
        likes: [],
        dislikes: ['양식'],
        expectedLikes: 'None',
        expectedDislikes: '양식',
      },
      {
        likes: ['한식'],
        dislikes: [],
        expectedLikes: '한식',
        expectedDislikes: 'None',
      },
      {
        likes: [],
        dislikes: [],
        expectedLikes: 'None',
        expectedDislikes: 'None',
      },
      {
        likes: null as unknown as string[],
        dislikes: ['양식'],
        expectedLikes: 'None',
        expectedDislikes: '양식',
      },
      {
        likes: undefined as unknown as string[],
        dislikes: ['양식'],
        expectedLikes: 'None',
        expectedDislikes: '양식',
      },
      {
        likes: ['한식'],
        dislikes: null as unknown as string[],
        expectedLikes: '한식',
        expectedDislikes: 'None',
      },
      {
        likes: null as unknown as string[],
        dislikes: null as unknown as string[],
        expectedLikes: 'None',
        expectedDislikes: 'None',
      },
    ])(
      'should show "None" correctly - likes=$likes, dislikes=$dislikes',
      ({ likes, dislikes, expectedLikes, expectedDislikes }) => {
        const result = buildValidationUserPrompt('점심 추천', likes, dislikes);
        expect(result).toContain(`Likes: ${expectedLikes}`);
        expect(result).toContain(`Dislikes: ${expectedDislikes}`);
      },
    );

    it('should handle special characters and line breaks in user prompt', () => {
      expect(
        buildValidationUserPrompt(
          '오늘 점심 뭐 먹을까? 😋',
          ['한식'],
          ['양식'],
        ),
      ).toContain('오늘 점심 뭐 먹을까? 😋');

      expect(
        buildValidationUserPrompt('오늘 점심\n뭐 먹을까', ['한식'], ['양식']),
      ).toContain('오늘 점심\n뭐 먹을까');
    });

    it('should produce identical output regardless of language parameter', () => {
      const input = '오늘 점심 뭐 먹을까';
      const likes = ['한식'];
      const dislikes = ['양식'];

      const resultKo = buildValidationUserPrompt(input, likes, dislikes, 'ko');
      const resultEn = buildValidationUserPrompt(input, likes, dislikes, 'en');
      const resultNone = buildValidationUserPrompt(input, likes, dislikes);

      expect(resultKo).toBe(resultEn);
      expect(resultEn).toBe(resultNone);
    });
  });

  // ---------------------------------------------------------------------------
  // getValidationJsonSchema
  // ---------------------------------------------------------------------------
  describe('getValidationJsonSchema', () => {
    it('should have correct top-level structure', () => {
      const schema = getValidationJsonSchema('ko');
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual([
        'isValid',
        'invalidReason',
        'intent',
        'constraints',
        'suggestedCategories',
      ]);
    });

    it('should define all property types correctly', () => {
      const schema = getValidationJsonSchema('ko');
      expect(schema.properties.isValid.type).toBe('boolean');
      expect(schema.properties.invalidReason.type).toBe('string');
      expect(schema.properties.intent.type).toBe('string');
      expect(schema.properties.intent.enum).toEqual([
        'preference',
        'mood',
        'location',
        'mixed',
      ]);
      expect(schema.properties.constraints.type).toBe('object');
      expect(schema.properties.constraints.required).toEqual([
        'budget',
        'dietary',
        'urgency',
      ]);
      expect(schema.properties.constraints.additionalProperties).toBe(false);
      expect(schema.properties.constraints.properties.budget.enum).toEqual([
        'low',
        'medium',
        'high',
      ]);
      expect(schema.properties.constraints.properties.dietary.type).toBe(
        'array',
      );
      expect(schema.properties.constraints.properties.urgency.enum).toEqual([
        'quick',
        'normal',
      ]);
      expect(schema.properties.suggestedCategories.type).toBe('array');
      expect(schema.properties.suggestedCategories.maxItems).toBe(3);
    });

    it.each([
      {
        lang: 'ko' as const,
        checks: {
          isValid: '음식 관련 요청',
          invalidReason: '거부 이유',
          intent: '의도 분류',
          budget: '예산 수준',
          dietary: '식이 제한',
          urgency: '긴급도',
          suggestedCategories: '음식 카테고리',
        },
      },
      {
        lang: 'en' as const,
        checks: {
          isValid: 'food-related request',
          invalidReason: 'Rejection reason',
          intent: 'intent classification',
          budget: 'Budget level',
          dietary: 'Dietary restrictions',
          urgency: 'Urgency level',
          suggestedCategories: 'food categories',
        },
      },
    ])(
      'should have $lang descriptions in schema properties',
      ({ lang, checks }) => {
        const schema = getValidationJsonSchema(lang);
        const p = schema.properties;
        const c = p.constraints.properties;
        expect(p.isValid.description).toContain(checks.isValid);
        expect(p.invalidReason.description).toContain(checks.invalidReason);
        expect(p.intent.description).toContain(checks.intent);
        expect(c.budget.description).toContain(checks.budget);
        expect(c.dietary.description).toContain(checks.dietary);
        expect(c.urgency.description).toContain(checks.urgency);
        expect(p.suggestedCategories.description).toContain(
          checks.suggestedCategories,
        );
      },
    );

    it('should default to Korean and differ only in descriptions between languages', () => {
      const koSchema = getValidationJsonSchema();
      const enSchema = getValidationJsonSchema('en');

      expect(koSchema.properties.isValid.description).toContain(
        '음식 관련 요청',
      );

      // Structure identical
      expect(koSchema.type).toBe(enSchema.type);
      expect(koSchema.required).toEqual(enSchema.required);
      expect(koSchema.properties.intent.enum).toEqual(
        enSchema.properties.intent.enum,
      );

      // Descriptions differ
      expect(koSchema.properties.isValid.description).not.toBe(
        enSchema.properties.isValid.description,
      );
      expect(koSchema.properties.intent.description).not.toBe(
        enSchema.properties.intent.description,
      );
    });
  });
});
