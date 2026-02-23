import {
  buildPreferenceUserPrompt,
  getPreferenceResponseSchema,
  getPreferenceSystemPrompt,
  SelectionStatistics,
  PREFERENCE_SYSTEM_PROMPT_KO,
  PREFERENCE_SYSTEM_PROMPT_EN,
  PREFERENCE_SYSTEM_PROMPT,
} from '../preference-update.prompts';

describe('preference-update.prompts', () => {
  describe('formatRepeats (via buildPreferenceUserPrompt)', () => {
    it('should format repeat menus with counts', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 45,
        recentRepeats: [
          { menu: '김치찌개', count: 5 },
          { menu: '삼겹살', count: 3 },
        ],
        newTrials: [],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('김치찌개(5), 삼겹살(3)');
    });

    it('should display None when recentRepeats is empty', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 10,
        recentRepeats: [],
        newTrials: [],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('Recent repeats (7d): None');
    });

    it('should display None when recentRepeats is undefined', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 0,
        recentRepeats: undefined as any,
        newTrials: [],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('Recent repeats (7d): None');
    });
  });

  describe('buildPreferenceUserPrompt', () => {
    it('should include statistics section when statistics provided', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 45,
        recentRepeats: [{ menu: '김치찌개', count: 5 }],
        newTrials: ['마라탕'],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: ['김치찌개', '삼겹살'],
        currentDislikes: ['초밥'],
        slotMenus: {
          breakfast: [],
          lunch: ['김치찌개'],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('[Selection Statistics]');
      expect(result).toContain('Total selection days: 45');
      expect(result).toContain('Recent repeats (7d): 김치찌개(5)');
      expect(result).toContain('New trials (7d): 마라탕');
    });

    it('should handle empty statistics gracefully', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 0,
        recentRepeats: [],
        newTrials: [],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: ['김치찌개'],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: ['김치찌개'],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('Total selection days: 0');
      expect(result).toContain('Recent repeats (7d): None');
      expect(result).toContain('New trials (7d): None');
    });

    it('should show N/A when statistics is undefined', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Total selection days: N/A');
      expect(result).toContain('Recent repeats (7d): None');
      expect(result).toContain('New trials (7d): None');
    });

    it('should include language directive when language is ko', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        language: 'ko',
      });

      // Assert
      expect(result).toContain('RESPONSE_LANGUAGE: Korean');
    });

    it('should include language directive when language is en', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        language: 'en',
      });

      // Assert
      expect(result).toContain('RESPONSE_LANGUAGE: English');
    });

    it('should not include language directive when language is undefined', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).not.toContain('RESPONSE_LANGUAGE:');
    });

    it('should include user registered preferences', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: ['한식', '국물요리'],
        currentDislikes: ['초밥', '회'],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('[User registered preferences]');
      expect(result).toContain('Likes: 한식, 국물요리');
      expect(result).toContain('Dislikes: 초밥, 회');
    });

    it('should handle empty likes and dislikes', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Likes: None');
      expect(result).toContain('Dislikes: None');
    });

    it('should include previous analysis', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        currentAnalysis: '한식, 특히 국물요리를 좋아하십니다.',
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('[Analysis until yesterday]');
      expect(result).toContain('한식, 특히 국물요리를 좋아하십니다.');
    });

    it('should show None for first analysis when no previous analysis', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('[Analysis until yesterday]');
      expect(result).toContain('None (first analysis)');
    });

    it('should include today menus by slot', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: ['토스트', '커피'],
          lunch: ['김치찌개', '제육볶음'],
          dinner: ['삼겹살'],
          etc: ['치킨'],
        },
      });

      // Assert
      expect(result).toContain("[Today's selected menus]");
      expect(result).toContain('Breakfast: 토스트, 커피');
      expect(result).toContain('Lunch: 김치찌개, 제육볶음');
      expect(result).toContain('Dinner: 삼겹살');
      expect(result).toContain('Other: 치킨');
    });

    it('should omit empty slots', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: ['김치찌개'],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Lunch: 김치찌개');
      expect(result).not.toContain('Breakfast:');
      expect(result).not.toContain('Dinner:');
      expect(result).not.toContain('Other:');
    });

    it('should show None when no menus selected', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain("[Today's selected menus]");
      expect(result).toContain('None');
    });

    it('should include analysis perspectives instruction', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Analyze from two perspectives:');
      expect(result).toContain(
        '1. STABLE: Patterns maintained consistently over 2+ weeks',
      );
      expect(result).toContain(
        '2. RECENT: New patterns or changes in the last week',
      );
    });

    it('should filter out falsy values from likes', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: ['한식', '', null as any, undefined as any, '국물요리'],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Likes: 한식, 국물요리');
    });

    it('should filter out falsy values from dislikes', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: ['초밥', '', null as any, '회'],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Dislikes: 초밥, 회');
    });

    it('should handle undefined currentLikes', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: undefined as any,
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('Likes: None');
    });

    it('should trim whitespace from currentAnalysis', () => {
      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        currentAnalysis: '  한식을 좋아하십니다.  ',
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      // Assert
      expect(result).toContain('한식을 좋아하십니다.');
      expect(result).not.toContain('  한식을 좋아하십니다.  ');
    });

    it('should handle multiple new trials', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 30,
        recentRepeats: [],
        newTrials: ['마라탕', '쌀국수', '팟타이'],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain('New trials (7d): 마라탕, 쌀국수, 팟타이');
    });

    it('should handle multiple recent repeats', () => {
      // Arrange
      const statistics: SelectionStatistics = {
        totalDays: 50,
        recentRepeats: [
          { menu: '김치찌개', count: 5 },
          { menu: '삼겹살', count: 4 },
          { menu: '제육볶음', count: 3 },
        ],
        newTrials: [],
      };

      // Act
      const result = buildPreferenceUserPrompt({
        currentLikes: [],
        currentDislikes: [],
        slotMenus: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
        statistics,
      });

      // Assert
      expect(result).toContain(
        'Recent repeats (7d): 김치찌개(5), 삼겹살(4), 제육볶음(3)',
      );
    });
  });

  describe('getPreferenceResponseSchema', () => {
    it('should return valid JSON schema with Korean descriptions by default', () => {
      // Act
      const schema = getPreferenceResponseSchema();

      // Assert
      expect(schema.type).toBe('json_schema');
      expect(schema.json_schema?.name).toBe('preference_analysis');
      expect(schema.json_schema?.strict).toBe(true);

      const schemaObj = schema.json_schema?.schema as any;
      expect(schemaObj.type).toBe('object');
      expect(schemaObj.required).toEqual([
        'analysis',
        'compactSummary',
        'analysisParagraphs',
        'stablePatterns',
        'recentSignals',
        'diversityHints',
      ]);
    });

    it('should have correct properties in schema', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const properties = (schema.json_schema?.schema as any)?.properties;

      // Assert
      expect(properties).toHaveProperty('analysis');
      expect(properties).toHaveProperty('compactSummary');
      expect(properties).toHaveProperty('analysisParagraphs');
      expect(properties).toHaveProperty('stablePatterns');
      expect(properties).toHaveProperty('recentSignals');
      expect(properties).toHaveProperty('diversityHints');
    });

    it('should have correct analysis field definition', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const analysis = (schema.json_schema?.schema as any)?.properties
        ?.analysis;

      // Assert
      expect(analysis?.type).toBe('string');
      expect(analysis?.description).toContain('200-400자');
    });

    it('should have correct stablePatterns structure', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const stablePatterns = (schema.json_schema?.schema as any)?.properties
        ?.stablePatterns;

      // Assert
      expect(stablePatterns?.type).toBe('object');
      expect(stablePatterns?.required).toEqual([
        'categories',
        'flavors',
        'cookingMethods',
        'confidence',
      ]);
      expect(stablePatterns?.properties?.categories?.type).toBe('array');
      expect(stablePatterns?.properties?.flavors?.type).toBe('array');
      expect(stablePatterns?.properties?.cookingMethods?.type).toBe('array');
      expect(stablePatterns?.properties?.confidence?.type).toBe('string');
      expect(stablePatterns?.properties?.confidence?.enum).toEqual([
        'low',
        'medium',
        'high',
      ]);
    });

    it('should have correct recentSignals structure', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const recentSignals = (schema.json_schema?.schema as any)?.properties
        ?.recentSignals;

      // Assert
      expect(recentSignals?.type).toBe('object');
      expect(recentSignals?.required).toEqual(['trending', 'declining']);
      expect(recentSignals?.properties?.trending?.type).toBe('array');
      expect(recentSignals?.properties?.declining?.type).toBe('array');
    });

    it('should have correct diversityHints structure', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const diversityHints = (schema.json_schema?.schema as any)?.properties
        ?.diversityHints;

      // Assert
      expect(diversityHints?.type).toBe('object');
      expect(diversityHints?.required).toEqual([
        'explorationAreas',
        'rotationSuggestions',
      ]);
      expect(diversityHints?.properties?.explorationAreas?.type).toBe('array');
      expect(diversityHints?.properties?.rotationSuggestions?.type).toBe(
        'array',
      );
    });

    it('should return English descriptions when language is en', () => {
      // Act
      const schema = getPreferenceResponseSchema('en');
      const analysis = (schema.json_schema?.schema as any)?.properties
        ?.analysis;

      // Assert
      expect(analysis?.description).toContain('200-400 characters');
      expect(analysis?.description).not.toContain('200-400자');
    });

    it('should return Korean descriptions when language is ko', () => {
      // Act
      const schema = getPreferenceResponseSchema('ko');
      const analysis = (schema.json_schema?.schema as any)?.properties
        ?.analysis;

      // Assert
      expect(analysis?.description).toContain('200-400자');
    });

    it('should have additionalProperties set to false', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const schemaObj = schema.json_schema?.schema as any;
      const stablePatterns = schemaObj?.properties?.stablePatterns;
      const recentSignals = schemaObj?.properties?.recentSignals;
      const diversityHints = schemaObj?.properties?.diversityHints;

      // Assert
      expect(schemaObj?.additionalProperties).toBe(false);
      expect(stablePatterns?.additionalProperties).toBe(false);
      expect(recentSignals?.additionalProperties).toBe(false);
      expect(diversityHints?.additionalProperties).toBe(false);
    });

    it('should have all array items defined as string type', () => {
      // Act
      const schema = getPreferenceResponseSchema();
      const properties = (schema.json_schema?.schema as any)?.properties;
      const stablePatterns = properties?.stablePatterns;
      const recentSignals = properties?.recentSignals;
      const diversityHints = properties?.diversityHints;

      // Assert
      expect(stablePatterns?.properties?.categories?.items?.type).toBe(
        'string',
      );
      expect(stablePatterns?.properties?.flavors?.items?.type).toBe('string');
      expect(stablePatterns?.properties?.cookingMethods?.items?.type).toBe(
        'string',
      );
      expect(recentSignals?.properties?.trending?.items?.type).toBe('string');
      expect(recentSignals?.properties?.declining?.items?.type).toBe('string');
      expect(diversityHints?.properties?.explorationAreas?.items?.type).toBe(
        'string',
      );
      expect(diversityHints?.properties?.rotationSuggestions?.items?.type).toBe(
        'string',
      );
    });
  });

  describe('getPreferenceSystemPrompt', () => {
    it('should return Korean prompt by default', () => {
      // Act
      const result = getPreferenceSystemPrompt();

      // Assert
      expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
      expect(result).toContain('음식 선호도를 분석하는 전문 음식 컨설턴트');
    });

    it('should return Korean prompt when language is ko', () => {
      // Act
      const result = getPreferenceSystemPrompt('ko');

      // Assert
      expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
    });

    it('should return English prompt when language is en', () => {
      // Act
      const result = getPreferenceSystemPrompt('en');

      // Assert
      expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_EN);
      expect(result).toContain('food consultant who analyzes user food');
    });
  });

  describe('PREFERENCE_SYSTEM_PROMPT (deprecated)', () => {
    it('should equal PREFERENCE_SYSTEM_PROMPT_KO for backward compatibility', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
    });
  });

  describe('PREFERENCE_SYSTEM_PROMPT_KO', () => {
    it('should contain role definition', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<role>');
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('</role>');
    });

    it('should contain analysis perspectives', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<analysis_perspectives>');
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain(
        '- 안정적 취향 (Stable): 2주 이상 일관된 패턴',
      );
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain(
        '- 변동적 취향 (Recent): 최근 1주 내 변화',
      );
    });

    it('should contain writing guidelines', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<writing_guidelines>');
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('**총 200-400자**');
    });

    it('should contain categorization guide', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<categorization_guide>');
    });

    it('should contain good and bad examples', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<good_example>');
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<bad_example>');
    });

    it('should contain language rule', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<language_rule>');
      expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('RESPONSE_LANGUAGE');
    });
  });

  describe('PREFERENCE_SYSTEM_PROMPT_EN', () => {
    it('should contain role definition in English', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<role>');
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
        'professional food consultant',
      );
    });

    it('should contain analysis perspectives in English', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<analysis_perspectives>');
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
        '- Stable Preferences: Consistent patterns over 2+ weeks',
      );
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
        '- Recent Changes: Changes within the last week',
      );
    });

    it('should contain writing guidelines in English', () => {
      // Assert
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<writing_guidelines>');
      expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
        '**Total 200-400 characters**',
      );
    });
  });
});
