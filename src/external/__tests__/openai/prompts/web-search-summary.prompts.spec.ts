import {
  WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO,
  WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN,
  getWebSearchSummarySystemPrompt,
  buildWebSearchSummaryPrompt,
} from '../../../openai/prompts/web-search-summary.prompts';

describe('web-search-summary.prompts', () => {
  // ============================================================================
  // System Prompts
  // ============================================================================

  describe('WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO', () => {
    it('should be a non-empty string', () => {
      expect(typeof WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toBe('string');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO.length).toBeGreaterThan(0);
    });

    it('should contain all required section tags and Korean-specific content', () => {
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('<critical_rules>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('<focus>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('<output_format>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('음식 트렌드 정보 요약 전문가');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('hallucination');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('confidence');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('localTrends');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('demographicFavorites');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('seasonalItems');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toContain('"low"');
    });

    it('should not start or end with whitespace (trimmed)', () => {
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO).toBe(
        WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO.trim(),
      );
    });
  });

  describe('WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN', () => {
    it('should be a non-empty string', () => {
      expect(typeof WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toBe('string');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
    });

    it('should contain all required section tags and English-specific content', () => {
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('<critical_rules>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('<focus>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('<output_format>');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain(
        'food trend information summarization expert',
      );
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('hallucination');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('confidence');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('localTrends');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('demographicFavorites');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('seasonalItems');
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toContain('"low"');
    });

    it('should not start or end with whitespace (trimmed)', () => {
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).toBe(
        WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN.trim(),
      );
    });

    it('should differ from Korean prompt', () => {
      expect(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN).not.toBe(
        WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO,
      );
    });
  });

  // ============================================================================
  // getWebSearchSummarySystemPrompt
  // ============================================================================

  describe('getWebSearchSummarySystemPrompt', () => {
    test.each([
      ['ko' as const, WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO],
      ['en' as const, WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN],
    ])(
      'should return correct prompt for language "%s"',
      (lang, expectedPrompt) => {
        const result = getWebSearchSummarySystemPrompt(lang);
        expect(result).toBe(expectedPrompt);
      },
    );

    it('should default to Korean when no language parameter is provided', () => {
      const result = getWebSearchSummarySystemPrompt();
      expect(result).toBe(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO);
    });

    it('should default to Korean when undefined is passed', () => {
      const result = getWebSearchSummarySystemPrompt(undefined);
      expect(result).toBe(WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO);
    });
  });

  // ============================================================================
  // buildWebSearchSummaryPrompt
  // ============================================================================

  describe('buildWebSearchSummaryPrompt', () => {
    describe('Korean language output (default)', () => {
      it('should include current year and month for Korean', () => {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain(`${currentYear}년 ${currentMonth}월`);
      });

      it('should include season in Korean based on current month', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        const validSeasons = ['봄', '여름', '가을', '겨울'];
        const hasSeason = validSeasons.some((s) => result.includes(s));
        expect(hasSeason).toBe(true);
      });

      it('should include Korean instruction text when no address provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain(
          '위 조건에 맞는 인기 음식 트렌드를 웹에서 검색하고 요약해주세요.',
        );
        expect(result).toContain('검색 쿼리 예시:');
      });

      it('should include ageGroup in Korean output when provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          '30대',
          undefined,
          'ko',
        );
        expect(result).toContain('연령대: 30대');
      });

      it('should include gender in Korean output when provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          '남성',
          'ko',
        );
        expect(result).toContain('성별: 남성');
      });

      it('should include address-based region in Korean output', () => {
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구 역삼동',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain('지역: 서울 강남구');
      });

      it('should include combined query when address, ageGroup and gender all provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구',
          '30대',
          '남성',
          'ko',
        );
        expect(result).toContain(`"서울 강남구 30대 남성 인기 음식 ${currentYear}"`);
      });

      it('should include region-only query when only address is provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '부산광역시 해운대구',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain(`"부산 해운대구 인기 맛집 ${currentYear}"`);
      });

      it('should include seasonal search query when season is present', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        const validSeasonQueries = [
          `"봄 인기 음식 ${currentYear}"`,
          `"여름 인기 음식 ${currentYear}"`,
          `"가을 인기 음식 ${currentYear}"`,
          `"겨울 인기 음식 ${currentYear}"`,
        ];
        const hasSeasonQuery = validSeasonQueries.some((q) =>
          result.includes(q),
        );
        expect(hasSeasonQuery).toBe(true);
      });

      it('should not include region line when address is not provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).not.toContain('지역:');
      });

      it('should not include ageGroup line when not provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).not.toContain('연령대:');
      });

      it('should not include gender line when not provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).not.toContain('성별:');
      });
    });

    describe('English language output', () => {
      it('should include current year and month for English', () => {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain(`${currentMonth}/${currentYear}`);
      });

      it('should include season in English based on current month', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'en',
        );
        const validSeasons = ['Spring', 'Summer', 'Fall', 'Winter'];
        const hasSeason = validSeasons.some((s) => result.includes(s));
        expect(hasSeason).toBe(true);
      });

      it('should include English instruction text when no address provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain(
          'Search the web for popular food trends matching the above criteria and summarize.',
        );
        expect(result).toContain('Example search queries:');
      });

      it('should include Age Group in English output when provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          '30s',
          undefined,
          'en',
        );
        expect(result).toContain('Age Group: 30s');
      });

      it('should include Gender in English output when provided', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          'Male',
          'en',
        );
        expect(result).toContain('Gender: Male');
      });

      it('should include address-based region in English output', () => {
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain('Region: 서울 강남구');
      });

      it('should include combined query when address, ageGroup and gender all provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구',
          '30s',
          'Male',
          'en',
        );
        expect(result).toContain(
          `"서울 강남구 30s Male popular food ${currentYear}"`,
        );
      });

      it('should include region-only query when only address is provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '부산광역시 해운대구',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain(
          `"부산 해운대구 popular restaurants ${currentYear}"`,
        );
      });

      it('should include seasonal search query in English when season is present', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'en',
        );
        const validSeasonQueries = [
          `"Spring food trends ${currentYear}"`,
          `"Summer food trends ${currentYear}"`,
          `"Fall food trends ${currentYear}"`,
          `"Winter food trends ${currentYear}"`,
        ];
        const hasSeasonQuery = validSeasonQueries.some((q) =>
          result.includes(q),
        );
        expect(hasSeasonQuery).toBe(true);
      });
    });

    describe('default language behavior', () => {
      it('should default to Korean when language is not provided', () => {
        const result = buildWebSearchSummaryPrompt();
        expect(result).toContain('위 조건에 맞는 인기 음식 트렌드를 웹에서 검색하고 요약해주세요.');
      });
    });

    describe('address region extraction', () => {
      test.each([
        ['서울특별시 강남구 역삼동', '서울 강남구'],
        ['부산광역시 해운대구 우동', '부산 해운대구'],
        ['대구광역시 중구', '대구 중구'],
        ['인천광역시 남동구', '인천 남동구'],
        ['광주광역시 서구', '광주 서구'],
        ['대전광역시 유성구', '대전 유성구'],
        ['울산광역시 남구', '울산 남구'],
        ['세종특별자치시 조치원읍', '세종 조치원읍'],
        ['경기도 수원시', '경기 수원시'],
        ['강원도 춘천시', '강원 춘천시'],
        ['충청북도 청주시', '충청북 청주시'],
        ['충청남도 천안시', '충청남 천안시'],
        ['전라북도 전주시', '전라북 전주시'],
        ['전라남도 여수시', '전라남 여수시'],
        ['경상북도 포항시', '경상북 포항시'],
        ['경상남도 창원시', '경상남 창원시'],
        ['제주특별자치도 제주시', '제주특별자치 제주시'],
      ])(
        'should extract region "%s" from full Korean address to "%s"',
        (address, expectedRegion) => {
          const result = buildWebSearchSummaryPrompt(address, undefined, undefined, 'ko');
          expect(result).toContain(`지역: ${expectedRegion}`);
        },
      );

      test.each([
        ['서울 강남구', '서울 강남구'],
        ['부산 해운대구', '부산 해운대구'],
        ['경기 수원시', '경기 수원시'],
      ])(
        'should extract region from simple Korean address "%s"',
        (address, expectedRegion) => {
          const result = buildWebSearchSummaryPrompt(address, undefined, undefined, 'ko');
          expect(result).toContain(`지역: ${expectedRegion}`);
        },
      );

      it('should extract first two words from English address', () => {
        const result = buildWebSearchSummaryPrompt(
          'New York Manhattan',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain('Region: New York');
      });

      it('should handle comma-separated English address', () => {
        const result = buildWebSearchSummaryPrompt(
          'Los Angeles, California',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain('Region: Los Angeles');
      });

      it('should handle single-word address gracefully', () => {
        const result = buildWebSearchSummaryPrompt(
          'Seoul',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain('Region: Seoul');
      });

      it('should fall back to the original address string when it produces no words', () => {
        // An address of only separator characters produces no words array entries
        // so words[0] is undefined and it falls back to the address itself
        const result = buildWebSearchSummaryPrompt(
          '---',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain('Region:');
      });

      it('should extract city-only region when Korean full address has no district', () => {
        // e.g. "서울특별시" with no following district token
        const result = buildWebSearchSummaryPrompt(
          '서울특별시',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain('지역: 서울');
      });

      it('should extract city+district from simple Korean address with district', () => {
        const result = buildWebSearchSummaryPrompt(
          '서울 마포구',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain('지역: 서울 마포구');
      });

      it('should extract city-only from simple Korean address without district', () => {
        const result = buildWebSearchSummaryPrompt(
          '부산',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain('지역: 부산');
      });
    });

    describe('season detection', () => {
      const getSeasonForMonth = (month: number, language: 'ko' | 'en'): string => {
        if (language === 'ko') {
          if (month >= 3 && month <= 5) return '봄';
          if (month >= 6 && month <= 8) return '여름';
          if (month >= 9 && month <= 11) return '가을';
          return '겨울';
        } else {
          if (month >= 3 && month <= 5) return 'Spring';
          if (month >= 6 && month <= 8) return 'Summer';
          if (month >= 9 && month <= 11) return 'Fall';
          return 'Winter';
        }
      };

      it('should include the correct season based on the current month', () => {
        const currentMonth = new Date().getMonth() + 1;
        const expectedSeason = getSeasonForMonth(currentMonth, 'ko');
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain(expectedSeason);
      });

      it('should include the correct English season based on the current month', () => {
        const currentMonth = new Date().getMonth() + 1;
        const expectedSeason = getSeasonForMonth(currentMonth, 'en');
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain(expectedSeason);
      });

      describe('season detection with mocked dates', () => {
        let getMonthSpy: jest.SpyInstance;
        let getFullYearSpy: jest.SpyInstance;

        afterEach(() => {
          jest.restoreAllMocks();
        });

        const mockMonth = (month: number): void => {
          getMonthSpy = jest
            .spyOn(Date.prototype, 'getMonth')
            .mockReturnValue(month - 1);
          getFullYearSpy = jest
            .spyOn(Date.prototype, 'getFullYear')
            .mockReturnValue(2025);
          void getMonthSpy;
          void getFullYearSpy;
        };

        test.each([
          [3, 'ko', '봄'],
          [4, 'ko', '봄'],
          [5, 'ko', '봄'],
          [6, 'ko', '여름'],
          [7, 'ko', '여름'],
          [8, 'ko', '여름'],
          [9, 'ko', '가을'],
          [10, 'ko', '가을'],
          [11, 'ko', '가을'],
          [12, 'ko', '겨울'],
          [1, 'ko', '겨울'],
          [2, 'ko', '겨울'],
        ])(
          'should return "%s" season for month %i in Korean',
          (month, language, expectedSeason) => {
            mockMonth(month);
            const result = buildWebSearchSummaryPrompt(
              undefined,
              undefined,
              undefined,
              language as 'ko' | 'en',
            );
            expect(result).toContain(expectedSeason);
          },
        );

        test.each([
          [3, 'en', 'Spring'],
          [4, 'en', 'Spring'],
          [5, 'en', 'Spring'],
          [6, 'en', 'Summer'],
          [7, 'en', 'Summer'],
          [8, 'en', 'Summer'],
          [9, 'en', 'Fall'],
          [10, 'en', 'Fall'],
          [11, 'en', 'Fall'],
          [12, 'en', 'Winter'],
          [1, 'en', 'Winter'],
          [2, 'en', 'Winter'],
        ])(
          'should return "%s" season for month %i in English',
          (month, language, expectedSeason) => {
            mockMonth(month);
            const result = buildWebSearchSummaryPrompt(
              undefined,
              undefined,
              undefined,
              language as 'ko' | 'en',
            );
            expect(result).toContain(expectedSeason);
          },
        );
      });
    });

    describe('output format', () => {
      it('should return a string', () => {
        const result = buildWebSearchSummaryPrompt();
        expect(typeof result).toBe('string');
      });

      it('should return a non-empty string', () => {
        const result = buildWebSearchSummaryPrompt();
        expect(result.length).toBeGreaterThan(0);
      });

      it('should join parts with newlines', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          '30대',
          '남성',
          'ko',
        );
        const lines = result.split('\n');
        expect(lines.length).toBeGreaterThan(1);
      });

      it('should include empty line separator before instruction text', () => {
        const result = buildWebSearchSummaryPrompt(
          undefined,
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain('\n\n위 조건에 맞는');
      });
    });

    describe('address-only query generation (no ageGroup/gender)', () => {
      it('should use address-only query format in Korean when only address provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구',
          undefined,
          undefined,
          'ko',
        );
        expect(result).toContain(`"서울 강남구 인기 맛집 ${currentYear}"`);
        expect(result).not.toContain('남성');
        expect(result).not.toContain('여성');
      });

      it('should use address-only query format in English when only address provided', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          '서울특별시 강남구',
          undefined,
          undefined,
          'en',
        );
        expect(result).toContain(`"서울 강남구 popular restaurants ${currentYear}"`);
      });
    });

    describe('no address query generation', () => {
      it('should not include address-based query when address is not provided in Korean', () => {
        const currentYear = new Date().getFullYear();
        const result = buildWebSearchSummaryPrompt(
          undefined,
          '30대',
          '남성',
          'ko',
        );
        expect(result).not.toContain('인기 맛집');
        // Address+demographic combined query should not appear without address
        expect(result).not.toContain(`30대 남성 인기 음식 ${currentYear}`);
      });
    });
  });
});
