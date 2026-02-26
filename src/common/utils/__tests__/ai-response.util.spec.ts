import { normalizeMenuNames, removeUrlsFromText } from '../ai-response.util';

describe('AI Response Utilities', () => {
  describe('normalizeMenuNames', () => {
    describe('parentheses removal', () => {
      it.each([
        [['돈카츠 (히레카츠)', '오징어제육볶음 (솥밥 포함)'], ['돈카츠', '오징어제육볶음']],
        [['돈카츠 (히레) (특대)'], ['돈카츠']],
        [['돈카츠 ()'], ['돈카츠']],
        [['(부가설명만)'], []],
        [['Pizza   (Large)  Special'], ['pizza special']],
      ])(
        'should normalize parentheses in %j to %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );

      it('should handle nested parentheses leaving outer closing paren', () => {
        expect(normalizeMenuNames(['메뉴 ((특별))'])).toEqual(['메뉴 )']);
      });
    });

    describe('Korean menu normalization (removes spaces)', () => {
      it.each([
        [['김치 찌개', '된장 찌개'], ['김치찌개', '된장찌개']],
        [['김치 찌개', '된장 국'], ['김치찌개', '된장국']],
        [['치킨 (Fried)', 'Pasta (파스타)'], ['치킨', 'pasta']],
      ])(
        'should remove spaces from Korean names: %j -> %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );
    });

    describe('English menu normalization (lowercase)', () => {
      it.each([
        [['Tonkatsu', 'BIBIMBAP'], ['tonkatsu', 'bibimbap']],
        [['BURGER', 'Pizza', 'SUSHI'], ['burger', 'pizza', 'sushi']],
        [['Fried Chicken', 'Cheese Pizza'], ['fried chicken', 'cheese pizza']],
      ])(
        'should convert English names to lowercase: %j -> %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );
    });

    describe('mixed language names returned as-is', () => {
      it.each([
        [['김치 Fried Rice'], ['김치 Fried Rice']],
        [['김치찌개1', '돈카츠-세트'], ['김치찌개1', '돈카츠-세트']],
      ])(
        'should return mixed-language name as-is: %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );
    });

    describe('duplicate removal', () => {
      it('should remove duplicates from input', () => {
        expect(normalizeMenuNames(['돈카츠', '돈카츠 (히레)', '돈카츠'])).toEqual(['돈카츠']);
      });

      it('should remove duplicates after space normalization', () => {
        expect(normalizeMenuNames(['김치 찌개', '김치찌개', '김치  찌개'])).toEqual(['김치찌개']);
      });

      it('should preserve insertion order while removing duplicates', () => {
        const result = normalizeMenuNames(['돈카츠', '김치찌개', '된장찌개', '돈카츠', '김치찌개']);
        expect(result).toEqual(['돈카츠', '김치찌개', '된장찌개']);
      });
    });

    describe('empty/falsy input', () => {
      it('should return empty array for empty input', () => {
        expect(normalizeMenuNames([])).toEqual([]);
      });

      it('should filter out empty strings after normalization', () => {
        const result = normalizeMenuNames(['()', '  ', '돈카츠']);
        expect(result).toEqual(['돈카츠']);
        expect(result).not.toContain('');
      });
    });

    describe('slash and comma separator handling', () => {
      it.each([
        [['돼지/소 숯불고기', '파스타'], ['돼지', '파스타']],
        [['Chicken/Pizza Special', 'Pasta'], ['chicken', 'pasta']],
        [['김치/Kimchi Fried Rice'], ['김치']],
        [['돼지   /   소 고기'], ['돼지']],
      ])(
        'should extract first part from slash-separated name: %j -> %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );

      it.each([
        [['된장찌개, 김치찌개'], ['된장찌개']],
        [['Burger, Fries'], ['burger']],
        [['된장   ,   김치'], ['된장']],
      ])(
        'should extract first part from comma-separated name: %j -> %j',
        (input, expected) => {
          expect(normalizeMenuNames(input)).toEqual(expected);
        },
      );

      it('should process slash before comma (slash has priority)', () => {
        expect(normalizeMenuNames(['치킨/피자', '된장, 김치'])).toEqual(['치킨', '된장']);
      });

      it('should apply parentheses removal after slash split', () => {
        expect(normalizeMenuNames(['치킨/피자 (2인분)'])).toEqual(['치킨']);
      });

      it('should remove duplicates after separator processing', () => {
        // '돼지/소 고기' -> '돼지', '돼지고기' stays, '돼지 고기' -> '돼지고기'
        expect(normalizeMenuNames(['돼지/소 고기', '돼지고기', '돼지 고기'])).toEqual([
          '돼지',
          '돼지고기',
        ]);
      });
    });
  });

  describe('removeUrlsFromText', () => {
    describe('markdown link handling', () => {
      it.each([
        [
          '[bromance.tistory.com](https://bromance.tistory.com/123)',
          'bromance.tistory.com',
        ],
        [
          '맛있는 메뉴는 [여기](https://example.com)에서 확인',
          '맛있는 메뉴는 여기에서 확인',
        ],
        [
          '[링크](https://example.com/path?query=1&key=value#section)',
          '링크',
        ],
        ['[시작](https://example.com) 나머지 텍스트', '시작 나머지 텍스트'],
        ['텍스트 끝 [링크](https://example.com)', '텍스트 끝 링크'],
      ])(
        'should convert markdown link to text only: %j -> %j',
        (input, expected) => {
          expect(removeUrlsFromText(input)).toBe(expected);
        },
      );

      it('should handle multiple markdown links in one string', () => {
        expect(
          removeUrlsFromText('참고: [사이트1](https://a.com)과 [사이트2](https://b.com)'),
        ).toBe('참고: 사이트1과 사이트2');
      });

      it('should not match markdown link with empty bracket text', () => {
        // Regex requires at least one character; empty brackets are not removed
        expect(removeUrlsFromText('[](https://example.com) 텍스트')).toBe('[]() 텍스트');
      });
    });

    describe('standalone URL handling', () => {
      it.each([
        ['자세한 내용은 http://example.com 참고', '자세한 내용은 참고'],
        ['자세한 내용은 https://example.com/path?query=1 참고', '자세한 내용은 참고'],
        ['검색 https://example.com/search?q=test&page=1 결과', '검색 결과'],
        ['내용 https://example.com/page#section 보기', '내용 보기'],
        ['https://example.com 참고하세요', '참고하세요'],
        ['자세한 내용: https://example.com', '자세한 내용:'],
      ])(
        'should remove standalone URL: %j -> %j',
        (input, expected) => {
          expect(removeUrlsFromText(input)).toBe(expected);
        },
      );

      it('should remove multiple standalone URLs', () => {
        expect(
          removeUrlsFromText('첫번째 https://first.com 두번째 http://second.com 세번째'),
        ).toBe('첫번째 두번째 세번째');
      });
    });

    describe('mixed cases', () => {
      it('should handle mixed markdown links and standalone URLs', () => {
        expect(removeUrlsFromText('[링크](https://a.com) 그리고 https://b.com 참고')).toBe(
          '링크 그리고 참고',
        );
      });

      it('should handle multiple types of URLs in one text', () => {
        expect(
          removeUrlsFromText(
            '[마크다운](https://markdown.com) 텍스트 http://plain.com 그리고 https://secure.com',
          ),
        ).toBe('마크다운 텍스트 그리고');
      });

      it('should handle URLs in Korean sentences', () => {
        expect(
          removeUrlsFromText(
            '맛집 정보는 [여기](https://place.com)에서 확인하거나 https://other.com을 참고하세요.',
          ),
        ).toBe('맛집 정보는 여기에서 확인하거나 참고하세요.');
      });
    });

    describe('edge cases', () => {
      it.each([
        ['', ''],
        ['이것은 일반 텍스트입니다.', '이것은 일반 텍스트입니다.'],
        ['이메일 test@example.com 연락처', '이메일 test@example.com 연락처'],
        ['[링크](https://example.com)', '링크'],
        ['https://example.com', ''],
        ['   https://example.com   ', ''],
        [
          '내용 https://example.com/very/long/path?p1=v1&p2=v2#section 끝',
          '내용 끝',
        ],
        ['https://first.com https://second.com https://third.com 텍스트', '텍스트'],
      ])(
        'should handle edge case input %j -> %j',
        (input, expected) => {
          expect(removeUrlsFromText(input)).toBe(expected);
        },
      );

      it('should collapse consecutive spaces left after URL removal', () => {
        const result = removeUrlsFromText('앞   https://example.com   뒤');
        expect(result).toBe('앞 뒤');
        expect(result).not.toContain('  ');
      });

      it('should collapse spaces when multiple URLs are removed', () => {
        expect(
          removeUrlsFromText('단어1  https://example.com  단어2  http://another.com  단어3'),
        ).toBe('단어1 단어2 단어3');
      });
    });
  });
});
