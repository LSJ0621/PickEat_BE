import { UrlCitationAnnotation } from '@/external/openai/openai.types';
import {
  removeCitationsFromText,
  normalizeMenuNames,
  removeUrlsFromText,
} from '../ai-response.util';

describe('AI Response Utilities', () => {
  describe('removeCitationsFromText', () => {
    it('should remove citations using annotation indexes', () => {
      // Arrange
      const text = '맛있습니다 ([site](https://example.com)) 추천드립니다';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 6,
          end_index: 36,
          url: 'https://example.com',
          title: 'site',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('맛있습니다 추천드립니다');
    });

    it('should remove multiple citations correctly', () => {
      // Arrange
      const text =
        '첫번째 ([link1](https://example1.com)) 두번째 ([link2](https://example2.com)) 세번째';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 4,
          end_index: 35,
          url: 'https://example1.com',
          title: 'link1',
        },
        {
          type: 'url_citation',
          start_index: 40,
          end_index: 71,
          url: 'https://example2.com',
          title: 'link2',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('첫번째 두번째 세번째');
    });

    it('should remove multiple overlapping citations in correct order', () => {
      // Arrange
      const text =
        'Start ([first](https://one.com)) middle ([second](https://two.com)) end';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 6,
          end_index: 32,
          url: 'https://one.com',
          title: 'first',
        },
        {
          type: 'url_citation',
          start_index: 40,
          end_index: 67,
          url: 'https://two.com',
          title: 'second',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('Start middle end');
    });

    it('should return original text when annotations is empty', () => {
      // Arrange
      const text = '원본 텍스트';
      const annotations: UrlCitationAnnotation[] = [];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('원본 텍스트');
    });

    it('should handle null annotations', () => {
      // Arrange
      const text = '원본 텍스트';
      const annotations = null as unknown as UrlCitationAnnotation[];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('원본 텍스트');
    });

    it('should handle undefined annotations', () => {
      // Arrange
      const text = '원본 텍스트';
      const annotations = undefined as unknown as UrlCitationAnnotation[];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('원본 텍스트');
    });

    it('should clean up consecutive spaces after citation removal', () => {
      // Arrange
      const text = 'Before   ([citation](https://example.com))   after';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 9,
          end_index: 42,
          url: 'https://example.com',
          title: 'citation',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('Before after');
      expect(result).not.toContain('  '); // No consecutive spaces
    });

    it('should trim leading and trailing spaces', () => {
      // Arrange
      const text = '   ([citation](https://example.com))   ';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 3,
          end_index: 36,
          url: 'https://example.com',
          title: 'citation',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('');
    });

    it('should handle citation at the beginning of text', () => {
      // Arrange
      const text = '([citation](https://example.com)) 나머지 텍스트';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 0,
          end_index: 33,
          url: 'https://example.com',
          title: 'citation',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('나머지 텍스트');
    });

    it('should handle citation at the end of text', () => {
      // Arrange
      const text = '텍스트 내용 ([citation](https://example.com))';
      const annotations: UrlCitationAnnotation[] = [
        {
          type: 'url_citation',
          start_index: 7,
          end_index: 40,
          url: 'https://example.com',
          title: 'citation',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('텍스트 내용');
    });

    it('should handle empty text', () => {
      // Arrange
      const text = '';
      const annotations: UrlCitationAnnotation[] = [];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('');
    });

    it('should preserve text when annotation type is not url_citation', () => {
      // Arrange
      const text = '텍스트 ([link](https://example.com))';
      const annotations = [
        {
          type: 'other_type' as 'url_citation',
          start_index: 4,
          end_index: 32,
          url: 'https://example.com',
          title: 'link',
        },
      ];

      // Act
      const result = removeCitationsFromText(text, annotations);

      // Assert
      expect(result).toBe('텍스트 ([link](https://example.com))');
    });
  });

  describe('normalizeMenuNames', () => {
    it('should remove parentheses from menu names', () => {
      // Arrange
      const input = ['돈카츠 (히레카츠)', '오징어제육볶음 (솥밥 포함)'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠', '오징어제육볶음']);
    });

    it('should remove spaces from Korean menu names', () => {
      // Arrange
      const input = ['김치 찌개', '된장 찌개'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['김치찌개', '된장찌개']);
    });

    it('should convert English menu names to lowercase', () => {
      // Arrange
      const input = ['Tonkatsu', 'BIBIMBAP'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['tonkatsu', 'bibimbap']);
    });

    it('should remove duplicate menu names', () => {
      // Arrange
      const input = ['돈카츠', '돈카츠 (히레)', '돈카츠'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠']);
    });

    it('should handle empty array', () => {
      // Arrange
      const input: string[] = [];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle mixed language menu names (returns as-is)', () => {
      // Arrange
      const input = ['김치 Fried Rice'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['김치 Fried Rice']);
    });

    it('should filter out empty strings after normalization', () => {
      // Arrange
      const input = ['()', '  ', '돈카츠'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠']);
      expect(result).not.toContain('');
    });

    it('should handle multiple parentheses in single menu name', () => {
      // Arrange
      const input = ['돈카츠 (히레) (특대)'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠']);
    });

    it('should clean up consecutive spaces after parentheses removal', () => {
      // Arrange
      const input = ['Pizza   (Large)  Special'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['pizza special']);
    });

    it('should handle Korean menu with numbers and special characters', () => {
      // Arrange
      const input = ['김치찌개1', '돈카츠-세트'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      // Mixed content (not pure Korean), returned as-is
      expect(result).toEqual(['김치찌개1', '돈카츠-세트']);
    });

    it('should handle English menu with spaces correctly', () => {
      // Arrange
      const input = ['Fried Chicken', 'Cheese Pizza'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['fried chicken', 'cheese pizza']);
    });

    it('should remove duplicates after normalization', () => {
      // Arrange
      const input = ['김치 찌개', '김치찌개', '김치  찌개'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['김치찌개']);
    });

    it('should handle only parentheses content', () => {
      // Arrange
      const input = ['(부가설명만)', '돈카츠'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠']);
    });

    it('should handle mixed Korean and English with parentheses', () => {
      // Arrange
      const input = ['치킨 (Fried)', 'Pasta (파스타)'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      // Mixed content (not pure Korean/English), normalized but case adjusted
      expect(result).toEqual(['치킨', 'pasta']);
    });

    it('should preserve order while removing duplicates', () => {
      // Arrange
      const input = ['돈카츠', '김치찌개', '된장찌개', '돈카츠', '김치찌개'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠', '김치찌개', '된장찌개']);
      expect(result[0]).toBe('돈카츠');
      expect(result[1]).toBe('김치찌개');
    });

    it('should normalize English menus to lowercase', () => {
      // Arrange
      const input = ['BURGER', 'Pizza', 'SUSHI'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['burger', 'pizza', 'sushi']);
    });

    it('should handle Korean menus by removing spaces', () => {
      // Arrange
      const input = ['김치 찌개', '된장 국'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['김치찌개', '된장국']);
    });

    it('should handle empty parentheses', () => {
      // Arrange
      const input = ['돈카츠 ()', '김치찌개'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      expect(result).toEqual(['돈카츠', '김치찌개']);
    });

    it('should handle nested parentheses', () => {
      // Arrange
      const input = ['메뉴 ((특별))'];

      // Act
      const result = normalizeMenuNames(input);

      // Assert
      // Regex removes matching pairs, but nested may leave remnants
      // The implementation removes \([^)]*\) which handles single level
      // After removing (특별), leaves '메뉴 )', then space is preserved
      expect(result).toEqual(['메뉴 )']);
    });

    describe('slash and comma handling', () => {
      it('should extract first menu from slash-separated names', () => {
        // Arrange
        const input = ['돼지/소 숯불고기', '파스타'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        // Split by '/', takes first part '돼지', removes spaces -> '돼지'
        expect(result).toEqual(['돼지', '파스타']);
      });

      it('should extract first menu from comma-separated names', () => {
        // Arrange
        const input = ['된장찌개, 김치찌개'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['된장찌개']);
      });

      it('should handle menu name with parentheses and slash', () => {
        // Arrange
        const input = ['치킨/피자 (2인분)'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['치킨']);
      });

      it('should handle slash in English menu names', () => {
        // Arrange
        const input = ['Chicken/Pizza Special', 'Pasta'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        // Split by '/', takes first part 'Chicken' -> lowercase 'chicken'
        expect(result).toEqual(['chicken', 'pasta']);
      });

      it('should handle comma in English menu names', () => {
        // Arrange
        const input = ['Burger, Fries'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['burger']);
      });

      it('should handle both slash and comma in same input', () => {
        // Arrange
        const input = ['치킨/피자', '된장, 김치'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['치킨', '된장']);
      });

      it('should handle slash with multiple spaces', () => {
        // Arrange
        const input = ['돼지   /   소 고기'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['돼지']);
      });

      it('should handle comma with multiple spaces', () => {
        // Arrange
        const input = ['된장   ,   김치'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        expect(result).toEqual(['된장']);
      });

      it('should handle slash, comma and parentheses together', () => {
        // Arrange
        const input = ['치킨/피자 (세트), 버거'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        // First splits by '/', takes '치킨/피자 (세트)'
        // Then splits by ',', takes '치킨/피자 (세트)'
        // Wait, no - it processes '치킨/피자 (세트), 버거' first
        // Actually the logic is: split by '/' first, take first part
        // So becomes '치킨'
        // Then check for comma in '치킨'
        // Then remove parentheses from '치킨'
        expect(result).toEqual(['치킨']);
      });

      it('should handle mixed language with slash', () => {
        // Arrange
        const input = ['김치/Kimchi Fried Rice'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        // Takes first part before slash: '김치'
        expect(result).toEqual(['김치']);
      });

      it('should remove duplicates after slash/comma processing', () => {
        // Arrange
        const input = ['돼지/소 고기', '돼지고기', '돼지 고기'];

        // Act
        const result = normalizeMenuNames(input);

        // Assert
        // '돼지/소 고기' -> split by '/' -> '돼지' -> '돼지'
        // '돼지고기' -> '돼지고기'
        // '돼지 고기' -> remove spaces -> '돼지고기'
        // After duplicate removal: ['돼지', '돼지고기'] (different values)
        expect(result).toEqual(['돼지', '돼지고기']);
      });
    });
  });

  describe('removeUrlsFromText', () => {
    describe('markdown link handling', () => {
      it('should convert markdown link to text only', () => {
        // Arrange
        const input =
          '[bromance.tistory.com](https://bromance.tistory.com/123)';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('bromance.tistory.com');
      });

      it('should handle multiple markdown links', () => {
        // Arrange
        const input =
          '참고: [사이트1](https://a.com)과 [사이트2](https://b.com)';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('참고: 사이트1과 사이트2');
      });

      it('should handle markdown link with Korean text', () => {
        // Arrange
        const input = '맛있는 메뉴는 [여기](https://example.com)에서 확인';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('맛있는 메뉴는 여기에서 확인');
      });

      it('should handle markdown link with special characters in URL', () => {
        // Arrange
        const input =
          '[링크](https://example.com/path?query=1&key=value#section)';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('링크');
      });

      it('should handle markdown link at beginning of text', () => {
        // Arrange
        const input = '[시작](https://example.com) 나머지 텍스트';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('시작 나머지 텍스트');
      });

      it('should handle markdown link at end of text', () => {
        // Arrange
        const input = '텍스트 끝 [링크](https://example.com)';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('텍스트 끝 링크');
      });
    });

    describe('standalone URL handling', () => {
      it('should remove standalone http URL', () => {
        // Arrange
        const input = '자세한 내용은 http://example.com 참고';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('자세한 내용은 참고');
      });

      it('should remove standalone https URL', () => {
        // Arrange
        const input = '자세한 내용은 https://example.com/path?query=1 참고';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('자세한 내용은 참고');
      });

      it('should remove multiple standalone URLs', () => {
        // Arrange
        const input =
          '첫번째 https://first.com 두번째 http://second.com 세번째';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('첫번째 두번째 세번째');
      });

      it('should remove URL with query parameters', () => {
        // Arrange
        const input = '검색 https://example.com/search?q=test&page=1 결과';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('검색 결과');
      });

      it('should remove URL with hash fragment', () => {
        // Arrange
        const input = '내용 https://example.com/page#section 보기';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('내용 보기');
      });

      it('should remove URL at beginning of text', () => {
        // Arrange
        const input = 'https://example.com 참고하세요';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('참고하세요');
      });

      it('should remove URL at end of text', () => {
        // Arrange
        const input = '자세한 내용: https://example.com';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('자세한 내용:');
      });
    });

    describe('mixed cases', () => {
      it('should handle mixed markdown links and URLs', () => {
        // Arrange
        const input = '[링크](https://a.com) 그리고 https://b.com 참고';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('링크 그리고 참고');
      });

      it('should handle multiple types of URLs in single text', () => {
        // Arrange
        const input =
          '[마크다운](https://markdown.com) 텍스트 http://plain.com 그리고 https://secure.com';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('마크다운 텍스트 그리고');
      });

      it('should handle URLs in Korean sentences', () => {
        // Arrange
        const input =
          '맛집 정보는 [여기](https://place.com)에서 확인하거나 https://other.com을 참고하세요.';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        // The URL 'https://other.com' and Korean particle '을' together get removed
        // because the URL regex captures up to whitespace, removing '을' as well
        expect(result).toBe('맛집 정보는 여기에서 확인하거나 참고하세요.');
      });
    });

    describe('edge cases', () => {
      it('should return empty string for empty input', () => {
        // Arrange
        const input = '';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('');
      });

      it('should return original text if no URLs', () => {
        // Arrange
        const input = '이것은 일반 텍스트입니다.';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('이것은 일반 텍스트입니다.');
      });

      it('should clean up consecutive whitespace', () => {
        // Arrange
        const input = '앞   https://example.com   뒤';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('앞 뒤');
        expect(result).not.toContain('  '); // No consecutive spaces
      });

      it('should trim leading and trailing whitespace', () => {
        // Arrange
        const input = '   https://example.com   ';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('');
      });

      it('should handle only markdown link', () => {
        // Arrange
        const input = '[링크](https://example.com)';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('링크');
      });

      it('should handle only standalone URL', () => {
        // Arrange
        const input = 'https://example.com';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('');
      });

      it('should handle text with URL-like but not URL patterns', () => {
        // Arrange
        const input = '이메일 test@example.com 연락처';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('이메일 test@example.com 연락처');
      });

      it('should handle very long URLs', () => {
        // Arrange
        const input =
          '내용 https://example.com/very/long/path/with/many/segments?param1=value1&param2=value2&param3=value3#section 끝';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('내용 끝');
      });

      it('should handle multiple consecutive URLs', () => {
        // Arrange
        const input =
          'https://first.com https://second.com https://third.com 텍스트';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('텍스트');
      });

      it('should clean up spaces when URLs are removed', () => {
        // Arrange
        const input =
          '단어1  https://example.com  단어2  http://another.com  단어3';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        expect(result).toBe('단어1 단어2 단어3');
      });

      it('should handle markdown link with empty text', () => {
        // Arrange
        const input = '[](https://example.com) 텍스트';

        // Act
        const result = removeUrlsFromText(input);

        // Assert
        // The regex \[([^\]]+)\] requires at least one character between brackets
        // So empty brackets [] don't match, but the URL part still gets removed
        expect(result).toBe('[]() 텍스트');
      });
    });
  });
});
