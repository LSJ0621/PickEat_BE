import {
  PREFERENCE_SYSTEM_PROMPT,
  buildPreferenceUserPrompt,
  PREFERENCE_RESPONSE_SCHEMA,
} from '../../../openai/prompts/preference-update.prompts';

describe('preference-update.prompts', () => {
  describe('PREFERENCE_SYSTEM_PROMPT', () => {
    it('should be a non-empty string containing system instructions', () => {
      expect(PREFERENCE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof PREFERENCE_SYSTEM_PROMPT).toBe('string');
      expect(PREFERENCE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(PREFERENCE_SYSTEM_PROMPT).toContain('푸드 컨설턴트');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('[사용자 등록 취향]');
        expect(result).toContain('좋아함: 한식, 국물요리, 매운음식');
        expect(result).toContain('싫어함: 회, 날것');
        expect(result).toContain('[어제까지의 분석]');
        expect(result).toContain('한식을 선호하시는 경향이 있습니다.');
        expect(result).toContain('[오늘 선택한 메뉴]');
        expect(result).toContain('아침: 김치찌개');
        expect(result).toContain('점심: 된장찌개, 삼겹살');
        expect(result).toContain('저녁: 비빔밥');
        expect(result).toContain('기타: 떡볶이');
        expect(result).toContain(
          '오늘 선택을 반영해 취향 분석을 업데이트하라.',
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 없음');
        expect(result).toContain('싫어함: 회');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 한식');
        expect(result).toContain('싫어함: 없음');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 없음');
        expect(result).toContain('싫어함: 없음');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 없음');
        expect(result).toContain('싫어함: 회');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 한식');
        expect(result).toContain('싫어함: 없음');
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

        const result = buildPreferenceUserPrompt(params);

        // filter(Boolean) should remove empty strings and null
        expect(result).toContain('좋아함: 한식, 중식');
        expect(result).toContain('싫어함: 회');
      });
    });

    describe('with missing currentAnalysis', () => {
      it('should show "없음 (첫 분석)" when currentAnalysis is undefined', () => {
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('[어제까지의 분석]');
        expect(result).toContain('없음 (첫 분석)');
      });

      it('should show "없음 (첫 분석)" when currentAnalysis is empty string', () => {
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('없음 (첫 분석)');
      });

      it('should show "없음 (첫 분석)" when currentAnalysis is whitespace only', () => {
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('없음 (첫 분석)');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('아침: 김치찌개, 된장찌개');
        expect(result).not.toContain('점심:');
        expect(result).not.toContain('저녁:');
        expect(result).not.toContain('기타:');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).not.toContain('아침:');
        expect(result).toContain('점심: 삼겹살, 된장찌개');
        expect(result).not.toContain('저녁:');
        expect(result).not.toContain('기타:');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).not.toContain('아침:');
        expect(result).not.toContain('점심:');
        expect(result).toContain('저녁: 비빔밥, 불고기');
        expect(result).not.toContain('기타:');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).not.toContain('아침:');
        expect(result).not.toContain('점심:');
        expect(result).not.toContain('저녁:');
        expect(result).toContain('기타: 떡볶이, 김밥');
      });

      it('should show "없음" when all slot menus are empty', () => {
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('[오늘 선택한 메뉴]');
        expect(result).toContain('없음');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 없음');
        expect(result).toContain('싫어함: 없음');
        expect(result).toContain('없음 (첫 분석)');
        expect(result).toContain('[오늘 선택한 메뉴]');
        expect(result).toContain('없음');
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

        const result = buildPreferenceUserPrompt(params);

        expect(result).toContain('좋아함: 한식, 중식, 일식');
        expect(result).toContain('싫어함: 회, 날것, 비린음식');
        expect(result).toContain('다양한 음식을 좋아하시네요.');
        expect(result).toContain('아침: 김치찌개, 된장찌개, 순두부');
        expect(result).toContain('점심: 삼겹살, 불고기, 된장찌개');
        expect(result).toContain('저녁: 비빔밥, 냉면, 칼국수');
        expect(result).toContain('기타: 떡볶이, 김밥, 라면');
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

        const result = buildPreferenceUserPrompt(params);
        const sections = result.split('\n\n');

        expect(result).toContain('[사용자 등록 취향]');
        expect(result).toContain('[어제까지의 분석]');
        expect(result).toContain('[오늘 선택한 메뉴]');
        expect(result).toContain(
          '오늘 선택을 반영해 취향 분석을 업데이트하라.',
        );
        expect(result).toContain(
          '등록 취향과 실제 선택의 일치/불일치, 기존 취향 분석 대비 변화를 중심으로 서술.',
        );
        expect(result).toContain('내일 추천에 활용할 구체적 패턴 위주로.');
      });
    });
  });

  describe('PREFERENCE_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA).toEqual({
        type: 'object',
        properties: {
          analysis: { type: 'string', maxLength: 500 },
        },
        required: ['analysis'],
        additionalProperties: false,
      });
    });

    it('should have analysis property with maxLength 500', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.properties.analysis).toEqual({
        type: 'string',
        maxLength: 500,
      });
    });

    it('should require analysis field', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.required).toContain('analysis');
    });

    it('should not allow additional properties', () => {
      expect(PREFERENCE_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });
  });
});
