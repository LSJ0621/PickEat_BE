import {
  PREFERENCE_SYSTEM_PROMPT,
  PREFERENCE_SYSTEM_PROMPT_KO,
  PREFERENCE_SYSTEM_PROMPT_EN,
  getPreferenceSystemPrompt,
  buildPreferenceUserPrompt,
  PREFERENCE_RESPONSE_SCHEMA,
  getPreferenceResponseSchema,
} from '../../../openai/prompts/preference-update.prompts';

describe('preference-update.prompts', () => {
  describe('PREFERENCE_SYSTEM_PROMPT', () => {
    it('should be a non-empty string containing system instructions', () => {
      expect(PREFERENCE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof PREFERENCE_SYSTEM_PROMPT).toBe('string');
      expect(PREFERENCE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(PREFERENCE_SYSTEM_PROMPT).toContain('음식 컨설턴트');
      expect(PREFERENCE_SYSTEM_PROMPT).toContain('{"analysis": "분석 내용"}');
    });
  });

  describe('buildPreferenceUserPrompt', () => {
    describe('with complete data', () => {
      it('should build prompt with all fields populated', () => {
        const params = {
          currentLikes: ['한식', '국물요리', '매운음식'],
          currentDislikes: ['회', '날것'],
          currentAnalysis: '한식을 선호하시는 경향이 있습니다.',
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: ['된장찌개', '삼겹살'],
            dinner: ['비빔밥'],
            etc: ['떡볶이'],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

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

    describe('with empty arrays - branch coverage for lines 50-51, 63-64', () => {
      it('should handle empty likes array', () => {
        const params = {
          currentLikes: [],
          currentDislikes: ['회'],
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 회');
      });

      it('should handle empty dislikes array', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: 한식');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle both likes and dislikes as empty arrays', () => {
        const params = {
          currentLikes: [],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
      });
    });

    describe('with undefined/null values - branch coverage for lines 50-51', () => {
      it('should handle undefined currentLikes', () => {
        const params = {
          currentLikes: undefined as any,
          currentDislikes: ['회'],
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: 회');
      });

      it('should handle undefined currentDislikes', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: undefined as any,
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: 한식');
        expect(result).toContain('Dislikes: None');
      });

      it('should handle arrays with null/empty string elements', () => {
        const params = {
          currentLikes: ['한식', '', null, '중식'] as any,
          currentDislikes: ['', null, '회'] as any,
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        // filter(Boolean) should remove empty strings and null
        expect(result).toContain('Likes: 한식, 중식');
        expect(result).toContain('Dislikes: 회');
      });
    });

    describe('with missing currentAnalysis', () => {
      it('should show "None (first analysis)" when currentAnalysis is undefined', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: ['회'],
          currentAnalysis: undefined,
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain('None (first analysis)');
      });

      it('should show "None (first analysis)" when currentAnalysis is empty string', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: ['회'],
          currentAnalysis: '',
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('None (first analysis)');
      });

      it('should show "None (first analysis)" when currentAnalysis is whitespace only', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: ['회'],
          currentAnalysis: '   ',
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('None (first analysis)');
      });
    });

    describe('slot menus - branch coverage for lines 56-59', () => {
      it('should include only breakfast when other slots are empty', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: ['김치찌개', '된장찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Breakfast: 김치찌개, 된장찌개');
        expect(result).not.toContain('Lunch:');
        expect(result).not.toContain('Dinner:');
        expect(result).not.toContain('Other:');
      });

      it('should include only lunch when other slots are empty', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: ['삼겹살', '된장찌개'],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).not.toContain('Breakfast:');
        expect(result).toContain('Lunch: 삼겹살, 된장찌개');
        expect(result).not.toContain('Dinner:');
        expect(result).not.toContain('Other:');
      });

      it('should include only dinner when other slots are empty', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: ['비빔밥', '불고기'],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).not.toContain('Breakfast:');
        expect(result).not.toContain('Lunch:');
        expect(result).toContain('Dinner: 비빔밥, 불고기');
        expect(result).not.toContain('Other:');
      });

      it('should include only etc when other slots are empty', () => {
        const params = {
          currentLikes: ['분식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: ['떡볶이', '김밥'],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).not.toContain('Breakfast:');
        expect(result).not.toContain('Lunch:');
        expect(result).not.toContain('Dinner:');
        expect(result).toContain('Other: 떡볶이, 김밥');
      });

      it('should show "None" when all slot menus are empty', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain('None');
      });
    });

    describe('combined edge cases', () => {
      it('should handle all empty/undefined values gracefully', () => {
        const params = {
          currentLikes: [],
          currentDislikes: [],
          currentAnalysis: undefined,
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: None');
        expect(result).toContain('Dislikes: None');
        expect(result).toContain('None (first analysis)');
        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain('None');
      });

      it('should correctly format multiple items in each slot', () => {
        const params = {
          currentLikes: ['한식', '중식', '일식'],
          currentDislikes: ['회', '날것', '비린음식'],
          currentAnalysis: '다양한 음식을 좋아하시네요.',
          slotMenus: {
            breakfast: ['김치찌개', '된장찌개', '순두부'],
            lunch: ['삼겹살', '불고기', '된장찌개'],
            dinner: ['비빔밥', '냉면', '칼국수'],
            etc: ['떡볶이', '김밥', '라면'],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });

        expect(result).toContain('Likes: 한식, 중식, 일식');
        expect(result).toContain('Dislikes: 회, 날것, 비린음식');
        expect(result).toContain('다양한 음식을 좋아하시네요.');
        expect(result).toContain('Breakfast: 김치찌개, 된장찌개, 순두부');
        expect(result).toContain('Lunch: 삼겹살, 불고기, 된장찌개');
        expect(result).toContain('Dinner: 비빔밥, 냉면, 칼국수');
        expect(result).toContain('Other: 떡볶이, 김밥, 라면');
      });
    });

    describe('output format', () => {
      it('should include all required sections in correct order', () => {
        const params = {
          currentLikes: ['한식'],
          currentDislikes: ['회'],
          currentAnalysis: '한식 선호',
          slotMenus: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        };

        const result = buildPreferenceUserPrompt({ ...params, language: 'ko' });
        const sections = result.split('\n\n');

        expect(result).toContain('[User registered preferences]');
        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain("[Today's selected menus]");
        expect(result).toContain(
          "Update the preference analysis reflecting today's selections.",
        );
        expect(result).toContain(
          'Focus on alignment/misalignment between registered preferences and actual choices, and changes compared to existing preference analysis.',
        );
        expect(result).toContain(
          "Emphasize specific patterns useful for tomorrow's recommendations.",
        );
      });
    });
  });

  describe('PREFERENCE_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA).toEqual({
        type: 'object',
        properties: {
          analysis: {
            type: 'string',
            maxLength: 500,
            description: '선호도 분석 내용 (최대 500자)',
          },
        },
        required: ['analysis'],
        additionalProperties: false,
      });
    });

    it('should have analysis property with maxLength 500', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.properties.analysis).toEqual({
        type: 'string',
        maxLength: 500,
        description: '선호도 분석 내용 (최대 500자)',
      });
    });

    it('should require analysis field', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.required).toContain('analysis');
    });

    it('should not allow additional properties', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });
  });

  describe('Phase 2: Internationalization (i18n)', () => {
    describe('PREFERENCE_SYSTEM_PROMPT_KO', () => {
      it('should be a non-empty Korean string', () => {
        expect(typeof PREFERENCE_SYSTEM_PROMPT_KO).toBe('string');
        expect(PREFERENCE_SYSTEM_PROMPT_KO.length).toBeGreaterThan(0);
      });

      it('should contain Korean language content', () => {
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('음식 선호도를 분석');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('컨설턴트');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<role>');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain(
          '<analysis_perspectives>',
        );
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<writing_guidelines>');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('<language_rule>');
      });

      it('should contain Korean-specific instructions', () => {
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('존댓말');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('500자');
        expect(PREFERENCE_SYSTEM_PROMPT_KO).toContain('한국어');
      });
    });

    describe('PREFERENCE_SYSTEM_PROMPT_EN', () => {
      it('should be a non-empty English string', () => {
        expect(typeof PREFERENCE_SYSTEM_PROMPT_EN).toBe('string');
        expect(PREFERENCE_SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
      });

      it('should contain English language content', () => {
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
          'analyzes user food preferences',
        );
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('food consultant');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<role>');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain(
          '<analysis_perspectives>',
        );
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<writing_guidelines>');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('<language_rule>');
      });

      it('should contain English-specific instructions', () => {
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('polite language');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('500 characters');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('Korean response');
        expect(PREFERENCE_SYSTEM_PROMPT_EN).toContain('English response');
      });
    });

    describe('PREFERENCE_SYSTEM_PROMPT constant (backward compatibility)', () => {
      it('should equal PREFERENCE_SYSTEM_PROMPT_KO for backward compatibility', () => {
        expect(PREFERENCE_SYSTEM_PROMPT).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
      });
    });

    describe('getPreferenceSystemPrompt', () => {
      it('should return Korean prompt when language is "ko"', () => {
        const result = getPreferenceSystemPrompt('ko');
        expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
        expect(result).toContain('컨설턴트');
      });

      it('should return English prompt when language is "en"', () => {
        const result = getPreferenceSystemPrompt('en');
        expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_EN);
        expect(result).toContain('food consultant');
      });

      it('should default to Korean when no language parameter is provided', () => {
        const result = getPreferenceSystemPrompt();
        expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
      });

      it('should default to Korean when undefined is passed', () => {
        const result = getPreferenceSystemPrompt(undefined);
        expect(result).toBe(PREFERENCE_SYSTEM_PROMPT_KO);
      });
    });

    describe('buildPreferenceUserPrompt with language parameter', () => {
      const baseParams = {
        currentLikes: ['한식', '일식'],
        currentDislikes: ['양식'],
        currentAnalysis: '한식을 선호하시는 경향',
        slotMenus: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: ['비빔밥'],
          etc: [],
        },
      };

      it('should include RESPONSE_LANGUAGE: Korean when language is "ko"', () => {
        const result = buildPreferenceUserPrompt({
          ...baseParams,
          language: 'ko',
        });

        expect(result).toContain('RESPONSE_LANGUAGE: Korean');
      });

      it('should include RESPONSE_LANGUAGE: English when language is "en"', () => {
        const result = buildPreferenceUserPrompt({
          ...baseParams,
          language: 'en',
        });

        expect(result).toContain('RESPONSE_LANGUAGE: English');
      });

      it('should not include RESPONSE_LANGUAGE when language is not provided', () => {
        const result = buildPreferenceUserPrompt(baseParams);

        expect(result).not.toContain('RESPONSE_LANGUAGE:');
      });

      it('should maintain prompt structure with Korean language', () => {
        const result = buildPreferenceUserPrompt({
          ...baseParams,
          language: 'ko',
        });

        expect(result).toContain('[User registered preferences]');
        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain("[Today's selected menus]");
      });

      it('should maintain prompt structure with English language', () => {
        const result = buildPreferenceUserPrompt({
          ...baseParams,
          language: 'en',
        });

        expect(result).toContain('[User registered preferences]');
        expect(result).toContain('[Analysis until yesterday]');
        expect(result).toContain("[Today's selected menus]");
      });

      it('should place RESPONSE_LANGUAGE at the beginning', () => {
        const result = buildPreferenceUserPrompt({
          ...baseParams,
          language: 'ko',
        });

        const lines = result.split('\n');
        expect(lines[0]).toBe('RESPONSE_LANGUAGE: Korean');
        expect(lines[1]).toBe('');
      });
    });

    describe('getPreferenceResponseSchema', () => {
      it('should return Korean schema when language is "ko"', () => {
        const schema = getPreferenceResponseSchema('ko');

        expect(schema.properties.analysis.description).toBe(
          '선호도 분석 내용 (최대 500자)',
        );
      });

      it('should return English schema when language is "en"', () => {
        const schema = getPreferenceResponseSchema('en');

        expect(schema.properties.analysis.description).toBe(
          'Preference analysis content (max 500 characters)',
        );
      });

      it('should default to Korean when no language parameter is provided', () => {
        const schema = getPreferenceResponseSchema();

        expect(schema.properties.analysis.description).toBe(
          '선호도 분석 내용 (최대 500자)',
        );
      });

      it('should have same structure for both languages', () => {
        const koSchema = getPreferenceResponseSchema('ko');
        const enSchema = getPreferenceResponseSchema('en');

        expect(koSchema.type).toBe(enSchema.type);
        expect(koSchema.required).toEqual(enSchema.required);
        expect(koSchema.properties.analysis.type).toBe(
          enSchema.properties.analysis.type,
        );
        expect(koSchema.properties.analysis.maxLength).toBe(
          enSchema.properties.analysis.maxLength,
        );
      });

      it('should only differ in description field', () => {
        const koSchema = getPreferenceResponseSchema('ko');
        const enSchema = getPreferenceResponseSchema('en');

        expect(koSchema.properties.analysis.description).not.toBe(
          enSchema.properties.analysis.description,
        );
      });
    });

    describe('PREFERENCE_RESPONSE_SCHEMA constant (backward compatibility)', () => {
      it('should equal Korean schema for backward compatibility', () => {
        const koSchema = getPreferenceResponseSchema('ko');
        expect(PREFERENCE_RESPONSE_SCHEMA).toEqual(koSchema);
      });
    });
  });
});
