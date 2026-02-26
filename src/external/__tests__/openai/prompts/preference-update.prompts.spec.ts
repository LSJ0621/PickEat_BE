import {
  PREFERENCE_SYSTEM_PROMPT_KO,
  PREFERENCE_SYSTEM_PROMPT_EN,
  getPreferenceSystemPrompt,
  buildPreferenceUserPrompt,
  getPreferenceResponseSchema,
} from '../../../openai/prompts/preference-update.prompts';

const PREFERENCE_SYSTEM_PROMPT = getPreferenceSystemPrompt('ko');
const PREFERENCE_RESPONSE_SCHEMA = getPreferenceResponseSchema('ko');

describe('preference-update.prompts', () => {
  // ============================================================================
  // System Prompts
  // ============================================================================

  describe('PREFERENCE_SYSTEM_PROMPT (backward compatibility)', () => {
    it('should equal PREFERENCE_SYSTEM_PROMPT_KO for backward compatibility', () => {
      expect(PREFERENCE_SYSTEM_PROMPT).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
    });
  });

  describe('PREFERENCE_SYSTEM_PROMPT_KO / PREFERENCE_SYSTEM_PROMPT_EN structure', () => {
    const SHARED_TAGS = [
      '<role>',
      '<analysis_perspectives>',
      '<writing_guidelines>',
      '<language_rule>',
    ];

    test.each([
      [
        'ko',
        PREFERENCE_SYSTEM_PROMPT_KO,
        '음식 선호도를 분석',
        '컨설턴트',
        '존댓말',
        '200-400자',
        '한국어',
      ],
      [
        'en',
        PREFERENCE_SYSTEM_PROMPT_EN,
        'analyzes user food preferences',
        'food consultant',
        'polite language',
        '200-400 characters',
        'Korean response',
      ],
    ])(
      'PREFERENCE_SYSTEM_PROMPT_%s should be non-empty, contain shared tags and language-specific content',
      (_lang, prompt, phrase1, phrase2, phrase3, phrase4, phrase5) => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        for (const tag of SHARED_TAGS) {
          expect(prompt).toContain(tag);
        }
        expect(prompt).toContain(phrase1);
        expect(prompt).toContain(phrase2);
        expect(prompt).toContain(phrase3);
        expect(prompt).toContain(phrase4);
        expect(prompt).toContain(phrase5);
      },
    );
  });

  describe('getPreferenceSystemPrompt', () => {
    test.each([
      ['ko' as const, PREFERENCE_SYSTEM_PROMPT_KO, '컨설턴트'],
      ['en' as const, PREFERENCE_SYSTEM_PROMPT_EN, 'food consultant'],
    ])(
      'should return %s prompt and contain expected phrase',
      (lang, expectedPrompt, expectedPhrase) => {
        const result = getPreferenceSystemPrompt(lang);
        expect(result).toBe(expectedPrompt);
        expect(result).toContain(expectedPhrase);
      },
    );

    it('should default to Korean when no language parameter or undefined is passed', () => {
      expect(getPreferenceSystemPrompt()).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
      expect(getPreferenceSystemPrompt(undefined)).toBe(
        PREFERENCE_SYSTEM_PROMPT_KO,
      );
    });
  });

  // ============================================================================
  // buildPreferenceUserPrompt
  // ============================================================================

  describe('buildPreferenceUserPrompt', () => {
    const baseSlotMenus = {
      breakfast: ['김치찌개'],
      lunch: ['된장찌개', '삼겹살'],
      dinner: ['비빔밥'],
      etc: ['떡볶이'],
    };

    describe('with complete data', () => {
      it('should build prompt with all fields populated', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: ['한식', '국물요리', '매운음식'],
          currentDislikes: ['회', '날것'],
          currentAnalysis: '한식을 선호하시는 경향이 있습니다.',
          slotMenus: baseSlotMenus,
          language: 'ko',
        });

        expect(result).toContain('[User registered preferences]');
        expect(result).toContain('Likes: 한식, 국물요리, 매운음식');
        expect(result).toContain('Dislikes: 회, 날것');
        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain('한식을 선호하시는 경향이 있습니다.');
        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain('Breakfast: 김치찌개');
        expect(result).toContain('Lunch: 된장찌개, 삼겹살');
        expect(result).toContain('Dinner: 비빔밥');
        expect(result).toContain('Other: 떡볶이');
        expect(result).toContain(
          "Update the preference analysis reflecting today's selections.",
        );
      });
    });

    describe('likes and dislikes - empty / null / undefined branches', () => {
      test.each([
        [[], ['회'], 'Likes: None', 'Dislikes: 회'],
        [['한식'], [], 'Likes: 한식', 'Dislikes: None'],
        [[], [], 'Likes: None', 'Dislikes: None'],
        [undefined as any, ['회'], 'Likes: None', 'Dislikes: 회'],
        [['한식'], undefined as any, 'Likes: 한식', 'Dislikes: None'],
      ])(
        'should render likes=%j dislikes=%j as "%s" and "%s"',
        (likes, dislikes, expectedLikes, expectedDislikes) => {
          const result = buildPreferenceUserPrompt({
            currentLikes: likes,
            currentDislikes: dislikes,
            slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
            language: 'ko',
          });
          expect(result).toContain(expectedLikes);
          expect(result).toContain(expectedDislikes);
        },
      );

      it('should filter out null and empty string elements from likes/dislikes', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: ['한식', '', null, '중식'] as any,
          currentDislikes: ['', null, '회'] as any,
          slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
          language: 'ko',
        });
        expect(result).toContain('Likes: 한식, 중식');
        expect(result).toContain('Dislikes: 회');
      });
    });

    describe('currentAnalysis - empty / undefined branch', () => {
      test.each([
        [undefined, 'None (first analysis)'],
        ['', 'None (first analysis)'],
        ['   ', 'None (first analysis)'],
      ])(
        'should show "None (first analysis)" when currentAnalysis is %j',
        (analysis, expected) => {
          const result = buildPreferenceUserPrompt({
            currentLikes: ['한식'],
            currentDislikes: [],
            currentAnalysis: analysis,
            slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
            language: 'ko',
          });
          expect(result).toContain('[Analysis until yesterday]');
          expect(result).toContain(expected);
        },
      );
    });

    describe('slot menus - per-slot branch coverage', () => {
      test.each([
        [
          'breakfast',
          { breakfast: ['김치찌개', '된장찌개'], lunch: [], dinner: [], etc: [] },
          ['Breakfast: 김치찌개, 된장찌개'],
          ['Lunch:', 'Dinner:', 'Other:'],
        ],
        [
          'lunch',
          { breakfast: [], lunch: ['삼겹살', '된장찌개'], dinner: [], etc: [] },
          ['Lunch: 삼겹살, 된장찌개'],
          ['Breakfast:', 'Dinner:', 'Other:'],
        ],
        [
          'dinner',
          { breakfast: [], lunch: [], dinner: ['비빔밥', '불고기'], etc: [] },
          ['Dinner: 비빔밥, 불고기'],
          ['Breakfast:', 'Lunch:', 'Other:'],
        ],
        [
          'etc',
          { breakfast: [], lunch: [], dinner: [], etc: ['떡볶이', '김밥'] },
          ['Other: 떡볶이, 김밥'],
          ['Breakfast:', 'Lunch:', 'Dinner:'],
        ],
      ])(
        'should include only "%s" slot when others are empty',
        (_slot, slotMenus, expectedContains, expectedNotContains) => {
          const result = buildPreferenceUserPrompt({
            currentLikes: ['한식'],
            currentDislikes: [],
            slotMenus,
            language: 'ko',
          });
          for (const text of expectedContains) {
            expect(result).toContain(text);
          }
          for (const text of expectedNotContains) {
            expect(result).not.toContain(text);
          }
        },
      );

      it('should show "None" when all slots are empty', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: [],
          currentDislikes: [],
          slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
          language: 'ko',
        });
        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain('None');
      });
    });

    describe('RESPONSE_LANGUAGE - language parameter branch', () => {
      test.each([
        ['ko' as const, 'RESPONSE_LANGUAGE: Korean'],
        ['en' as const, 'RESPONSE_LANGUAGE: English'],
      ])(
        'should include RESPONSE_LANGUAGE header for language "%s"',
        (lang, expectedHeader) => {
          const result = buildPreferenceUserPrompt({
            currentLikes: ['한식'],
            currentDislikes: [],
            slotMenus: { breakfast: ['김치찌개'], lunch: [], dinner: [], etc: [] },
            language: lang,
          });
          expect(result).toContain(expectedHeader);
        },
      );

      it('should not include RESPONSE_LANGUAGE when language is omitted', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: { breakfast: ['김치찌개'], lunch: [], dinner: [], etc: [] },
        });
        expect(result).not.toContain('RESPONSE_LANGUAGE:');
      });

      it('should place RESPONSE_LANGUAGE at the beginning when provided', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: { breakfast: ['김치찌개'], lunch: [], dinner: [], etc: [] },
          language: 'ko',
        });
        const lines = result.split('\n');
        expect(lines[0]).toBe('RESPONSE_LANGUAGE: Korean');
        expect(lines[1]).toBe('');
      });

      test.each([
        ['ko' as const, '[User registered preferences]'],
        ['en' as const, '[User registered preferences]'],
      ])(
        'should maintain prompt structure with language "%s"',
        (lang, expectedSection) => {
          const result = buildPreferenceUserPrompt({
            currentLikes: ['한식', '일식'],
            currentDislikes: ['양식'],
            currentAnalysis: '한식을 선호하시는 경향',
            slotMenus: {
              breakfast: ['김치찌개'],
              lunch: ['된장찌개'],
              dinner: ['비빔밥'],
              etc: [],
            },
            language: lang,
          });
          expect(result).toContain(expectedSection);
          expect(result).toContain('[Analysis until yesterday]');
          expect(result).toContain("[Today's selected menus]");
        },
      );
    });

    describe('output format - required sections', () => {
      it('should include all required sections and analysis instructions', () => {
        const result = buildPreferenceUserPrompt({
          currentLikes: ['한식'],
          currentDislikes: ['회'],
          currentAnalysis: '한식 선호',
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
          language: 'ko',
        });

        expect(result).toContain('[User registered preferences]');
        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain(
          "Update the preference analysis reflecting today's selections.",
        );
        expect(result).toContain('Analyze from two perspectives:');
        expect(result).toContain(
          '1. STABLE: Patterns maintained consistently over 2+ weeks',
        );
        expect(result).toContain(
          '2. RECENT: New patterns or changes in the last week',
        );
        expect(result).toContain('Do NOT optimize analysis for recommendations.');
      });
    });
  });

  // ============================================================================
  // PREFERENCE_RESPONSE_SCHEMA (backward compatibility)
  // ============================================================================

  describe('PREFERENCE_RESPONSE_SCHEMA (backward compatibility)', () => {
    it('should equal Korean schema for backward compatibility', () => {
      const koSchema = getPreferenceResponseSchema('ko');
      expect(PREFERENCE_RESPONSE_SCHEMA).toEqual(koSchema);
    });

    it('should be a valid ResponseFormatJSONSchema with required fields', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.type).toBe('json_schema');
      expect(PREFERENCE_RESPONSE_SCHEMA.json_schema).toBeDefined();
      expect(PREFERENCE_RESPONSE_SCHEMA.json_schema.name).toBe(
        'preference_analysis',
      );
      expect(PREFERENCE_RESPONSE_SCHEMA.json_schema.strict).toBe(true);

      const schema = PREFERENCE_RESPONSE_SCHEMA.json_schema.schema as Record<
        string,
        unknown
      >;
      const required = schema.required as string[];
      expect(required).toContain('analysis');
      expect(required).toContain('compactSummary');
      expect(required).toContain('analysisParagraphs');
      expect(required).toContain('stablePatterns');
      expect(required).toContain('recentSignals');
      expect(required).toContain('diversityHints');
      expect(schema.additionalProperties).toBe(false);

      const properties = schema.properties as Record<string, unknown>;
      const analysis = properties.analysis as Record<string, unknown>;
      expect(analysis.type).toBe('string');
      expect(analysis.description).toContain('200-400자');
    });
  });

  // ============================================================================
  // getPreferenceResponseSchema
  // ============================================================================

  describe('getPreferenceResponseSchema', () => {
    test.each([
      [
        'ko' as const,
        '사용자에게 보여줄 200-400자 분석 텍스트 (하위 호환용)',
      ],
      [
        'en' as const,
        'Analysis text for user display (200-400 characters, backward compatible)',
      ],
    ])(
      'should return correct analysis description for language "%s"',
      (lang, expectedDescription) => {
        const result = getPreferenceResponseSchema(lang);
        const schema = result.json_schema.schema as Record<string, unknown>;
        const properties = schema.properties as Record<string, unknown>;
        const analysis = properties.analysis as Record<string, unknown>;
        expect(analysis.description).toBe(expectedDescription);
      },
    );

    it('should default to Korean when no language parameter is provided', () => {
      const result = getPreferenceResponseSchema();
      const schema = result.json_schema.schema as Record<string, unknown>;
      const properties = schema.properties as Record<string, unknown>;
      const analysis = properties.analysis as Record<string, unknown>;
      expect(analysis.description).toBe(
        '사용자에게 보여줄 200-400자 분석 텍스트 (하위 호환용)',
      );
    });

    it('should have identical structure for both languages, differing only in descriptions', () => {
      const koResult = getPreferenceResponseSchema('ko');
      const enResult = getPreferenceResponseSchema('en');
      const koSchema = koResult.json_schema.schema as Record<string, unknown>;
      const enSchema = enResult.json_schema.schema as Record<string, unknown>;

      expect(koSchema.type).toBe(enSchema.type);
      expect(koSchema.required).toEqual(enSchema.required);
      expect(koSchema.additionalProperties).toBe(enSchema.additionalProperties);

      const koProps = koSchema.properties as Record<string, unknown>;
      const enProps = enSchema.properties as Record<string, unknown>;
      const koAnalysis = koProps.analysis as Record<string, unknown>;
      const enAnalysis = enProps.analysis as Record<string, unknown>;

      expect(koAnalysis.type).toBe(enAnalysis.type);
      expect(koAnalysis.description).not.toBe(enAnalysis.description);
    });
  });
});
