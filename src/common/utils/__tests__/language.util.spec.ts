import { detectLanguage, parseLanguage } from '../language.util';

describe('language.util', () => {
  describe('parseLanguage', () => {
    it('should return "en" when input is "en"', () => {
      expect(parseLanguage('en')).toBe('en');
    });

    it('should return "ko" when input is "ko"', () => {
      expect(parseLanguage('ko')).toBe('ko');
    });

    it('should return "ko" for undefined input', () => {
      expect(parseLanguage(undefined)).toBe('ko');
    });

    it('should return "ko" for null input', () => {
      expect(parseLanguage(null)).toBe('ko');
    });

    it('should return "ko" for invalid language codes', () => {
      expect(parseLanguage('fr')).toBe('ko');
      expect(parseLanguage('es')).toBe('ko');
      expect(parseLanguage('invalid')).toBe('ko');
    });

    it('should return "ko" for empty string', () => {
      expect(parseLanguage('')).toBe('ko');
    });
  });

  describe('detectLanguage', () => {
    describe('English detection', () => {
      it('should return English for English text', () => {
        expect(detectLanguage('I want something light')).toBe('en');
      });

      it('should return English when English chars > Korean chars', () => {
        expect(detectLanguage('I want 김치찌개 today please')).toBe('en');
      });

      it('should return English for pure English sentence', () => {
        expect(detectLanguage('What should I eat for lunch today?')).toBe('en');
      });

      it('should return English for English sentence with numbers', () => {
        expect(detectLanguage('I need 3 menu recommendations')).toBe('en');
      });

      it('should return English when English chars > Korean chars (3 vs 2)', () => {
        expect(detectLanguage('abc가나')).toBe('en');
      });
    });

    describe('Korean detection', () => {
      it('should return Korean for Korean text', () => {
        expect(detectLanguage('가벼운 거 먹고 싶어')).toBe('ko');
      });

      it('should return Korean when Korean chars > English chars', () => {
        expect(detectLanguage('오늘 pizza 먹을까')).toBe('ko');
      });

      it('should return Korean for pure Korean sentence', () => {
        expect(detectLanguage('오늘 점심으로 뭘 먹을까요?')).toBe('ko');
      });

      it('should detect Hangul Jamo (ㅋㅋㅋ) as Korean', () => {
        expect(detectLanguage('ㅋㅋㅋ 배고파')).toBe('ko');
      });

      it('should detect pure Hangul Jamo as Korean', () => {
        expect(detectLanguage('ㅋㅋㅋㅋㅋ')).toBe('ko');
      });

      it('should return Korean for Korean sentence with numbers', () => {
        expect(detectLanguage('3가지 메뉴 추천해줘')).toBe('ko');
      });

      it('should return Korean when Korean and English chars are equal (2 each)', () => {
        expect(detectLanguage('ab가나')).toBe('ko');
      });
    });

    describe('Edge cases and defaults', () => {
      it('should return Korean for empty string (default)', () => {
        expect(detectLanguage('')).toBe('ko');
      });

      it('should return Korean for whitespace only', () => {
        expect(detectLanguage('   ')).toBe('ko');
      });

      it('should return Korean for whitespace with newlines', () => {
        expect(detectLanguage(' \n \t ')).toBe('ko');
      });

      it('should return Korean for numbers/special chars only', () => {
        expect(detectLanguage('123!@#')).toBe('ko');
      });

      it('should return Korean for special characters only', () => {
        expect(detectLanguage('!@#$%^&*()')).toBe('ko');
      });

      it('should return Korean for numbers only', () => {
        expect(detectLanguage('1234567890')).toBe('ko');
      });
    });

    describe('Complex mixed cases', () => {
      it('should handle Korean sentence with short English brand name (Korean wins)', () => {
        // 'KFC' = 3 English chars, '가고 싶어요' = 5 Korean chars
        // Korean > English, so result is Korean
        expect(detectLanguage('KFC 가고 싶어요')).toBe('ko');
      });

      it('should handle Korean with longer English brand name (English wins)', () => {
        // 'McDonald' = 8 English chars, '가고 싶어요' = 5 Korean chars
        // English > Korean, so result is English
        expect(detectLanguage('McDonald 가고 싶어요')).toBe('en');
      });

      it('should handle English with Korean menu names', () => {
        expect(detectLanguage('I really want to eat 불고기 and 비빔밥')).toBe(
          'en',
        );
      });

      it('should handle multiple Korean Jamo characters', () => {
        expect(detectLanguage('ㅎㅎㅎ ㅋㅋㅋ')).toBe('ko');
      });

      it('should handle Korean with emojis', () => {
        expect(detectLanguage('배고파 😋')).toBe('ko');
      });

      it('should handle English with emojis', () => {
        expect(detectLanguage('I am hungry 😋')).toBe('en');
      });

      it('should handle mixed text with more English', () => {
        expect(detectLanguage('Hello world 안녕')).toBe('en');
      });

      it('should handle mixed text with more Korean', () => {
        expect(detectLanguage('안녕하세요 hello')).toBe('ko');
      });
    });

    describe('Service region default behavior', () => {
      it('should default to Korean for ambiguous input (service primarily targets Korean regions)', () => {
        expect(detectLanguage('')).toBe('ko');
        expect(detectLanguage('   ')).toBe('ko');
        expect(detectLanguage('123')).toBe('ko');
      });

      it('should treat equal character count as Korean (tie-breaker for Korean region)', () => {
        expect(detectLanguage('ab가나')).toBe('ko');
      });
    });
  });
});
