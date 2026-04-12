import { parseLanguage, detectLanguage } from '../../utils/language.util';

describe('language.util', () => {
  describe('parseLanguage', () => {
    it('"en" 입력이면 "en"을 반환한다', () => {
      expect(parseLanguage('en')).toBe('en');
    });

    it('"ko" 입력이면 "ko"를 반환한다', () => {
      expect(parseLanguage('ko')).toBe('ko');
    });

    it('null이면 기본값 "ko"를 반환한다', () => {
      expect(parseLanguage(null)).toBe('ko');
    });

    it('undefined이면 기본값 "ko"를 반환한다', () => {
      expect(parseLanguage(undefined)).toBe('ko');
    });

    it('알 수 없는 문자열이면 기본값 "ko"를 반환한다', () => {
      expect(parseLanguage('fr')).toBe('ko');
      expect(parseLanguage('ja')).toBe('ko');
      expect(parseLanguage('')).toBe('ko');
    });
  });

  describe('detectLanguage', () => {
    it('한국어 텍스트면 "ko"를 반환한다', () => {
      expect(detectLanguage('안녕하세요')).toBe('ko');
      expect(detectLanguage('김치찌개 먹고 싶다')).toBe('ko');
    });

    it('영어 텍스트면 "en"을 반환한다', () => {
      expect(detectLanguage('hello world')).toBe('en');
      expect(detectLanguage('I want pizza')).toBe('en');
    });

    it('빈 문자열이면 기본값 "ko"를 반환한다', () => {
      expect(detectLanguage('')).toBe('ko');
    });

    it('공백만 있으면 기본값 "ko"를 반환한다', () => {
      expect(detectLanguage('   ')).toBe('ko');
    });

    it('숫자/특수문자만 있으면 기본값 "ko"를 반환한다', () => {
      expect(detectLanguage('12345!@#')).toBe('ko');
    });

    it('한영 혼합에서 영문이 더 많으면 "en"을 반환한다', () => {
      expect(detectLanguage('hello 안녕 world nice')).toBe('en');
    });

    it('한영 혼합에서 한글이 더 많으면 "ko"를 반환한다', () => {
      expect(detectLanguage('안녕하세요 hi')).toBe('ko');
    });
  });
});
